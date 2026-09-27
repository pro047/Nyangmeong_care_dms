import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { scheduleConsistencyMeasure } from '@/lib/consistency-schedule'
import { docKeyPutSchema, updateDocKey } from '@/lib/doc-key-update'

export const dynamic = 'force-dynamic'

/** docKey 달기 · 옮기기(`move: true`) · 떼기(`docKey: null`). 규칙은 `doc-key-update.ts` */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const parsed = docKeyPutSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json({ error: first?.message ?? '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { id } = await params
  const outcome = await updateDocKey(id, parsed.data, session, {
    prisma,
    adminDiscordId: env.ADMIN_DISCORD_ID,
    scheduleMeasure: scheduleConsistencyMeasure,
  })
  if (!outcome.ok) {
    const body = outcome.status === 409 ? { error: outcome.error, holder: outcome.holder } : { error: outcome.error }
    return NextResponse.json(body, { status: outcome.status })
  }
  return NextResponse.json({ id, docKey: outcome.docKey, movedFrom: outcome.movedFrom })
}
