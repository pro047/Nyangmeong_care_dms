/**
 * MCP 클라이언트가 등록할 수 있는 redirect_uri. 외부 서비스가 실제로 쓰는 콜백 값이라
 * 저장소 안에서는 근거를 못 댄다 — 틀리면 등록 단계에서 바로 드러난다.
 */
export const ALLOWED_REDIRECT_URIS: readonly string[] = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
  'https://chatgpt.com/connector_platform_oauth_redirect',
  'https://chatgpt.com/oauth/callback',
  'https://chat.openai.com/oauth/callback',
]

/** 루프백(CLI 클라이언트, RFC 8252 §7.3)은 포트가 매번 바뀌므로 호스트·경로만 본다. */
function loopbackHostAndPath(uri: string): { host: string; path: string } | null {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return null
  }
  if (url.protocol !== 'http:') return null
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return null
  return { host: url.hostname, path: url.pathname + url.search }
}

/** 등록(DCR) 시점에 이 redirect_uri 를 받아줄지. */
export function isAllowedRedirectUri(uri: string): boolean {
  if (ALLOWED_REDIRECT_URIS.includes(uri)) return true
  return loopbackHostAndPath(uri) !== null
}

/** 인가 요청의 redirect_uri 가 등록값과 같은 것인지. 루프백끼리는 포트를 무시한다. */
export function matchesRegisteredRedirectUri(
  requested: string,
  registered: readonly string[],
): boolean {
  const requestedLoopback = loopbackHostAndPath(requested)
  if (requestedLoopback === null) return registered.includes(requested)

  return registered.some((candidate) => {
    const candidateLoopback = loopbackHostAndPath(candidate)
    return (
      candidateLoopback !== null &&
      candidateLoopback.host === requestedLoopback.host &&
      candidateLoopback.path === requestedLoopback.path
    )
  })
}
