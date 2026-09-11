import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'
import { clientIdHash, signClientId, verifyAuthorizationCode } from '@/lib/oauth/tokens'

// 쿠키 저장소는 테스트 환경에 없다. 세션만 갈아 끼우고 토큰은 실제 서명·검증을 태운다.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/session', () => ({ getSession }))

const BASE = 'http://localhost:3002/api/oauth/authorize'
const SESSION = { id: 'user_1', discordId: '1000000000000000001', username: '홍길동', avatarUrl: null }
const REGISTERED = 'http://localhost:3000/cb'
const REQUESTED = 'http://localhost:41234/cb'
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

let clientId: string

function post(fields: Record<string, string>) {
  return POST(
    new NextRequest(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    }),
  )
}

function consent(overrides: Record<string, string> = {}) {
  return post({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REQUESTED,
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    state: 'st-1',
    decision: 'allow',
    ...overrides,
  })
}

beforeEach(async () => {
  getSession.mockReset().mockResolvedValue(SESSION)
  clientId = await signClientId({ redirectUris: [REGISTERED], clientName: 'Claude Code' })
})

describe('POST /api/oauth/authorize — 세션', () => {
  it('세션이 없으면 401 이고 코드를 발급하지 않아야 한다', async () => {
    getSession.mockResolvedValue(null)

    const res = await consent()

    expect(res.status).toBe(401)
    expect(res.headers.get('location')).toBeNull()
  })
})

describe('POST /api/oauth/authorize — client_id·redirect_uri 오류는 redirect 하지 않는다', () => {
  it('서명이 틀린 client_id 는 400 이고 Location 이 없어야 한다', async () => {
    const res = await consent({ client_id: 'forged' })

    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toBeNull()
  })

  it('등록값과 경로가 다른 redirect_uri 는 400 이고 Location 이 없어야 한다', async () => {
    const res = await consent({ redirect_uri: 'http://localhost:41234/other' })

    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toBeNull()
  })

  it('code_challenge_method=plain 은 400 이어야 한다 (같은 스키마로 검증)', async () => {
    const res = await consent({ code_challenge_method: 'plain' })

    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toBeNull()
  })

  it('본문이 form 이 아니면 500 이 아니라 400 이어야 한다', async () => {
    const res = await POST(
      new NextRequest(BASE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      }),
    )

    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toBeNull()
  })
})

describe('POST /api/oauth/authorize — redirect_uri 로 돌려보내는 결과', () => {
  it('resource 가 APP_URL/api/mcp 가 아니면 invalid_target 으로 돌려보내야 한다', async () => {
    const res = await consent({ resource: 'https://other.example/api/mcp' })

    const location = new URL(res.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(REQUESTED)
    expect(location.searchParams.get('error')).toBe('invalid_target')
    expect(location.searchParams.get('state')).toBe('st-1')
    expect(location.searchParams.has('code')).toBe(false)
  })

  it('resource 가 APP_URL/api/mcp 면 통과해야 한다', async () => {
    const res = await consent({ resource: 'http://localhost:3002/api/mcp' })

    const location = new URL(res.headers.get('location')!)
    expect(location.searchParams.has('code')).toBe(true)
  })

  it('거부하면 access_denied 와 state 를 돌려보내고 코드를 주지 않아야 한다', async () => {
    const res = await consent({ decision: 'deny' })

    const location = new URL(res.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(REQUESTED)
    expect(location.searchParams.get('error')).toBe('access_denied')
    expect(location.searchParams.get('state')).toBe('st-1')
    expect(location.searchParams.has('code')).toBe(false)
  })

  it('허용하면 세션 사용자·클라이언트·redirect_uri·challenge 에 묶인 코드를 줘야 한다', async () => {
    const res = await consent()

    const location = new URL(res.headers.get('location')!)
    expect(location.origin + location.pathname).toBe(REQUESTED)
    expect(location.searchParams.get('state')).toBe('st-1')
    const code = await verifyAuthorizationCode(location.searchParams.get('code')!)
    expect(code).toEqual({
      userId: SESSION.id,
      clientIdHash: clientIdHash(clientId),
      // 토큰 교환 때 완전일치로 대조하므로 등록값이 아니라 요청값(포트 포함)이 박혀야 한다.
      redirectUri: REQUESTED,
      codeChallenge: CHALLENGE,
      scope: 'dms',
    })
  })

  it('state 가 없으면 state 를 붙이지 않아야 한다', async () => {
    const fields = {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REQUESTED,
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      decision: 'allow',
    }

    const res = await post(fields)

    expect(new URL(res.headers.get('location')!).searchParams.has('state')).toBe(false)
  })

  it('허용·거부 리다이렉트는 설계대로 302 여야 한다 (307 이면 브라우저가 폼 본문을 redirect_uri 로 다시 POST 한다)', async () => {
    // DESIGN.md §POST /api/oauth/authorize 3·4: "302 errorRedirectUrl(...)" · "302 redirect_uri?code=…".
    // 307/308 은 메서드와 본문을 보존하므로 동의 폼(client_id·code_challenge·decision)이
    // claude.ai·루프백 콜백으로 POST 로 재전송된다. 콜백은 GET 을 기다린다.
    const allow = await consent()
    const deny = await consent({ decision: 'deny' })

    expect(allow.status).toBe(302)
    expect(deny.status).toBe(302)
  })
})
