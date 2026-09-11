import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { presignDownload } from '@/lib/s3'
import { verifyMcpBearer } from '@/lib/mcp/auth'
import { registerDmsTools } from '@/lib/mcp/server'

export const dynamic = 'force-dynamic'

const handler = withMcpAuth(
  createMcpHandler((server) => registerDmsTools(server, { prisma, presignDownload }), {
    serverInfo: { name: 'dms', version: '1' },
  }),
  verifyMcpBearer,
  {
    required: true,
    // resourceUrl 은 여기서는 **origin** 이다 — 뒤에 resourceMetadataPath(기본값
    // /.well-known/oauth-protected-resource)가 그대로 붙는다(mcp-handler/dist/index.js:148-149).
    // protectedResourceHandler 의 같은 이름 인자는 자원 식별자 전체 URL(APP_URL/api/mcp)이라
    // 뜻이 다르다 — 여기 그 값을 넣으면 401 헤더가 …/api/mcp/.well-known/… 를 가리켜
    // 클라이언트가 404 를 받는다(판단검증 2026-09-11 #9).
    resourceUrl: env.APP_URL,
  },
)

export { handler as GET, handler as POST }
