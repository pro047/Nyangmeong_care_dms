import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { outcomeFromCount, RESTORE_NOT_FOUND, trashedDocumentWhere } from '@/lib/trash'

export const dynamic = 'force-dynamic'

/** 휴지통에서 되돌린다. @updatedAt 때문에 수정 시각이 갱신되며, 이는 의도한 동작이다. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params

  const { count } = await prisma.document.updateMany({
    where: { id, ...trashedDocumentWhere() },
    data: { deletedAt: null },
  })

  const outcome = outcomeFromCount(count, RESTORE_NOT_FOUND)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  }

  return NextResponse.json({ id })
}
