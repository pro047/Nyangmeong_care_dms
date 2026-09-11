import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'
import {
  clientIdHash,
  signAccessToken,
  signAuthorizationCode,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '@/lib/oauth/tokens'

// DB 는 테스트 환경에 없다. 토큰은 실제 서명·검증을 태운다 (vitest.config 의 더미 AUTH_SECRET).
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique } } }))

const BASE = 'http://localhost:3002/api/oauth/token'
const CLIENT_ID = 'client-jwt'
const CID = clientIdHash(CLIENT_ID)
const REDIRECT = 'http://localhost:41234/cb'
// RFC 7636 부록 B.
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
const DB_USER = {
  id: 'user_1',
  discordId: '1000000000000000001',
  username: '새닉네임',
  avatarUrl: null,
}

function post(fields: Record<string, string>) {
  return POST(
    new NextRequest(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    }),
  )
}

function issueCode(overrides: Partial<Parameters<typeof signAuthorizationCode>[0]> = {}) {
  return signAuthorizationCode({
    userId: DB_USER.id,
    clientIdHash: CID,
    redirectUri: REDIRECT,
    codeChallenge: CHALLENGE,
    scope: 'dms',
    ...overrides,
  })
}

async function exchange(fields: Record<string, string> = {}) {
  return post({
    grant_type: 'authorization_code',
    code: await issueCode(),
    redirect_uri: REDIRECT,
    client_id: CLIENT_ID,
    code_verifier: VERIFIER,
    ...fields,
  })
}

beforeEach(() => {
  findUnique.mockReset().mockResolvedValue(DB_USER)
})

describe('POST /api/oauth/token — authorization_code', () => {
  it('정상 교환이면 200 · Bearer · 3600 · refresh · scope dms 여야 한다', async () => {
    const res = await exchange()

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'dms' })
    expect(await verifyAccessToken(body.access_token)).toMatchObject({
      userId: DB_USER.id,
      discordId: DB_USER.discordId,
      username: DB_USER.username,
      clientIdHash: CID,
    })
    expect(await verifyRefreshToken(body.refresh_token)).toEqual({
      userId: DB_USER.id,
      clientIdHash: CID,
    })
    expect(findUnique).toHaveBeenCalledWith({ where: { id: DB_USER.id } })
  })

  it('code_verifier 가 challenge 와 안 맞으면 invalid_grant 여야 한다', async () => {
    const res = await exchange({ code_verifier: 'x'.repeat(43) })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_grant' })
  })

  it('다른 client_id 로 교환하면 invalid_grant 여야 한다', async () => {
    const res = await exchange({ client_id: 'other-client' })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_grant' })
  })

  it('redirect_uri 는 루프백이라도 포트까지 완전일치여야 한다', async () => {
    const res = await exchange({ redirect_uri: 'http://localhost:41235/cb' })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_grant' })
  })

  it('위조·만료 등으로 code 검증이 실패하면 invalid_grant 여야 한다', async () => {
    const res = await exchange({ code: 'garbage' })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_grant' })
  })

  it('access token 을 code 자리에 넣으면 invalid_grant 여야 한다', async () => {
    const access = await signAccessToken({ user: DB_USER, clientIdHash: CID })

    const res = await exchange({ code: access })

    expect(await res.json()).toEqual({ error: 'invalid_grant' })
  })

  it('사용자가 DB 에 없으면 invalid_grant 여야 한다', async () => {
    findUnique.mockResolvedValue(null)

    const res = await exchange()

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_grant' })
  })

  it('필수 파라미터가 빠지면 invalid_request 여야 한다', async () => {
    const res = await post({
      grant_type: 'authorization_code',
      code: await issueCode(),
      redirect_uri: REDIRECT,
      client_id: CLIENT_ID,
    })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_request' })
    expect(findUnique).not.toHaveBeenCalled()
  })
})

describe('POST /api/oauth/token — refresh_token', () => {
  it('새 access 와 새 refresh 를 주고, 닉네임은 DB 에서 다시 읽어야 한다', async () => {
    const refresh = await signRefreshToken({ userId: DB_USER.id, clientIdHash: CID })

    const res = await post({ grant_type: 'refresh_token', refresh_token: refresh, client_id: CLIENT_ID })

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'dms' })
    expect(findUnique).toHaveBeenCalledWith({ where: { id: DB_USER.id } })
    expect((await verifyAccessToken(body.access_token))?.username).toBe('새닉네임')
    expect(await verifyRefreshToken(body.refresh_token)).toEqual({
      userId: DB_USER.id,
      clientIdHash: CID,
    })
  })

  it('다른 client_id 면 invalid_grant 여야 한다', async () => {
    const refresh = await signRefreshToken({ userId: DB_USER.id, clientIdHash: CID })

    const res = await post({ grant_type: 'refresh_token', refresh_token: refresh, client_id: 'other' })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_grant' })
  })

  it('access token 을 refresh 자리에 넣으면 invalid_grant 여야 한다', async () => {
    const access = await signAccessToken({ user: DB_USER, clientIdHash: CID })

    const res = await post({ grant_type: 'refresh_token', refresh_token: access, client_id: CLIENT_ID })

    expect(await res.json()).toEqual({ error: 'invalid_grant' })
  })

  it('사용자가 DB 에 없으면 invalid_grant 여야 한다', async () => {
    findUnique.mockResolvedValue(null)
    const refresh = await signRefreshToken({ userId: DB_USER.id, clientIdHash: CID })

    const res = await post({ grant_type: 'refresh_token', refresh_token: refresh, client_id: CLIENT_ID })

    expect(await res.json()).toEqual({ error: 'invalid_grant' })
  })

  it('refresh_token 이 빠지면 invalid_request 여야 한다', async () => {
    const res = await post({ grant_type: 'refresh_token', client_id: CLIENT_ID })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_request' })
  })
})

describe('POST /api/oauth/token — grant_type', () => {
  it('지원하지 않는 grant_type 은 unsupported_grant_type 이어야 한다', async () => {
    const res = await post({ grant_type: 'client_credentials' })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'unsupported_grant_type' })
  })
})
