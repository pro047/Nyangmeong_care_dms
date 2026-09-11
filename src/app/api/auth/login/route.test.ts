import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'
import { RETURN_TO_COOKIE } from '@/lib/oauth/return-to'

// 디스코드는 테스트 환경에 없다. 인가 URL 만 고정값으로 갈아 끼운다.
const { buildAuthorizeUrl } = vi.hoisted(() => ({
  buildAuthorizeUrl: vi.fn((state: string) => `https://discord.com/oauth2/authorize?state=${state}`),
}))
vi.mock('@/lib/discord', () => ({ buildAuthorizeUrl }))

const BASE = 'http://localhost:3002/api/auth/login'

function login(query = '') {
  return GET(new NextRequest(`${BASE}${query}`))
}

beforeEach(() => {
  buildAuthorizeUrl.mockClear()
})

describe('GET /api/auth/login — returnTo', () => {
  it('/oauth/authorize?… 면 dms_return_to 쿠키(600초, httpOnly, lax)에 담아야 한다', async () => {
    const returnTo = '/oauth/authorize?client_id=abc&state=xyz'

    const res = login(`?returnTo=${encodeURIComponent(returnTo)}`)

    const cookie = res.cookies.get(RETURN_TO_COOKIE)
    expect(cookie?.value).toBe(returnTo)
    expect(cookie?.maxAge).toBe(600)
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite).toBe('lax')
    expect(cookie?.path).toBe('/')
  })

  it.each([
    ['외부 URL', 'https://evil.example/'],
    ['프로토콜 상대', '//evil.example'],
    ['다른 앱 경로', '/documents/x'],
  ])('returnTo 가 %s 면 쿠키를 심지 않아야 한다', async (_label, returnTo) => {
    const res = login(`?returnTo=${encodeURIComponent(returnTo)}`)

    expect(res.cookies.get(RETURN_TO_COOKIE)).toBeUndefined()
  })

  it('returnTo 가 없으면 쿠키를 심지 않고 기존처럼 디스코드로 보내야 한다', async () => {
    const res = login()

    expect(res.cookies.get(RETURN_TO_COOKIE)).toBeUndefined()
    expect(res.cookies.get('dms_oauth_state')?.value).toMatch(/^[0-9a-f]{32}$/)
    expect(res.headers.get('location')).toMatch(/^https:\/\/discord\.com\/oauth2\/authorize\?state=/)
  })
})
