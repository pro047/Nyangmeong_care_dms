import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MCP_SCOPE } from '@/lib/oauth/metadata'
import { verifyPkceS256 } from '@/lib/oauth/pkce'
import {
  clientIdHash,
  signAccessToken,
  signRefreshToken,
  verifyAuthorizationCode,
  verifyRefreshToken,
} from '@/lib/oauth/tokens'

export const dynamic = 'force-dynamic'

function tokenResponse(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function issueTokens(
  user: { id: string; discordId: string; username: string; avatarUrl: string | null },
  cid: string,
  authTime: number,
) {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({ user, clientIdHash: cid }),
    signRefreshToken({ userId: user.id, clientIdHash: cid, authTime }),
  ])
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: refreshToken,
    scope: MCP_SCOPE,
  }
}

async function handleAuthorizationCode(form: FormData) {
  const code = form.get('code')
  const redirectUri = form.get('redirect_uri')
  const clientId = form.get('client_id')
  const codeVerifier = form.get('code_verifier')

  if (
    typeof code !== 'string' ||
    typeof redirectUri !== 'string' ||
    typeof clientId !== 'string' ||
    typeof codeVerifier !== 'string'
  ) {
    return tokenResponse({ error: 'invalid_request' }, 400)
  }

  const payload = await verifyAuthorizationCode(code)
  if (!payload) return tokenResponse({ error: 'invalid_grant' }, 400)

  const cid = clientIdHash(clientId)
  // 루프백도 포트까지 완전일치 — 같은 클라이언트가 같은 값을 보낸다는 전제다.
  if (payload.clientIdHash !== cid) return tokenResponse({ error: 'invalid_grant' }, 400)
  if (payload.redirectUri !== redirectUri) return tokenResponse({ error: 'invalid_grant' }, 400)
  if (!verifyPkceS256(codeVerifier, payload.codeChallenge)) {
    return tokenResponse({ error: 'invalid_grant' }, 400)
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } })
  if (!user) return tokenResponse({ error: 'invalid_grant' }, 400)

  return tokenResponse(await issueTokens(user, cid, Math.floor(Date.now() / 1000)), 200)
}

async function handleRefreshToken(form: FormData) {
  const refreshToken = form.get('refresh_token')
  const clientId = form.get('client_id')

  if (typeof refreshToken !== 'string' || typeof clientId !== 'string') {
    return tokenResponse({ error: 'invalid_request' }, 400)
  }

  const payload = await verifyRefreshToken(refreshToken)
  if (!payload) return tokenResponse({ error: 'invalid_grant' }, 400)
  if (payload.clientIdHash !== clientIdHash(clientId)) {
    return tokenResponse({ error: 'invalid_grant' }, 400)
  }

  // 30일 전 닉네임을 박제하지 않기 위해 재조회한다.
  const user = await prisma.user.findUnique({ where: { id: payload.userId } })
  if (!user) return tokenResponse({ error: 'invalid_grant' }, 400)

  return tokenResponse(await issueTokens(user, payload.clientIdHash, payload.authTime), 200)
}

/**
 * 무상태의 대가: 코드는 60초 안에 재사용될 수 있고 리프레시는 개별 취소가 안 된다
 * (사람이 받기로 함 — HANDOFF.md 미룬 항목).
 */
export async function POST(req: NextRequest) {
  // form 이 아닌 Content-Type 이면 formData() 가 던진다 — 500 이 아니라 400 이다.
  const form = await req.formData().catch(() => null)
  if (!form) return tokenResponse({ error: 'invalid_request' }, 400)
  const grantType = form.get('grant_type')

  if (grantType === 'authorization_code') return handleAuthorizationCode(form)
  if (grantType === 'refresh_token') return handleRefreshToken(form)
  return tokenResponse({ error: 'unsupported_grant_type' }, 400)
}
