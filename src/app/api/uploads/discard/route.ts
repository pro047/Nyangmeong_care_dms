import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { deleteObject } from '@/lib/s3'
import { verifyUploadToken } from '@/lib/upload-token'
import { notifyUpload } from '@/lib/discord'
import { discardUpload, discardUploadSchema } from '@/lib/upload-commit'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * S3 에는 올라갔는데 문서가 되지 못한 객체를 지운다 (취소·생성 실패).
 *
 * 브라우저가 S3 를 직접 지우게 하지 않는 이유: 삭제 여부 판단에 DB 참조 확인이 필요하고,
 * 그 권한을 클라이언트에 줄 수 없다. 삭제 권한은 `keyToken` 이 전부다 — "우리가 이
 * 사용자에게 5분 안에 발급한 키"만 지울 수 있어 임의 키 삭제는 불가능하다.
 *
 * 판정 순서는 `upload-commit.ts` 의 `discardUpload` 가 갖고 있다 — MCP `discard_upload`
 * 도구와 공유하는 자리다. 이 라우트는 파싱과 응답만 한다.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const parsed = discardUploadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const outcome = await discardUpload(parsed.data, session, {
    prisma,
    verifyUploadToken,
    deleteObject,
    notifyUpload,
    adminDiscordId: env.ADMIN_DISCORD_ID,
  })
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  }

  return NextResponse.json(outcome.value, { status: outcome.status })
}
