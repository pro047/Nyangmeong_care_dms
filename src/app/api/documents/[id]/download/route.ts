import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { presignDownload } from '@/lib/s3'

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

  const version = await prisma.documentVersion.findFirst({
    where: {
      documentId: id,
      document: { deletedAt: null },
      ...(versionParam ? { versionNo: Number(versionParam) } : {}),
    },
    orderBy: { versionNo: 'desc' },
    select: { s3Key: true, fileName: true },
  })

  if (!version) {
    return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.redirect(await presignDownload(version.s3Key, version.fileName, inline))
}
