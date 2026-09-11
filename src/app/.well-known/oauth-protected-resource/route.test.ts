import { describe, expect, it } from 'vitest'
import { GET, OPTIONS } from './route'

const APP_URL = 'http://localhost:3002'

describe('GET /.well-known/oauth-protected-resource', () => {
  it('resource 는 자원 식별자 전체 URL(APP_URL/api/mcp), 인가 서버는 APP_URL 이어야 한다', async () => {
    // 요청 호스트를 일부러 다르게 준다 — 헤더로 origin 을 추측하지 않아야 한다(Vercel 프록시).
    const res = await GET(new Request('https://spoofed.example/.well-known/oauth-protected-resource'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resource).toBe(`${APP_URL}/api/mcp`)
    expect(body.authorization_servers).toEqual([APP_URL])
  })

  it('OPTIONS(CORS 사전 요청)에 응답해야 한다', async () => {
    const res = await OPTIONS()

    expect(res.status).toBeLessThan(300)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})
