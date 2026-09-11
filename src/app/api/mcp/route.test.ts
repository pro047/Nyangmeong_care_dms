import { describe, expect, it, vi } from 'vitest'
import { SignJWT } from 'jose'
import { POST } from './route'

// DB·S3 는 테스트 환경에 없다. 인증 경계(401 과 그 헤더)만 본다 — 도구 동작은
// src/lib/mcp/server.test.ts 가 본다.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/s3', () => ({ presignDownload: vi.fn() }))

const APP_URL = 'http://localhost:3002'
const RESOURCE_METADATA = `resource_metadata="${APP_URL}/.well-known/oauth-protected-resource"`

function rpc(authorization?: string) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  }
  if (authorization) headers.authorization = authorization
  return new Request(`${APP_URL}/api/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  })
}

describe('POST /api/mcp — 인증 경계', () => {
  it('토큰이 없으면 401 이고 WWW-Authenticate 가 루트의 보호 자원 메타데이터를 가리켜야 한다', async () => {
    const res = await POST(rpc())

    expect(res.status).toBe(401)
    const challenge = res.headers.get('www-authenticate') ?? ''
    expect(challenge).toMatch(/^Bearer /)
    expect(challenge).toContain(RESOURCE_METADATA)
    // resourceUrl 에 APP_URL/api/mcp 를 넣으면 생기는 경로(판단검증 #9)가 아니어야 한다.
    expect(challenge).not.toContain('/api/mcp/.well-known')
  })

  it('세션 쿠키 형태 토큰을 bearer 로 보내면 401 이어야 한다', async () => {
    const sessionLike = await new SignJWT({ id: 'user_1', discordId: '1', username: 'u' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET))

    const res = await POST(rpc(`Bearer ${sessionLike}`))

    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate') ?? '').toContain(RESOURCE_METADATA)
  })
})
