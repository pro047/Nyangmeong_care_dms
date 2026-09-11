import { createHash, hkdfSync } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { env } from '@/lib/env'
import type { SessionUser } from '@/lib/session'

/**
 * 전부 HS256 JWT 이고, 이 파일 안에서는 `aud` 로 용도를 가른다.
 * verify 계열은 실패 이유를 구분하지 않고 전부 null 을 돌려준다.
 *
 * 키는 AUTH_SECRET 그대로가 아니라 거기서 파생한 별도 키다. 세션 검증기(`session.ts`·
 * `proxy.ts`)는 `aud` 를 요구하지 않아서, 같은 키로 서명하면 **인증 없이 받는 client_id**
 * 를 포함한 여기 토큰 전부가 `dms_session` 쿠키로 통과한다. `aud` 분리는 양쪽 검증기가
 * 모두 `aud` 를 볼 때만 성립한다 — 세션 쪽을 고치면 전원 재로그인이라 키를 가른다.
 * 이 키를 세션·프록시에서 import 하지 말 것.
 */
const key = new Uint8Array(hkdfSync('sha256', env.AUTH_SECRET, '', 'dms:oauth', 32))

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

/**
 * 만료는 발급 시각이 아니라 `authTime`(동의 화면을 지난 시각) 기준이다. 리프레시마다
 * 30일을 새로 주면 30일 안에 한 번씩만 갱신해도 길드 재검사 없이 무기한 이어진다 —
 * 웹 세션은 30일마다 디스코드 로그인(= 길드 검사)을 다시 거친다.
 */
export async function signRefreshToken(params: {
  userId: string
  clientIdHash: string
  authTime: number
}) {
  return new SignJWT({ cid: params.clientIdHash, auth_time: params.authTime })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(REFRESH_AUDIENCE)
    .setSubject(params.userId)
    .setIssuedAt()
    .setExpirationTime(params.authTime + REFRESH_TTL_SECONDS)
    .sign(key)
}

export async function verifyRefreshToken(
  token: string,
): Promise<{ userId: string; clientIdHash: string; authTime: number } | null> {
  try {
    const { payload } = await jwtVerify(token, key, { audience: REFRESH_AUDIENCE })
    if (typeof payload.auth_time !== 'number') return null
    return {
      userId: payload.sub as string,
      clientIdHash: payload.cid as string,
      authTime: payload.auth_time,
    }
  } catch {
    return null
  }
}
