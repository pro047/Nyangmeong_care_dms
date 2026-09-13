import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { presignDownload, presignUpload, buildS3Key, headObjectSize, deleteObject, getObjectBytes } from '@/lib/s3'
import { verifyUploadToken, signUploadToken } from '@/lib/upload-token'
import { notifyUpload } from '@/lib/discord'
import { verifyMcpBearer } from '@/lib/mcp/auth'
import { registerDmsTools } from '@/lib/mcp/server'
import { createDocument, addVersion, discardUpload } from '@/lib/upload-commit'
import type { Uploader } from '@/lib/upload-commit'
import type { Viewer } from '@/lib/ownership'

export const dynamic = 'force-dynamic'

// stateless 모드라 이 팩토리는 요청마다 다시 불린다(인증 통과 후). 여기 안에 두어야
// api/mcp/route.test.ts(401 경계만 보는 테스트, @/lib/s3 를 presignDownload 하나로만
// 목한다)가 인증 실패 케이스에서 headObjectSize·deleteObject 를 건드리지 않는다.
const handler = withMcpAuth(
  createMcpHandler(
    (server) => {
      const commitDeps = {
        prisma,
        verifyUploadToken,
        headObjectSize,
        deleteObject,
        notifyUpload,
        adminDiscordId: env.ADMIN_DISCORD_ID,
      }
      registerDmsTools(server, {
        prisma,
        presignDownload,
        presignUpload,
        buildS3Key,
        signUploadToken,
        adminDiscordId: env.ADMIN_DISCORD_ID,
        getObjectBytes,
        commit: {
          createDocument: (input, uploader: Uploader) => createDocument(input, uploader, commitDeps),
          addVersion: (documentId, input, uploader: Uploader) =>
            addVersion(documentId, input, uploader, commitDeps),
          discardUpload: (input, viewer: Viewer) => discardUpload(input, viewer, commitDeps),
        },
      })
    },
    {
      serverInfo: { name: 'dms', version: '1' },
    },
  ),
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
