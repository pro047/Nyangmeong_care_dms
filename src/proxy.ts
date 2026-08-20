import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

// 프록시(구 미들웨어)는 Edge 런타임이라 lib/env(zod 전체 검증)를 끌어오지 않고 필요한 값만 직접 읽는다.
const key = new TextEncoder().encode(process.env.AUTH_SECRET)

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/callback']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  const token = req.cookies.get('dms_session')?.value
  if (token) {
    try {
      await jwtVerify(token, key)
      return NextResponse.next()
    } catch {
      // 만료되었거나 위조된 토큰 → 로그인으로
    }
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
