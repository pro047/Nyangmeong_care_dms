import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { buildAuthorizeUrl } from '@/lib/discord'
import { env } from '@/lib/env'
import { RETURN_TO_COOKIE, safeReturnTo } from '@/lib/oauth/return-to'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  // CSRF 방지용 state. 쿠키에 넣어두고 콜백에서 대조한다.
  const state = randomBytes(16).toString('hex')
  const res = NextResponse.redirect(buildAuthorizeUrl(state))
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.APP_URL.startsWith('https://'),
    path: '/',
    maxAge: 600,
  }
  res.cookies.set('dms_oauth_state', state, cookieOpts)

  // /oauth/authorize 에서 로그인을 거쳐 오는 경우, 콜백이 돌아갈 곳을 기억해둔다.
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get('returnTo'))
  if (returnTo !== '/') {
    res.cookies.set(RETURN_TO_COOKIE, returnTo, cookieOpts)
  }

  return res
}
