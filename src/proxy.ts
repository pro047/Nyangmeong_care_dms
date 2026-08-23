import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { isNavigationRequest } from '@/lib/request-kind'

// lib/env(zod 전체 검증)를 끌어오지 않고 필요한 값만 직접 읽는다. lib/env 는 import 되는
// 순간 process.env 를 검증하며 throw 하는데, 프록시는 전 요청 경로에 걸려 있어 여기서
// 죽으면 앱 전체가 죽는다.
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

  // 경로가 아니라 **요청 방식**으로 가른다. /api/ 라도 다운로드 링크(<a href>)처럼
  // 주소창이 직접 이동하는 경우가 있는데, 거기에 JSON 401 을 주면 탭 전체가
  // {"error":"..."} 텍스트로 바뀐다. 30일 쿠키가 만료되면 팀 전원이 그걸 본다.
  if (!isNavigationRequest(req.headers)) {
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
