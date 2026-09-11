import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { SignJWT } from 'jose'
import { proxy } from './proxy'

// 프록시는 낙관적 확인이다. 여기서 보는 것은 "어느 경로를 쿠키 없이 통과시키는가" 하나다 —
// 통과시킨 경로의 실제 방어는 각 라우트(withMcpAuth · getSession)가 한다.
const ORIGIN = 'http://localhost:3002'

function fetchLike(path: string, cookie?: string) {
  const headers: Record<string, string> = { 'sec-fetch-dest': 'empty', accept: 'application/json' }
  if (cookie) headers.cookie = `dms_session=${cookie}`
  return new NextRequest(`${ORIGIN}${path}`, { headers })
}

function navigate(path: string) {
  return new NextRequest(`${ORIGIN}${path}`, {
    headers: { 'sec-fetch-dest': 'document', accept: 'text/html' },
  })
}

function passed(res: Response) {
  return res.headers.get('x-middleware-next') === '1'
}

describe('proxy — MCP·OAuth 공개 경로', () => {
  it.each([
    '/.well-known/oauth-authorization-server',
    '/.well-known/oauth-protected-resource',
    '/oauth/authorize?client_id=x',
    '/api/oauth/register',
    '/api/oauth/authorize',
    '/api/oauth/token',
    '/api/mcp',
  ])('%s 는 쿠키 없이 통과해야 한다', async (path) => {
    expect(passed(await proxy(fetchLike(path)))).toBe(true)
  })

  it('/oauth/authorize 내비게이션은 /login 으로 보내지 않아야 한다 (쿼리를 잃는다)', async () => {
    const res = await proxy(navigate('/oauth/authorize?client_id=x&state=y'))

    expect(passed(res)).toBe(true)
    expect(res.headers.get('location')).toBeNull()
  })
})

describe('proxy — 이름만 비슷한 경로는 여전히 보호한다', () => {
  it.each(['/api/mcpx', '/api/mcp-admin', '/oauthx', '/api/oauthx/token', '/.well-knownx'])(
    '%s 는 쿠키 없이 401 이어야 한다',
    async (path) => {
      const res = await proxy(fetchLike(path))

      expect(passed(res)).toBe(false)
      expect(res.status).toBe(401)
    },
  )

  it('기존 보호 경로(/api/documents)는 쿠키 없이 401 이어야 한다', async () => {
    const res = await proxy(fetchLike('/api/documents'))

    expect(res.status).toBe(401)
  })

  it('보호 경로 내비게이션은 쿼리를 버리고 /login 으로 보내야 한다', async () => {
    const res = await proxy(navigate('/documents/x?v=1'))

    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/login')
    expect(location.search).toBe('')
  })

  it('유효한 세션 쿠키가 있으면 보호 경로를 통과해야 한다', async () => {
    const token = await new SignJWT({ id: 'user_1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET))

    expect(passed(await proxy(fetchLike('/api/documents', token)))).toBe(true)
  })
})
