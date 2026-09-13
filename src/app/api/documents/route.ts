import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notifyUpload } from '@/lib/discord'
import { headObjectSize } from '@/lib/s3'
import { verifyUploadToken } from '@/lib/upload-token'
import { activeDocumentWhere } from '@/lib/trash'
import { documentListOrderBy } from '@/lib/latest'
import { createDocument, documentCreateSchema } from '@/lib/upload-commit'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * 문서 목록. 사내 정합성 저장소(scripts/dms_sync.py)가 "이 문서의 최신 판이 몇 번인가"를
 * 읽어 가는 읽기 전용 경로다. 화면은 서버 컴포넌트가 직접 조회하므로 이 라우트를 쓰지 않는다.
 *
 * **페이지네이션을 넣지 말 것.** 소비자는 응답 한 번을 전량으로 보고 자기 목록의 문서를
 * 그 안에서 찾는다 — 잘라 보내면 빠진 문서가 조용히 "DMS 에 없음"으로 잘못 분류된다.
 */
export async function GET() {
  // 프록시가 이미 세션을 보지만(proxy.ts) 보호는 이중으로 한다.
  if (!(await getSession())) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const documents = await prisma.document.findMany({
    where: activeDocumentWhere(),
    select: {
      id: true,
      title: true,
      folderId: true,
      // 최신 판 하나면 충분하다 — 소비자는 versions 안에서 versionNo 최댓값을 고른다.
      // take: 1 이어도 배열 형태는 유지된다. 그게 계약이다.
      versions: {
        orderBy: { versionNo: 'desc' },
        take: 1,
        select: { versionNo: true, fileName: true },
      },
    },
    orderBy: documentListOrderBy(),
  })

  return NextResponse.json({ documents })
}

/** S3 업로드가 끝난 뒤 호출된다. 문서와 첫 버전(v1)을 함께 만든다.
 *
 * 실제 순서(토큰 → 재사용 확인 → HeadObject → 크기 → 생성 → 알림)는 `upload-commit.ts` 의
 * `createDocument` 가 갖고 있다 — MCP `create_document` 도구와 공유하는 자리다.
 * 이 라우트는 파싱과 상태 코드 변환만 한다.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const parsed = documentCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const outcome = await createDocument(parsed.data, session, {
    prisma,
    verifyUploadToken,
    headObjectSize,
    notifyUpload,
    adminDiscordId: env.ADMIN_DISCORD_ID,
  })
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  }

  return NextResponse.json({ id: outcome.value.id }, { status: outcome.status })
}
