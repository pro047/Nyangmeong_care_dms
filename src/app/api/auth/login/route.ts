import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { buildAuthorizeUrl } from '@/lib/discord'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

export function GET() {
  // CSRF 방지용 state. 쿠키에 넣어두고 콜백에서 대조한다.
  const state = randomBytes(16).toString('hex')
  const res = NextResponse.redirect(buildAuthorizeUrl(state))
  res.cookies.set('dms_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.APP_URL.startsWith('https://'),
    path: '/',
    maxAge: 600,
  })
  return res
}
