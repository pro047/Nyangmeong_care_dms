export const MCP_RESOURCE_PATH = '/api/mcp'
export const MCP_SCOPE = 'dms'

/** RFC 8414 인가 서버 메타데이터. */
export function authorizationServerMetadata(appUrl: string) {
  return {
    issuer: appUrl,
    authorization_endpoint: `${appUrl}/oauth/authorize`,
    token_endpoint: `${appUrl}/api/oauth/token`,
    registration_endpoint: `${appUrl}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [MCP_SCOPE],
    // CIMD 는 이 단계에서 지원하지 않는다 — DCR 만 연다.
    client_id_metadata_document_supported: false,
  }
}
