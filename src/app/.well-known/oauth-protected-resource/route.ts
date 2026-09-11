import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from 'mcp-handler'
import { env } from '@/lib/env'
import { MCP_RESOURCE_PATH } from '@/lib/oauth/metadata'

export const dynamic = 'force-dynamic'

// resourceUrl 을 명시하는 이유: Vercel 프록시 뒤에서 헤더로 origin 을 추측하지 않기
// 위해서다. **여기의 resourceUrl 은 자원 식별자 전체 URL** 이다 — `/api/mcp` 라우트의
// withMcpAuth 에 넘기는 같은 이름 인자(origin)와 뜻이 다르다.
export const GET = protectedResourceHandler({
  authServerUrls: [env.APP_URL],
  resourceUrl: `${env.APP_URL}${MCP_RESOURCE_PATH}`,
})

export const OPTIONS = metadataCorsOptionsRequestHandler()
