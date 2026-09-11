import { describe, expect, it } from 'vitest'
import { GET } from './route'

// vitest.config 의 더미 APP_URL.
const APP_URL = 'http://localhost:3002'

describe('GET /.well-known/oauth-authorization-server', () => {
  it('APP_URL 로 조립한 RFC 8414 문서를 1시간 캐시로 내보내야 한다', async () => {
    const res = GET()

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    const body = await res.json()
    expect(body).toMatchObject({
      issuer: APP_URL,
      authorization_endpoint: `${APP_URL}/oauth/authorize`,
      token_endpoint: `${APP_URL}/api/oauth/token`,
      registration_endpoint: `${APP_URL}/api/oauth/register`,
      code_challenge_methods_supported: ['S256'],
      client_id_metadata_document_supported: false,
    })
  })
})
