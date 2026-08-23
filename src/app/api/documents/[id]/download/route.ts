import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { presignDownload } from '@/lib/s3'
import { activeDocumentWhere } from '@/lib/trash'
import { parseVersionParam } from '@/lib/version'
import { DOCUMENT_NOT_FOUND } from '@/lib/page-error'
import { isNavigationRequest } from '@/lib/request-kind'

export const dynamic = 'force-dynamic'

const NOT_FOUND = '문서를 찾을 수 없습니다.'

/**
 * 목록의 제목·다운로드 아이콘은 <a href> 라, 남이 지운 문서를 누르면 탭 전체가 JSON 으로
 * 바뀐다. 내비게이션이면 목록으로 돌려보내고 배너로 알린다 — 03a530a 가 401 에 대해 한 것과
 * 같은 처리다. fetch·XHR·curl 이 받는 404 { error } 계약은 그대로 둔다.
 */
function notFoundResponse(req: NextRequest) {
  if (!isNavigationRequest(req.headers)) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 })
  }

  const url = req.nextUrl.clone()
  url.pathname = '/'
  url.search = ''
  // 문구가 아니라 코드를 싣는다 — 문구를 실으면 /?error=<임의 문장> 으로 아무나
  // 앱의 경고 배너를 흉내낼 수 있다.
  url.searchParams.set('error', DOCUMENT_NOT_FOUND)
  return NextResponse.redirect(url)
}

/**
 * 서명 URL로 리다이렉트한다. S3 키를 클라이언트에 노출하지 않기 위해 한 단계 거친다.
 * ?v=2 로 특정 버전, ?inline=1 이면 브라우저에서 바로 열기.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params
  const versionParam = req.nextUrl.searchParams.get('v')
  const inline = req.nextUrl.searchParams.get('inline') === '1'

  // ?v=abc 나 ?v=1.5 를 그대로 Number() 하면 NaN 이 Int 필터로 들어가 쿼리가 터진다.
  // 잘못된 버전 번호는 500 이 아니라 "그런 버전 없음"(404)이 맞다.
  const versionNo = parseVersionParam(versionParam)
  if (versionNo === 'invalid') {
    return notFoundResponse(req)
  }

  const version = await prisma.documentVersion.findFirst({
    where: {
      documentId: id,
      document: activeDocumentWhere(),
      ...(versionNo !== null ? { versionNo } : {}),
    },
    orderBy: { versionNo: 'desc' },
    select: { s3Key: true, fileName: true },
  })

  if (!version) {
    return notFoundResponse(req)
  }

  return NextResponse.redirect(await presignDownload(version.s3Key, version.fileName, inline))
}
