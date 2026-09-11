import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { env } from '@/lib/env'
import { MCP_RESOURCE_PATH, MCP_SCOPE } from '@/lib/oauth/metadata'
import { authorizeQuerySchema, errorRedirectUrl } from '@/lib/oauth/authorize-request'
import { matchesRegisteredRedirectUri } from '@/lib/oauth/redirect-uri'
import { clientIdHash, signAuthorizationCode, verifyClientId } from '@/lib/oauth/tokens'

export const dynamic = 'force-dynamic'

/**
 * 폼 POST 를 받는 라우트라 상태 코드를 302 로 못박는다. `NextResponse.redirect` 기본값은
 * 307 인데, 307 은 메서드와 본문을 보존해 브라우저가 동의 폼 본문(client_id·code_challenge·
 * decision…)을 OAuth 콜백에 **POST 로 재전송**한다 — 콜백은 GET 을 전제한다
 * (검증 2026-09-11 에서 실패 테스트로 잡힘).
 */
const redirectToClient = (url: string) => NextResponse.redirect(url, 302)

/**
 * 동의 폼 제출. sameSite lax 쿠키라 타 사이트 폼으로는 세션이 안 실린다 —
 * CSRF 토큰을 따로 두지 않는다.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const form = await req.formData()
  const query: Record<string, string> = {}
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') query[key] = value
  }

  // 페이지(GET /oauth/authorize)와 같은 순수 함수로 검증한다 — 두 벌 두지 않는다.
  const parsed = authorizeQuerySchema.safeParse(query)
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }
  const { client_id, redirect_uri, code_challenge, state, resource } = parsed.data

  const client = await verifyClientId(client_id)
  if (!client) {
    return NextResponse.json({ error: '등록되지 않은 클라이언트입니다.' }, { status: 400 })
  }
  if (!matchesRegisteredRedirectUri(redirect_uri, client.redirectUris)) {
    return NextResponse.json({ error: '등록되지 않은 redirect_uri 입니다.' }, { status: 400 })
  }
  if (resource !== undefined && resource !== `${env.APP_URL}${MCP_RESOURCE_PATH}`) {
    return redirectToClient(
      errorRedirectUrl(redirect_uri, 'invalid_target', '지원하지 않는 resource 입니다.', state),
    )
  }

  if (query.decision !== 'allow') {
    return redirectToClient(
      errorRedirectUrl(redirect_uri, 'access_denied', '사용자가 거부했습니다.', state),
    )
  }

  const code = await signAuthorizationCode({
    userId: session.id,
    clientIdHash: clientIdHash(client_id),
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    scope: MCP_SCOPE,
  })

  const url = new URL(redirect_uri)
  url.searchParams.set('code', code)
  if (state !== undefined) url.searchParams.set('state', state)
  return redirectToClient(url.toString())
}
