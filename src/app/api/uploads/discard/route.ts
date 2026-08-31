import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { deleteObject } from '@/lib/s3'
import { verifyUploadToken } from '@/lib/upload-token'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  // presign 응답을 그대로 되돌려받는다.
  s3Key: z.string().min(1),
  keyToken: z.string().min(1),
})

/**
 * S3 에는 올라갔는데 문서가 되지 못한 객체를 지운다 (취소·생성 실패).
 *
 * 브라우저가 S3 를 직접 지우게 하지 않는 이유: 삭제 여부 판단에 DB 참조 확인이 필요하고,
 * 그 권한을 클라이언트에 줄 수 없다. 삭제 권한은 `keyToken` 이 전부다 — "우리가 이
 * 사용자에게 5분 안에 발급한 키"만 지울 수 있어 임의 키 삭제는 불가능하다.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { s3Key, keyToken } = parsed.data

  if (!(await verifyUploadToken(keyToken, s3Key, session.id))) {
    return NextResponse.json({ error: '업로드 정보가 만료되었거나 올바르지 않습니다.' }, { status: 400 })
  }

  // 이미 문서가 된 키는 지우지 않는다. 클라이언트는 "create 가 실패했다"까지만 알고
  // 실제로 저장됐는지는 모른다 — 응답만 잃은 경우가 있어 판정은 여기서 한다.
  // 파일 유실보다 고아가 낫다는 원칙은 purge/route.ts 와 같다.
  const used = await prisma.documentVersion.count({ where: { s3Key } })
  if (used > 0) {
    return NextResponse.json({ deleted: false })
  }

  // 정리는 최선 노력이다. 여기서 500 을 내면 사람이 '닫기'를 눌렀을 뿐인데 실패로 보인다.
  try {
    await deleteObject(s3Key)
  } catch (err) {
    console.error('업로드 정리: S3 객체 삭제 실패 (고아로 남음):', s3Key, err)
    return NextResponse.json({ deleted: false })
  }

  return NextResponse.json({ deleted: true })
}
