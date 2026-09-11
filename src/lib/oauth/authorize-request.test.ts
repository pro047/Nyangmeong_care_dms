import { describe, expect, it } from 'vitest'
import { authorizeQuerySchema, errorRedirectUrl } from '@/lib/oauth/authorize-request'

const VALID_QUERY = {
  response_type: 'code',
  client_id: 'client-jwt',
  redirect_uri: 'http://localhost:41234/cb',
  code_challenge: 'a'.repeat(43),
  code_challenge_method: 'S256',
  state: 'xyz',
}

describe('authorizeQuerySchema', () => {
  it('정상 쿼리를 파싱해야 한다', () => {
    const result = authorizeQuerySchema.safeParse(VALID_QUERY)
    expect(result.success).toBe(true)
  })

  it('code_challenge_method=plain 은 거부해야 한다', () => {
    const result = authorizeQuerySchema.safeParse({ ...VALID_QUERY, code_challenge_method: 'plain' })
    expect(result.success).toBe(false)
  })

  it('response_type=token 은 거부해야 한다', () => {
    const result = authorizeQuerySchema.safeParse({ ...VALID_QUERY, response_type: 'token' })
    expect(result.success).toBe(false)
  })
})

describe('errorRedirectUrl', () => {
  it('state 를 되돌려주고 기존 쿼리를 보존해야 한다', () => {
    const url = errorRedirectUrl(
      'http://localhost:41234/cb?foo=bar',
      'access_denied',
      '사용자가 거부했습니다.',
      'xyz',
    )
    const parsed = new URL(url)
    expect(parsed.searchParams.get('foo')).toBe('bar')
    expect(parsed.searchParams.get('error')).toBe('access_denied')
    expect(parsed.searchParams.get('error_description')).toBe('사용자가 거부했습니다.')
    expect(parsed.searchParams.get('state')).toBe('xyz')
  })

  it('state 가 없으면 state 파라미터를 붙이지 않아야 한다', () => {
    const url = errorRedirectUrl('http://localhost:41234/cb', 'invalid_target', '설명')
    expect(new URL(url).searchParams.has('state')).toBe(false)
  })
})
