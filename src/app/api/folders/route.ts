import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { FOLDER_NAME_CONFLICT, folderCreateSchema, folderMutationFailure } from '@/lib/folder'

export const dynamic = 'force-dynamic'

/** 폴더 생성. 전원 동등하므로 문서와 마찬가지로 작성자 개념을 두지 않는다. */
export async function POST(req: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const parsed = folderCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { name } = parsed.data
  const parentId = parsed.data.parentId ?? null

  // @@unique([parentId, name]) 는 parentId 가 null 인 최상위 폴더끼리는 못 막는다
  // (Postgres 는 NULL 끼리 서로 다른 값으로 본다). 루트 중복을 막는 것은 이 사전 확인뿐이다.
  // 확인과 create 사이의 경합 창은 수용한다 — 7인 팀이고 결과는 중복 폴더 하나다.
  const duplicate = await prisma.folder.findFirst({ where: { parentId, name }, select: { id: true } })
  if (duplicate) {
    return NextResponse.json({ error: FOLDER_NAME_CONFLICT }, { status: 409 })
  }

  try {
    const folder = await prisma.folder.create({
      data: { name, parentId },
      select: { id: true, name: true },
    })
    return NextResponse.json(folder, { status: 201 })
  } catch (err) {
    const failure = folderMutationFailure(err)
    if (!failure) throw err
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }
}
