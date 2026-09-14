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

/**
 * ChatGPT 는 인가 서버가 RFC 9207(인가 응답의 `iss`)을 광고하지 않으면 위의 고정 콜백 대신
 * 커넥터마다 다른 `/connector/oauth/{callback_id}` 를 쓴다(2026-09-14, 커넥터 생성이
 * invalid_redirect_uri 로 거절됐다). id 를 목록에 박을 수 없어 이 한 세그먼트만 가변으로 받는다.
 * 받는 쪽이 여전히 chatgpt.com 이라 고정 콜백을 허용한 것보다 노출이 늘지 않는다.
 */
const CHATGPT_CALLBACK_ID_PATH = /^\/connector\/oauth\/[A-Za-z0-9_-]+$/

function isChatgptCallbackIdUri(uri: string): boolean {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return false
  }
  // href 와 원문을 비교하는 이유: `..`·기본 포트처럼 파서가 정규화해 버리는 변형이
  // 정규식을 통과한 뒤 등록값으로는 원문이 저장되는 것을 막는다.
  return (
    url.href === uri &&
    url.protocol === 'https:' &&
    url.host === 'chatgpt.com' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    CHATGPT_CALLBACK_ID_PATH.test(url.pathname)
  )
}

/** 등록(DCR) 시점에 이 redirect_uri 를 받아줄지. */
export function isAllowedRedirectUri(uri: string): boolean {
  if (ALLOWED_REDIRECT_URIS.includes(uri)) return true
  if (isChatgptCallbackIdUri(uri)) return true
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
