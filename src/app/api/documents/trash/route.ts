import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { deleteObject } from '@/lib/s3'
import { trashOwnerWhere } from '@/lib/ownership'
import { scheduleConsistencyMeasure } from '@/lib/consistency-schedule'
import { parseTrashCutoff, purgeTrashedDocuments } from '@/lib/purge'

export const dynamic = 'force-dynamic'

/**
 * 휴지통 비우기. 범위는 휴지통 화면이 보여주는 것과 같다 — 관리자는 전체, 그 외에는
 * 내가 올린 문서. 0건도 200 이다: 이미 비어 있는 것은 달성된 상태이지 없는 자원이 아니다.
 *
 * `?before=` 는 화면을 그린 시각이고 필수다. 그 뒤에 휴지통에 들어온 문서는 누른 사람이
 * 본 적이 없는데, 되돌릴 수 없으므로 지우지 않는다.
 */
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  // id 없는 세션도 막는다 — 소유자 조건이 undefined 가 되면 전원의 휴지통이 대상이 된다.
  if (!session || typeof session.id !== 'string' || session.id === '') {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const deletedBefore = parseTrashCutoff(req.nextUrl.searchParams.get('before'))
  if (!deletedBefore) {
    return NextResponse.json({ error: '기준 시각이 올바르지 않습니다.' }, { status: 400 })
  }

  const { count } = await purgeTrashedDocuments(
    { ...trashOwnerWhere(session, env.ADMIN_DISCORD_ID), deletedBefore },
    { prisma, deleteObject, scheduleMeasure: scheduleConsistencyMeasure },
  )

  return NextResponse.json({ count })
}
