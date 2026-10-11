import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { deleteObject } from '@/lib/s3'
import { denyIfNotOwner } from '@/lib/ownership-guard'
import { scheduleConsistencyMeasure } from '@/lib/consistency-schedule'
import { outcomeFromCount, PURGE_NOT_FOUND } from '@/lib/trash'
import { purgeTrashedDocuments } from '@/lib/purge'

export const dynamic = 'force-dynamic'

/**
 * 영구삭제. 되돌릴 수 없다. 휴지통에 있는 문서만 대상이다. 순서(DB 먼저, S3 나중)와
 * S3 키 참조 확인은 `purgeTrashedDocuments` 가 휴지통 비우기와 함께 책임진다.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params

  // 되돌릴 수 없는 경로라 S3 키를 읽기 전에 막는다.
  const denial = await denyIfNotOwner(id, session)
  if (denial) return denial

  const { count } = await purgeTrashedDocuments(
    { id },
    { prisma, deleteObject, scheduleMeasure: scheduleConsistencyMeasure },
  )

  const outcome = outcomeFromCount(count, PURGE_NOT_FOUND)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  }

  return NextResponse.json({ id })
}
