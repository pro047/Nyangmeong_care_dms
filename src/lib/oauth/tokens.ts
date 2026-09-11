import { createHash } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { env } from '@/lib/env'
import type { SessionUser } from '@/lib/session'

/**
 * 전부 AUTH_SECRET 으로 서명한 HS256 JWT 다. `aud` 로 용도를 가른다 — `upload-token.ts`
 * 가 세션과 갈라 둔 것과 같은 이유다(섞이면 한 토큰이 다른 자리에서 통과한다).
 * verify 계열은 실패 이유를 구분하지 않고 전부 null 을 돌려준다.
 */
const key = new TextEncoder().encode(env.AUTH_SECRET)

const CLIENT_AUDIENCE = 'dms:oauth-client'
const CODE_AUDIENCE = 'dms:oauth-code'
const ACCESS_AUDIENCE = 'dms:mcp'
const REFRESH_AUDIENCE = 'dms:mcp-refresh'

const CODE_TTL_SECONDS = 60
const ACCESS_TTL_SECONDS = 3600
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30

/** client_id JWT 가 길어 다른 토큰 안에 통째로 넣을 수 없어 이 해시로 대신 묶는다. */
export function clientIdHash(clientId: string): string {
  return createHash('sha256').update(clientId).digest('hex')
}

export async function signClientId(params: { redirectUris: string[]; clientName: string }) {
  return new SignJWT({ redirect_uris: params.redirectUris, client_name: params.clientName })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(CLIENT_AUDIENCE)
    .setIssuedAt()
    .sign(key)
}

export async function verifyClientId(
  clientId: string,
): Promise<{ redirectUris: string[]; clientName: string } | null> {
  try {
    const { payload } = await jwtVerify(clientId, key, { audience: CLIENT_AUDIENCE })
    return {
      redirectUris: payload.redirect_uris as string[],
      clientName: payload.client_name as string,
    }
  } catch {
    return null
  }
}

export async function signAuthorizationCode(params: {
  userId: string
  clientIdHash: string
  redirectUri: string
  codeChallenge: string
  scope: string
}) {
  return new SignJWT({
    cid: params.clientIdHash,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    scope: params.scope,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(CODE_AUDIENCE)
    .setSubject(params.userId)
    .setIssuedAt()
    .setExpirationTime(`${CODE_TTL_SECONDS}s`)
    .sign(key)
}

export async function verifyAuthorizationCode(code: string): Promise<{
  userId: string
  clientIdHash: string
  redirectUri: string
  codeChallenge: string
  scope: string
} | null> {
  try {
    const { payload } = await jwtVerify(code, key, { audience: CODE_AUDIENCE })
    return {
      userId: payload.sub as string,
      clientIdHash: payload.cid as string,
      redirectUri: payload.redirect_uri as string,
      codeChallenge: payload.code_challenge as string,
      scope: payload.scope as string,
    }
  } catch {
    return null
  }
}

export async function signAccessToken(params: { user: SessionUser; clientIdHash: string }) {
  return new SignJWT({
    discordId: params.user.discordId,
    username: params.user.username,
    avatarUrl: params.user.avatarUrl,
    cid: params.clientIdHash,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(ACCESS_AUDIENCE)
    .setSubject(params.user.id)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(key)
}

export async function verifyAccessToken(token: string): Promise<{
  userId: string
  discordId: string
  username: string
  avatarUrl: string | null
  clientIdHash: string
  expiresAt: number
} | null> {
  try {
    const { payload } = await jwtVerify(token, key, { audience: ACCESS_AUDIENCE })
    if (payload.exp === undefined) return null
    return {
      userId: payload.sub as string,
      discordId: payload.discordId as string,
      username: payload.username as string,
      avatarUrl: (payload.avatarUrl as string | null) ?? null,
      clientIdHash: payload.cid as string,
      expiresAt: payload.exp,
    }
  } catch {
    return null
  }
}

export async function signRefreshToken(params: { userId: string; clientIdHash: string }) {
  return new SignJWT({ cid: params.clientIdHash })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(REFRESH_AUDIENCE)
    .setSubject(params.userId)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SECONDS}s`)
    .sign(key)
}

export async function verifyRefreshToken(
  token: string,
): Promise<{ userId: string; clientIdHash: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key, { audience: REFRESH_AUDIENCE })
    return { userId: payload.sub as string, clientIdHash: payload.cid as string }
  } catch {
    return null
  }
}
