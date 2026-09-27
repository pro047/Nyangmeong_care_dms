import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { denyIfNotOwner } from '@/lib/ownership-guard'
import { hasDocKey, scheduleConsistencyMeasure } from '@/lib/consistency-schedule'
import { outcomeFromCount, RESTORE_NOT_FOUND, trashedDocumentWhere } from '@/lib/trash'

export const dynamic = 'force-dynamic'

/**
 * 휴지통에서 되돌린다. @updatedAt 때문에 수정 시각이 갱신되며, 이는 의도한 동작이다.
 * 삭제와 같은 소유자 검사를 받는다 — 남이 지운 내 문서를 되살리는 것도 내 권한이다.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params

  const denial = await denyIfNotOwner(id, session)
  if (denial) return denial

  // docKey 문서면 바뀐 뒤 다시 잰다 — 바꾼 뒤에는 (영구삭제면) 읽을 수 없어서 먼저 본다
  const measured = await hasDocKey(id)

  const { count } = await prisma.document.updateMany({
    where: { id, ...trashedDocumentWhere() },
    data: { deletedAt: null },
  })

  const outcome = outcomeFromCount(count, RESTORE_NOT_FOUND)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  }

  if (measured) scheduleConsistencyMeasure()

  return NextResponse.json({ id })
}
