import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { env } from './env'

const COOKIE_NAME = 'dms_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30일

export type SessionUser = {
  id: string
  discordId: string
  username: string
  avatarUrl: string | null
}

const key = new TextEncoder().encode(env.AUTH_SECRET)

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key)

  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.APP_URL.startsWith('https://'),
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key)
    return {
      id: payload.id as string,
      discordId: payload.discordId as string,
      username: payload.username as string,
      avatarUrl: (payload.avatarUrl as string | null) ?? null,
    }
  } catch {
    return null
  }
}

/** 서버 컴포넌트/라우트 핸들러에서 로그인 필수 구간에 사용. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession()
  if (!session) throw new Error('UNAUTHORIZED')
  return session
}

export async function destroySession() {
  ;(await cookies()).delete(COOKIE_NAME)
}

export { COOKIE_NAME }
