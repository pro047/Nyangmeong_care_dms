import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'
import { verifyClientId } from '@/lib/oauth/tokens'

const BASE = 'http://localhost:3002/api/oauth/register'

function register(body: unknown) {
  return POST(new NextRequest(BASE, { method: 'POST', body: JSON.stringify(body) }))
}

describe('POST /api/oauth/register', () => {
  it('허용 redirect_uri 면 201 과 검증 가능한 client_id JWT 를 돌려줘야 한다', async () => {
    const res = await register({
      redirect_uris: ['http://localhost:54321/callback'],
      client_name: 'Claude Code',
      token_endpoint_auth_method: 'none',
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({
      client_name: 'Claude Code',
      redirect_uris: ['http://localhost:54321/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    })
    expect(typeof body.client_id_issued_at).toBe('number')
    expect(await verifyClientId(body.client_id)).toEqual({
      redirectUris: ['http://localhost:54321/callback'],
      clientName: 'Claude Code',
    })
  })

  it('redirect_uri 중 하나라도 허용 밖이면 400 invalid_redirect_uri 여야 한다', async () => {
    const res = await register({
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback', 'https://evil.com/cb'],
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_redirect_uri')
  })

  it('token_endpoint_auth_method 가 none 이 아니면 400 invalid_client_metadata 여야 한다', async () => {
    const res = await register({
      redirect_uris: ['http://localhost:54321/callback'],
      token_endpoint_auth_method: 'client_secret_basic',
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_client_metadata')
  })

  it('redirect_uris 가 비었거나 10개를 넘으면 400 이어야 한다', async () => {
    const empty = await register({ redirect_uris: [] })
    const many = await register({
      redirect_uris: Array.from({ length: 11 }, (_, i) => `http://localhost:${3000 + i}/cb`),
    })

    expect(empty.status).toBe(400)
    expect(many.status).toBe(400)
  })

  it('client_name 이 100자를 넘으면 400 이어야 한다', async () => {
    const res = await register({
      redirect_uris: ['http://localhost:54321/callback'],
      client_name: 'a'.repeat(101),
    })

    expect(res.status).toBe(400)
  })

  it('JSON 이 아닌 본문은 400 이어야 한다', async () => {
    const res = await POST(new NextRequest(BASE, { method: 'POST', body: 'not json' }))

    expect(res.status).toBe(400)
  })
})
