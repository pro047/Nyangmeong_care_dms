import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { canDeleteDocument, DELETE_FORBIDDEN, type Viewer } from '@/lib/ownership'

/**
 * 삭제 계열 라우트(소프트 삭제·복구·영구삭제)가 공유하는 소유자 검사.
 * 막을 때만 응답을 돌려주고, 통과하면 null 이라 호출부의 흐름이 안 바뀐다.
 *
 * **조회를 한 번 더 내는 대신 403 을 낸다.** 이 리포의 다른 변경 라우트는 조건을 전부
 * updateMany 의 where 에 얹고 count 로 판정하는데(조회와 쓰기 사이가 비어 있으므로),
 * 그 방식이면 count 0 이 "없는 문서"와 "남의 문서"를 구분하지 못해 둘 다 404 가 된다.
 * 권한 실패는 사용자가 이유를 알아야 행동을 바꿀 수 있는 종류라 뭉개면 안 된다.
 *
 * **여기서 열리는 TOCTOU 창은 실질적으로 닫혀 있다** — createdById 를 쓰는 코드 경로가
 * 문서 생성 한 곳뿐이라(documents/route.ts) 판정 후 소유자가 바뀔 수가 없다.
 *
 * 문서가 없으면 통과시킨다. "없음"의 판정은 호출부의 count 가 이미 하고 있고, 여기서
 * 404 를 따로 내면 같은 판정이 두 곳으로 갈린다.
 */
export async function denyIfNotOwner(
  documentId: string,
  viewer: Viewer,
): Promise<NextResponse | null> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { createdById: true },
  })
  if (!document) return null

  if (!canDeleteDocument(viewer, document, env.ADMIN_DISCORD_ID)) {
    return NextResponse.json({ error: DELETE_FORBIDDEN }, { status: 403 })
  }
  return null
}
