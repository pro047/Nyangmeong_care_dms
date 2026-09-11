import { z } from 'zod'

export const authorizeQuerySchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal('S256'),
  state: z.string().optional(),
  scope: z.string().optional(),
  // RFC 8707. 값을 강제하지 않고 있으면 APP_URL/api/mcp 인지만 본다(authorize 페이지·라우트).
  resource: z.string().optional(),
})

export type AuthorizeQuery = z.infer<typeof authorizeQuerySchema>

/**
 * 오류를 어디로 보낼지. client_id·redirect_uri 자체가 틀리면 절대 redirect 하지 않는다
 * (RFC 6749 §4.1.2.1) — 공격자가 지정한 임의의 주소로 오류를 보내는 통로가 되기 때문이다.
 */
export type AuthorizeFailure =
  | { kind: 'show'; message: string }
  | { kind: 'redirect'; error: string; description: string }

/** redirect_uri 가 이미 가진 쿼리를 보존하면서 오류 파라미터만 얹는다. */
export function errorRedirectUrl(
  redirectUri: string,
  error: string,
  description: string,
  state?: string,
): string {
  const url = new URL(redirectUri)
  url.searchParams.set('error', error)
  url.searchParams.set('error_description', description)
  if (state !== undefined) url.searchParams.set('state', state)
  return url.toString()
}
