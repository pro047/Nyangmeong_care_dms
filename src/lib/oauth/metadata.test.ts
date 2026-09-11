import { describe, expect, it } from 'vitest'
import { authorizationServerMetadata, MCP_RESOURCE_PATH, MCP_SCOPE } from '@/lib/oauth/metadata'

const APP_URL = 'https://dms.example.com'

describe('authorizationServerMetadata', () => {
  it('필드가 APP_URL 로 조립돼야 한다', () => {
    const metadata = authorizationServerMetadata(APP_URL)
    expect(metadata.issuer).toBe(APP_URL)
    expect(metadata.authorization_endpoint).toBe(`${APP_URL}/oauth/authorize`)
    expect(metadata.token_endpoint).toBe(`${APP_URL}/api/oauth/token`)
    expect(metadata.registration_endpoint).toBe(`${APP_URL}/api/oauth/register`)
  })

  it('배열 값이 고정된 표와 같아야 한다', () => {
    const metadata = authorizationServerMetadata(APP_URL)
    expect(metadata.response_types_supported).toEqual(['code'])
    expect(metadata.grant_types_supported).toEqual(['authorization_code', 'refresh_token'])
    expect(metadata.code_challenge_methods_supported).toEqual(['S256'])
    expect(metadata.token_endpoint_auth_methods_supported).toEqual(['none'])
    expect(metadata.scopes_supported).toEqual([MCP_SCOPE])
    expect(metadata.client_id_metadata_document_supported).toBe(false)
  })

  it('MCP_RESOURCE_PATH·MCP_SCOPE 상수가 고정값이어야 한다', () => {
    expect(MCP_RESOURCE_PATH).toBe('/api/mcp')
    expect(MCP_SCOPE).toBe('dms')
  })
})
