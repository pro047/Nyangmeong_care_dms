import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notifyUpload } from '@/lib/discord'
import { headObjectSize } from '@/lib/s3'
import { verifyUploadToken } from '@/lib/upload-token'
import { versionCreateSchema } from '@/lib/version-create'
import { addVersion } from '@/lib/upload-commit'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * 재업로드. S3 업로드가 끝난 뒤 호출되고 DocumentVersion 을 더한다. Document 본체는
 * 제목을 빼면 그대로다 — 자동 생성된 제목만 새 파일명을 따라간다 (retitleOnReupload).
 *
 * 소유자 검사(삭제와 같은 경계, ownership.ts)를 포함한 전체 순서(소유자 → 토큰 →
 * 재사용 확인 → HeadObject → 크기 → 붙이기 → 알림)는 `upload-commit.ts` 의 `addVersion`
 * 이 갖고 있다 — MCP `add_version` 도구와 공유하는 자리다. `denyIfNotOwner` 는
 * `NextResponse` 를 돌려주는 라우트 전용 헬퍼라 여기서 쓸 수 없어, `addVersion` 이
 * `canManageDocument` 를 직접 부른다. 이 라우트는 파싱과 상태 코드 변환만 한다.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const parsed = versionCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { id } = await params

  const outcome = await addVersion(id, parsed.data, session, {
    prisma,
    verifyUploadToken,
    headObjectSize,
    notifyUpload,
    adminDiscordId: env.ADMIN_DISCORD_ID,
  })
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  }

  return NextResponse.json({ id: outcome.value.id, versionNo: outcome.value.versionNo }, { status: outcome.status })
}
