import { describe, expect, it } from 'vitest'
import { SignJWT } from 'jose'
import { verifyMcpBearer } from '@/lib/mcp/auth'
import {
  clientIdHash,
  signAccessToken,
  signAuthorizationCode,
  signRefreshToken,
} from '@/lib/oauth/tokens'

const key = new TextEncoder().encode(process.env.AUTH_SECRET)
const USER = { id: 'user_1', discordId: '1000000000000000001', username: '홍길동', avatarUrl: null }
const CID = clientIdHash('client-jwt')
const REQ = new Request('http://localhost:3002/api/mcp', { method: 'POST' })

describe('verifyMcpBearer', () => {
  it('bearer 가 없으면 undefined 여야 한다 (→ withMcpAuth 가 401)', async () => {
    expect(await verifyMcpBearer(REQ)).toBeUndefined()
    expect(await verifyMcpBearer(REQ, '')).toBeUndefined()
  })

  it('형식이 틀린 토큰은 undefined 여야 한다', async () => {
    expect(await verifyMcpBearer(REQ, 'not-a-jwt')).toBeUndefined()
  })

  it('세션 쿠키 형태 토큰(aud 없음)은 bearer 로 받지 않아야 한다', async () => {
    const sessionLike = await new SignJWT({ ...USER })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(key)

    expect(await verifyMcpBearer(REQ, sessionLike)).toBeUndefined()
  })

  it('refresh token·authorization code 는 bearer 로 받지 않아야 한다', async () => {
    const refresh = await signRefreshToken({
      userId: USER.id,
      clientIdHash: CID,
      authTime: Math.floor(Date.now() / 1000),
    })
    const code = await signAuthorizationCode({
      userId: USER.id,
      clientIdHash: CID,
      redirectUri: 'http://localhost:3000/cb',
      codeChallenge: 'challenge',
      scope: 'dms',
    })

    expect(await verifyMcpBearer(REQ, refresh)).toBeUndefined()
    expect(await verifyMcpBearer(REQ, code)).toBeUndefined()
  })

  it('만료된 access 는 undefined 여야 한다', async () => {
    const expired = await new SignJWT({ discordId: USER.discordId, username: USER.username, cid: CID })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('dms:mcp')
      .setSubject(USER.id)
      .setIssuedAt(0)
      .setExpirationTime(1)
      .sign(key)

    expect(await verifyMcpBearer(REQ, expired)).toBeUndefined()
  })

  it('유효한 access 면 AuthInfo 를 돌려줘야 한다 — 스코프는 dms 하나, 역할 개념 없음', async () => {
    const token = await signAccessToken({ user: USER, clientIdHash: CID })

    const info = await verifyMcpBearer(REQ, token)

    expect(info).toBeDefined()
    expect(info!.token).toBe(token)
    expect(info!.clientId).toBe(CID)
    expect(info!.scopes).toEqual(['dms'])
    expect(typeof info!.expiresAt).toBe('number')
    expect(info!.extra).toEqual({
      userId: USER.id,
      discordId: USER.discordId,
      username: USER.username,
    })
  })
})
