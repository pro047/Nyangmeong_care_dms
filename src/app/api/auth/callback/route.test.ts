import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'
import { RETURN_TO_COOKIE } from '@/lib/oauth/return-to'

// 디스코드·DB·쿠키 저장소는 테스트 환경에 없다. 콜백이 "어디로 보내는가"만 본다.
const { exchangeCode, isGuildMember, fetchDiscordUser, upsert, createSession } = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  isGuildMember: vi.fn(),
  fetchDiscordUser: vi.fn(),
  upsert: vi.fn(),
  createSession: vi.fn(),
}))
vi.mock('@/lib/discord', () => ({ exchangeCode, isGuildMember, fetchDiscordUser }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { upsert } } }))
vi.mock('@/lib/session', () => ({ createSession }))

const BASE = 'http://localhost:3002/api/auth/callback'
const APP_URL = 'http://localhost:3002'
const PROFILE = { discordId: '1000000000000000001', username: '홍길동', avatarUrl: null }

function callback(cookies: Record<string, string>) {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ')
  return GET(new NextRequest(`${BASE}?code=c1&state=s1`, { headers: { cookie } }))
}

beforeEach(() => {
  exchangeCode.mockReset().mockResolvedValue('discord-access')
  isGuildMember.mockReset().mockResolvedValue(true)
  fetchDiscordUser.mockReset().mockResolvedValue(PROFILE)
  upsert.mockReset().mockResolvedValue({ id: 'user_1', ...PROFILE })
  createSession.mockReset().mockResolvedValue(undefined)
})

describe('GET /api/auth/callback — 로그인 후 돌아갈 곳', () => {
  it('dms_return_to 가 /oauth/authorize?… 면 그리로 보내고 쿠키를 지워야 한다', async () => {
    const returnTo = '/oauth/authorize?client_id=abc&state=xyz'

    const res = await callback({ dms_oauth_state: 's1', [RETURN_TO_COOKIE]: returnTo })

    expect(res.headers.get('location')).toBe(`${APP_URL}${returnTo}`)
    const cleared = res.cookies.get(RETURN_TO_COOKIE)
    expect(cleared?.value).toBe('')
    expect(new Date(cleared!.expires as Date | number).getTime()).toBe(0)
  })

  it('dms_return_to 가 없으면 기존처럼 / 로 보내야 한다', async () => {
    const res = await callback({ dms_oauth_state: 's1' })

    expect(res.headers.get('location')).toBe(`${APP_URL}/`)
  })

  it.each([
    ['프로토콜 상대', '//evil.example'],
    ['외부 URL', 'https://evil.example/oauth/authorize?a=1'],
    ['다른 앱 경로', '/trash'],
  ])('dms_return_to 가 %s 면 / 로 보내야 한다', async (_label, returnTo) => {
    const res = await callback({ dms_oauth_state: 's1', [RETURN_TO_COOKIE]: returnTo })

    expect(res.headers.get('location')).toBe(`${APP_URL}/`)
  })
})

describe('GET /api/auth/callback — 접근 제어는 길드 멤버십 하나', () => {
  it('길드 멤버가 아니면 returnTo 가 있어도 /login 으로 보내고 세션을 만들지 않아야 한다', async () => {
    isGuildMember.mockResolvedValue(false)

    const res = await callback({
      dms_oauth_state: 's1',
      [RETURN_TO_COOKIE]: '/oauth/authorize?client_id=abc',
    })

    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('error')).toBe('팀 디스코드 서버 멤버만 이용할 수 있습니다.')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('state 가 쿠키와 다르면 /login 으로 보내야 한다', async () => {
    const res = await callback({
      dms_oauth_state: 'other',
      [RETURN_TO_COOKIE]: '/oauth/authorize?client_id=abc',
    })

    expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
    expect(exchangeCode).not.toHaveBeenCalled()
  })

  it('길드 멤버면 세션을 만든 뒤 보내야 한다 (세션에 역할 필드 없음)', async () => {
    await callback({ dms_oauth_state: 's1' })

    expect(createSession).toHaveBeenCalledWith({
      id: 'user_1',
      discordId: PROFILE.discordId,
      username: PROFILE.username,
      avatarUrl: null,
    })
  })
})
