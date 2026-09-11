export const RETURN_TO_COOKIE = 'dms_return_to'

/**
 * 로그인 후 돌아갈 곳. `/oauth/authorize?` 로 시작하는 문자열만 그대로 돌려주고,
 * 그 외는 전부 `'/'` 다 — 오픈 리다이렉트를 여는 대신 목적지를 하나로 못박는다.
 */
export function safeReturnTo(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '/'
  if (!raw.startsWith('/oauth/authorize?')) return '/'
  if (raw.includes('\n') || raw.includes('\r')) return '/'
  return raw
}
