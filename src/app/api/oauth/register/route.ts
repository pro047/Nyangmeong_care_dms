import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isAllowedRedirectUri } from '@/lib/oauth/redirect-uri'
import { signClientId } from '@/lib/oauth/tokens'

export const dynamic = 'force-dynamic'

const registerSchema = z.object({
  redirect_uris: z.array(z.string()).min(1).max(10),
  client_name: z.string().max(100).optional(),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
})

/**
 * 동적 클라이언트 등록 (RFC 7591). 인증 없음 — 등록만으로는 아무것도 못 한다.
 * 토큰은 동의 화면을 지난 세션에만 나간다.
 */
export async function POST(req: NextRequest) {
  const parsed = registerSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: '요청 형식이 올바르지 않습니다.' },
      { status: 400 },
    )
  }

  const { redirect_uris, client_name, token_endpoint_auth_method } = parsed.data

  if (redirect_uris.some((uri) => !isAllowedRedirectUri(uri))) {
    return NextResponse.json(
      { error: 'invalid_redirect_uri', error_description: '허용되지 않은 redirect_uri 입니다.' },
      { status: 400 },
    )
  }

  // 시크릿을 저장할 곳이 없다 — 공개 클라이언트만 받는다.
  if (token_endpoint_auth_method !== undefined && token_endpoint_auth_method !== 'none') {
    return NextResponse.json(
      {
        error: 'invalid_client_metadata',
        error_description: 'token_endpoint_auth_method 는 none 만 지원합니다.',
      },
      { status: 400 },
    )
  }

  const clientName = client_name ?? 'MCP Client'
  const clientId = await signClientId({ redirectUris: redirect_uris, clientName })

  return NextResponse.json(
    {
      client_id: clientId,
      client_name: clientName,
      redirect_uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
    { status: 201 },
  )
}
