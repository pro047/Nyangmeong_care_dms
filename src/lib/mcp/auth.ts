import type { AuthInfo } from '@modelcontextprotocol/server'
import { verifyAccessToken } from '@/lib/oauth/tokens'

/**
 * `withMcpAuth` 의 verifyToken. bearer 가 없거나 검증 실패면 undefined 를 돌려주고,
 * 그러면 `withMcpAuth` 가 401 + `WWW-Authenticate: Bearer resource_metadata="…"` 를 낸다.
 */
export async function verifyMcpBearer(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined

  const payload = await verifyAccessToken(bearerToken)
  if (!payload) return undefined

  return {
    token: bearerToken,
    clientId: payload.clientIdHash,
    scopes: ['dms'],
    expiresAt: payload.expiresAt,
    extra: {
      userId: payload.userId,
      discordId: payload.discordId,
      username: payload.username,
    },
  }
}
