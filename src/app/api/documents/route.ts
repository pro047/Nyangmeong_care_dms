import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notifyUpload } from '@/lib/discord'
import { MAX_UPLOAD_BYTES, headObjectSize } from '@/lib/s3'
import { verifyUploadToken } from '@/lib/upload-token'
import { TITLE_MAX_LENGTH } from '@/lib/title'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  title: z.string().min(1).max(TITLE_MAX_LENGTH),
  description: z.string().max(2000).optional(),
  folderId: z.string().optional(),
  s3Key: z.string().min(1),
  // presign 이 함께 내려준 표. 이게 있어야 s3Key 를 믿을 수 있다 (upload-token.ts).
  keyToken: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
})

/** S3 업로드가 끝난 뒤 호출된다. 문서와 첫 버전(v1)을 함께 만든다. */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { title, description, folderId, ...file } = parsed.data

  // ① 이 키가 우리가 이 사용자에게 발급한 것인가.
  if (!(await verifyUploadToken(file.keyToken, file.s3Key, session.id))) {
    return NextResponse.json({ error: '업로드 정보가 만료되었거나 올바르지 않습니다.' }, { status: 400 })
  }

  // ② 객체가 실제로 올라갔는가. 겸사겸사 크기를 여기서 얻는다 — 클라이언트 신고값은
  //    presigned PUT 에 서명돼 있지 않아 실제와 다를 수 있다.
  const sizeBytes = await headObjectSize(file.s3Key)
  if (sizeBytes === null) {
    return NextResponse.json({ error: '업로드된 파일을 찾을 수 없습니다.' }, { status: 400 })
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `파일이 너무 큽니다. (최대 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)` },
      { status: 400 },
    )
  }

  const document = await prisma.document.create({
    data: {
      title,
      description,
      folderId,
      createdById: session.id,
      versions: {
        create: {
          versionNo: 1,
          s3Key: file.s3Key,
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes,
          uploadedById: session.id,
        },
      },
    },
    select: { id: true, title: true },
  })

  // 알림 실패가 업로드를 되돌리면 안 되므로 결과를 기다리되 예외는 삼킨다.
  await notifyUpload({
    documentId: document.id,
    title: document.title,
    versionNo: 1,
    fileName: file.fileName,
    uploaderName: session.username,
  })

  return NextResponse.json({ id: document.id }, { status: 201 })
}
