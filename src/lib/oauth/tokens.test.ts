import { describe, expect, it } from 'vitest'
import { SignJWT, decodeJwt } from 'jose'
import {
  clientIdHash,
  signAccessToken,
  signAuthorizationCode,
  signClientId,
  signRefreshToken,
  verifyAccessToken,
  verifyAuthorizationCode,
  verifyClientId,
  verifyRefreshToken,
} from '@/lib/oauth/tokens'
import type { SessionUser } from '@/lib/session'

const key = new TextEncoder().encode(process.env.AUTH_SECRET)

const USER: SessionUser = {
  id: 'user_1',
  discordId: '1000000000000000001',
  username: '홍길동',
  avatarUrl: null,
}
const CID = clientIdHash('client-jwt')

describe('clientId', () => {
  it('발급 → 검증 왕복이 값을 보존해야 한다', async () => {
    const token = await signClientId({ redirectUris: ['http://localhost:3000/cb'], clientName: 'CLI' })
    const result = await verifyClientId(token)
    expect(result).toEqual({ redirectUris: ['http://localhost:3000/cb'], clientName: 'CLI' })
  })
})

describe('authorizationCode', () => {
  it('발급 → 검증 왕복이 값을 보존해야 한다', async () => {
    const code = await signAuthorizationCode({
      userId: USER.id,
      clientIdHash: CID,
      redirectUri: 'http://localhost:3000/cb',
      codeChallenge: 'challenge',
      scope: 'dms',
    })
    const result = await verifyAuthorizationCode(code)
    expect(result).toEqual({
      userId: USER.id,
      clientIdHash: CID,
      redirectUri: 'http://localhost:3000/cb',
      codeChallenge: 'challenge',
      scope: 'dms',
    })
  })

  it('만료된 코드는 거부해야 한다', async () => {
    const expired = await new SignJWT({
      cid: CID,
      redirect_uri: 'http://localhost:3000/cb',
      code_challenge: 'challenge',
      scope: 'dms',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('dms:oauth-code')
      .setSubject(USER.id)
      .setIssuedAt(0)
      .setExpirationTime(1)
      .sign(key)

    expect(await verifyAuthorizationCode(expired)).toBeNull()
  })
})

describe('accessToken / refreshToken', () => {
  it('access 발급 → 검증 왕복이 값을 보존해야 한다', async () => {
    const token = await signAccessToken({ user: USER, clientIdHash: CID })
    const result = await verifyAccessToken(token)
    expect(result).toMatchObject({
      userId: USER.id,
      discordId: USER.discordId,
      username: USER.username,
      avatarUrl: USER.avatarUrl,
      clientIdHash: CID,
    })
  })

  it('refresh 발급 → 검증 왕복이 값을 보존해야 한다', async () => {
    const token = await signRefreshToken({ userId: USER.id, clientIdHash: CID })
    const result = await verifyRefreshToken(token)
    expect(result).toEqual({ userId: USER.id, clientIdHash: CID })
  })
})

describe('aud 분리', () => {
  it('세션 쿠키 형태 토큰(aud 없음)을 access 자리에 넣으면 거부해야 한다', async () => {
    const sessionLike = await new SignJWT({ ...USER })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(key)

    expect(await verifyAccessToken(sessionLike)).toBeNull()
  })

  it('authorization code 를 refresh token 자리에 넣으면 거부해야 한다', async () => {
    const code = await signAuthorizationCode({
      userId: USER.id,
      clientIdHash: CID,
      redirectUri: 'http://localhost:3000/cb',
      codeChallenge: 'challenge',
      scope: 'dms',
    })

    expect(await verifyRefreshToken(code)).toBeNull()
  })

  it('access token 을 authorization code 자리에 넣으면 거부해야 한다', async () => {
    const access = await signAccessToken({ user: USER, clientIdHash: CID })

    expect(await verifyAuthorizationCode(access)).toBeNull()
  })
})

describe('aud 분리 — 전 조합', () => {
  // 한 종류가 다른 자리에서 통과하면 60초 코드가 1시간 access 로, access 가 30일 refresh 로
  // 둔갑한다. 대각선(제자리)만 통과하고 나머지는 전부 null 이어야 한다.
  async function issueAll() {
    const sessionLike = await new SignJWT({ ...USER })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(key)
    return {
      session: sessionLike,
      client: await signClientId({ redirectUris: ['http://localhost:3000/cb'], clientName: 'CLI' }),
      code: await signAuthorizationCode({
        userId: USER.id,
        clientIdHash: CID,
        redirectUri: 'http://localhost:3000/cb',
        codeChallenge: 'challenge',
        scope: 'dms',
      }),
      access: await signAccessToken({ user: USER, clientIdHash: CID }),
      refresh: await signRefreshToken({ userId: USER.id, clientIdHash: CID }),
    }
  }

  const verifiers = {
    client: verifyClientId,
    code: verifyAuthorizationCode,
    access: verifyAccessToken,
    refresh: verifyRefreshToken,
  } as const

  it('각 verify 는 자기 종류만 받고 나머지(세션 포함)는 전부 null 이어야 한다', async () => {
    const tokens = await issueAll()
    for (const [slot, verify] of Object.entries(verifiers)) {
      for (const [kind, token] of Object.entries(tokens)) {
        const result = await verify(token)
        if (kind === slot) expect(result, `${kind} → ${slot}`).not.toBeNull()
        else expect(result, `${kind} → ${slot}`).toBeNull()
      }
    }
  })

  it('다른 키로 서명한 access 는 거부해야 한다', async () => {
    const forged = await new SignJWT({ discordId: USER.discordId, username: USER.username, cid: CID })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('dms:mcp')
      .setSubject(USER.id)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('another-secret-that-is-at-least-32-chars'))

    expect(await verifyAccessToken(forged)).toBeNull()
  })
})

describe('TTL', () => {
  it('code 60초 · access 3600초 · refresh 30일이어야 하고 client_id 에는 exp 가 없어야 한다', async () => {
    const code = decodeJwt(
      await signAuthorizationCode({
        userId: USER.id,
        clientIdHash: CID,
        redirectUri: 'http://localhost:3000/cb',
        codeChallenge: 'challenge',
        scope: 'dms',
      }),
    )
    const access = decodeJwt(await signAccessToken({ user: USER, clientIdHash: CID }))
    const refresh = decodeJwt(await signRefreshToken({ userId: USER.id, clientIdHash: CID }))
    const client = decodeJwt(
      await signClientId({ redirectUris: ['http://localhost:3000/cb'], clientName: 'CLI' }),
    )

    expect(code.exp! - code.iat!).toBe(60)
    expect(access.exp! - access.iat!).toBe(3600)
    expect(refresh.exp! - refresh.iat!).toBe(60 * 60 * 24 * 30)
    expect(client.exp).toBeUndefined()
  })

  it('verifyAccessToken 의 expiresAt 은 초 단위 exp 여야 한다 (withMcpAuth 가 Date.now()/1000 과 비교)', async () => {
    const token = await signAccessToken({ user: USER, clientIdHash: CID })
    const result = await verifyAccessToken(token)
    expect(result?.expiresAt).toBe(decodeJwt(token).exp)
    expect(result!.expiresAt).toBeLessThan(Date.now() / 1000 + 3601)
  })
})

describe('clientIdHash', () => {
  it('sha256 hex 64자여야 한다', () => {
    expect(clientIdHash('abc')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('같은 입력이면 같은 값을 돌려줘야 한다', () => {
    expect(clientIdHash('abc')).toBe(clientIdHash('abc'))
  })

  it('다른 입력이면 다른 값을 돌려줘야 한다', () => {
    expect(clientIdHash('abc')).not.toBe(clientIdHash('def'))
  })
})
