import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { tagUpdateFailure, tagsPutSchema } from '@/lib/tag'

export const dynamic = 'force-dynamic'

/**
 * 태그 집합 교체. 부분 수정(추가/제거) 대신 통째로 받는 이유는 편집 UI 가 칩 목록 하나이고,
 * 그래야 조인 테이블을 한 번의 쓰기로 맞출 수 있기 때문이다.
 *
 * 어느 문서에도 안 붙게 된 Tag 행은 지우지 않는다 — 문서를 거쳐야만 화면에 나오므로 무해하다.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const parsed = tagsPutSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { id } = await params
  const names = parsed.data.tags

  try {
    // 중첩 쓰기라 부모의 @updatedAt 도 갱신된다 — 태그를 고친 것도 문서를 만진 것이므로
    // 목록(최근 수정순) 위로 올라오는 것이 맞다 (PATCH 와 같은 입장).
    await prisma.document.update({
      // activeDocumentWhere() 와 같은 조건. update 는 WhereUniqueInput 이라 spread 하면
      // id 타입이 StringFilter 로 넓어져 컴파일되지 않는다 (versions/route.ts 와 동일).
      where: { id, deletedAt: null },
      data: {
        tags: {
          deleteMany: {},
          create: names.map((name) => ({
            tag: { connectOrCreate: { where: { name }, create: { name } } },
          })),
        },
      },
      select: { id: true },
    })
  } catch (err) {
    const failure = tagUpdateFailure(err)
    if (!failure) throw err
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }

  return NextResponse.json({ id, tags: names })
}
