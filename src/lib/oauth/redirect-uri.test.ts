import { describe, expect, it } from 'vitest'
import {
  ALLOWED_REDIRECT_URIS,
  isAllowedRedirectUri,
  matchesRegisteredRedirectUri,
} from '@/lib/oauth/redirect-uri'

// 목록 상수를 순회만 하면 상수에서 값이 빠져도 테스트가 같이 줄어든다 — 설계 값을 박아 둔다.
const DESIGN_ALLOWED = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
  'https://chatgpt.com/connector_platform_oauth_redirect',
  'https://chatgpt.com/oauth/callback',
  'https://chat.openai.com/oauth/callback',
]

describe('isAllowedRedirectUri', () => {
  it('허용 목록 5개는 전부 통과해야 한다', () => {
    for (const uri of ALLOWED_REDIRECT_URIS) {
      expect(isAllowedRedirectUri(uri)).toBe(true)
    }
  })

  it('허용 목록 상수가 설계의 5개와 정확히 같아야 한다', () => {
    expect([...ALLOWED_REDIRECT_URIS].sort()).toEqual([...DESIGN_ALLOWED].sort())
    for (const uri of DESIGN_ALLOWED) {
      expect(isAllowedRedirectUri(uri)).toBe(true)
    }
  })

  it('루프백(http, 127.0.0.1)도 포트·경로와 무관하게 통과해야 한다', () => {
    expect(isAllowedRedirectUri('http://127.0.0.1:61000/oauth/callback')).toBe(true)
  })

  it('URL 로 파싱되지 않는 문자열은 거부해야 한다', () => {
    expect(isAllowedRedirectUri('not a url')).toBe(false)
  })

  it('허용 목록에 슬래시를 하나 더 붙이면 거부해야 한다', () => {
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback/')).toBe(false)
  })

  it('허용 목록에 없는 https 호스트는 거부해야 한다', () => {
    expect(isAllowedRedirectUri('https://evil.com')).toBe(false)
  })

  it('루프백(http, localhost)은 포트가 달라도 통과해야 한다', () => {
    expect(isAllowedRedirectUri('http://localhost:54321/callback')).toBe(true)
  })

  it('호스트명이 localhost 를 포함할 뿐이면 거부해야 한다', () => {
    expect(isAllowedRedirectUri('http://localhost.evil.com/')).toBe(false)
  })

  it('https 루프백은 목록에 없으므로 거부해야 한다', () => {
    expect(isAllowedRedirectUri('https://localhost:1/')).toBe(false)
  })
})

describe('matchesRegisteredRedirectUri', () => {
  it('등록된 루프백과 포트만 다르면 매칭해야 한다', () => {
    expect(
      matchesRegisteredRedirectUri('http://localhost:41234/cb', ['http://localhost:3000/cb']),
    ).toBe(true)
  })

  it('경로가 다르면 매칭하지 않아야 한다', () => {
    expect(
      matchesRegisteredRedirectUri('http://localhost:41234/other', ['http://localhost:3000/cb']),
    ).toBe(false)
  })

  it('루프백이라도 호스트가 다르면(localhost ↔ 127.0.0.1) 매칭하지 않아야 한다', () => {
    expect(
      matchesRegisteredRedirectUri('http://127.0.0.1:41234/cb', ['http://localhost:3000/cb']),
    ).toBe(false)
  })

  it('등록값이 https 뿐이면 루프백 요청은 매칭하지 않아야 한다', () => {
    expect(
      matchesRegisteredRedirectUri('http://localhost:41234/cb', [
        'https://claude.ai/api/mcp/auth_callback',
      ]),
    ).toBe(false)
  })

  it('https 는 완전일치만 매칭해야 한다', () => {
    expect(
      matchesRegisteredRedirectUri('https://claude.ai/api/mcp/auth_callback', [
        'https://claude.ai/api/mcp/auth_callback',
      ]),
    ).toBe(true)
    expect(
      matchesRegisteredRedirectUri('https://claude.ai/api/mcp/auth_callback/', [
        'https://claude.ai/api/mcp/auth_callback',
      ]),
    ).toBe(false)
  })
})
