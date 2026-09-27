import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { getObjectBytes } from '@/lib/s3'
import { suggestForDocument } from '@/lib/doc-key-suggest'

export const dynamic = 'force-dynamic'

/** 최신판 본문으로 docKey 를 제안한다(관리자만). 규칙은 `doc-key-suggest.ts` */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  const { id } = await params
  const outcome = await suggestForDocument(id, session, { prisma, getObjectBytes, adminDiscordId: env.ADMIN_DISCORD_ID })
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  return NextResponse.json({ suggested: outcome.suggested, counts: outcome.counts })
}
