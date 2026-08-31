import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notifyUpload } from '@/lib/discord'
import { MAX_UPLOAD_BYTES, headObjectSize } from '@/lib/s3'
import { verifyUploadToken } from '@/lib/upload-token'
import { S3_KEY_ALREADY_USED } from '@/lib/upload-guard'
import { ACTIVE_DOCUMENT_NOT_FOUND, activeDocumentWhere } from '@/lib/trash'
import { retitleOnReupload } from '@/lib/title'
import {
  nextVersionNo,
  toChangeNote,
  versionCreateFailure,
  versionCreateSchema,
} from '@/lib/version-create'

export const dynamic = 'force-dynamic'

/**
 * 재업로드. S3 업로드가 끝난 뒤 호출되고 DocumentVersion 을 더한다. Document 본체는
 * 제목을 빼면 그대로다 — 자동 생성된 제목만 새 파일명을 따라간다 (retitleOnReupload).
 * 앞 세 단계(토큰·객체·크기)는 문서 생성(route.ts)과 같은 순서다 — 같은 presign 을 쓰기 때문이다.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const parsed = versionCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { s3Key, keyToken, fileName, mimeType, changeNote } = parsed.data

  // ① 이 키가 우리가 이 사용자에게 발급한 것인가.
  if (!(await verifyUploadToken(keyToken, s3Key, session.id))) {
    return NextResponse.json({ error: '업로드 정보가 만료되었거나 올바르지 않습니다.' }, { status: 400 })
  }

  // ①-2 이 키로 이미 버전이 만들어졌는가. keyToken 은 검증돼도 소모되지 않아
  //     (upload-token.ts) 5분간 재사용할 수 있다. 여기서 끊지 않으면 같은 객체를
  //     가리키는 버전이 생기고, 영구삭제가 남의 파일까지 지울 뻔한 상황이 된다.
  const used = await prisma.documentVersion.findFirst({
    where: { s3Key },
    select: { id: true },
  })
  if (used) {
    return NextResponse.json({ error: S3_KEY_ALREADY_USED }, { status: 400 })
  }

  // ② 객체가 실제로 올라갔는가. 크기는 클라이언트 신고값 대신 여기서 얻는다.
  const sizeBytes = await headObjectSize(s3Key)
  if (sizeBytes === null) {
    return NextResponse.json({ error: '업로드된 파일을 찾을 수 없습니다.' }, { status: 400 })
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `파일이 너무 큽니다. (최대 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)` },
      { status: 400 },
    )
  }

  const { id } = await params

  // ③ 다음 번호는 "최신 + 1"이다. 활성 문서만 보므로 없는 문서와 휴지통 문서가 함께 걸린다.
  const latest = await prisma.documentVersion.findFirst({
    where: { documentId: id, document: activeDocumentWhere() },
    orderBy: { versionNo: 'desc' },
    // fileName·title 도 같이 집는다 — 제목을 따라가게 할지 판정하는 데 쓴다.
    // 별도 쿼리를 내지 않으려고 여기에 얹었다 (커넥션 상한이 5다).
    select: { versionNo: true, fileName: true, document: { select: { title: true } } },
  })
  if (!latest) {
    return NextResponse.json({ error: ACTIVE_DOCUMENT_NOT_FOUND }, { status: 404 })
  }

  const versionNo = nextVersionNo(latest.versionNo)
  const note = toChangeNote(changeNote)
  // null 이면 제목을 건드리지 않는다 (사람이 고친 제목이거나 바뀔 것이 없다).
  const nextTitle = retitleOnReupload(latest.document.title, latest.fileName, fileName)

  // 여기까지 오는 사이 남이 같은 번호를 올리거나 문서를 지울 수 있다. 락 대신
  // @@unique([documentId, versionNo]) 와 where 의 deletedAt 이 그 창을 막고,
  // 결과는 P2002/P2025 로 온다 — 트랜잭션 없이 커넥션 하나로 끝난다.
  let document: { id: string; title: string }
  try {
    document = await prisma.document.update({
      // activeDocumentWhere() 와 같은 조건. update 는 WhereUniqueInput 이라 spread 하면
      // id 타입이 StringFilter 로 넓어져 컴파일되지 않는다.
      where: { id, deletedAt: null },
      // documentVersion.create 로 만들면 부모에 UPDATE 가 안 나가 @updatedAt 이 멈춰
      // 목록(최근 수정순)에서 재업로드한 문서가 올라오지 않는다.
      data: {
        ...(nextTitle ? { title: nextTitle } : {}),
        versions: {
          create: {
            versionNo,
            s3Key,
            fileName,
            mimeType,
            sizeBytes,
            changeNote: note,
            uploadedById: session.id,
          },
        },
      },
      select: { id: true, title: true },
    })
  } catch (err) {
    const failure = versionCreateFailure(err)
    if (!failure) throw err
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }

  // 알림 실패가 이미 저장된 버전을 되돌리지 않는다. notifyUpload 는 fetch 만 삼키므로
  // 그 바깥에서 나는 예외는 여기서 잡아야 한다.
  try {
    await notifyUpload({
      documentId: document.id,
      title: document.title,
      versionNo,
      fileName,
      uploaderName: session.username,
      changeNote: note,
    })
  } catch (err) {
    console.error('디스코드 알림 실패:', err)
  }

  return NextResponse.json({ id: document.id, versionNo }, { status: 201 })
}
