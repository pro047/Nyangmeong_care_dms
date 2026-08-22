import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { presignDownload } from '@/lib/s3'
import { activeDocumentWhere } from '@/lib/trash'
import { parseVersionParam } from '@/lib/version'

export const dynamic = 'force-dynamic'

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
    return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })
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
    return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.redirect(await presignDownload(version.s3Key, version.fileName, inline))
}
