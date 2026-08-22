import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { activeDocumentWhere, outcomeFromCount, TRASH_NOT_FOUND } from '@/lib/trash'

export const dynamic = 'force-dynamic'

/**
 * 소프트 삭제. deletedAt만 세팅하고 S3 객체와 버전은 그대로 둔다.
 * 전원 동등하므로 작성자 여부는 보지 않는다.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params

  // updateMany + count: 조회 후 수정하면 그 사이에 남이 지울 수 있다. 한 쿼리로 끝낸다.
  const { count } = await prisma.document.updateMany({
    where: { id, ...activeDocumentWhere() },
    data: { deletedAt: new Date() },
  })

  const outcome = outcomeFromCount(count, TRASH_NOT_FOUND)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  }

  return NextResponse.json({ id })
}
