import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import {
  FOLDER_NAME_CONFLICT,
  FOLDER_NOT_FOUND,
  folderMutationFailure,
  folderPatchSchema,
} from '@/lib/folder'

export const dynamic = 'force-dynamic'

/** 이름 변경. 부모는 바꾸지 않는다 — reparent 를 허용하는 순간 순환 검사가 필요해진다. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const parsed = folderPatchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { id } = await params
  const { name } = parsed.data

  // "같은 위치"를 판정하려면 대상의 부모를 알아야 한다.
  const target = await prisma.folder.findUnique({ where: { id }, select: { parentId: true } })
  if (!target) {
    return NextResponse.json({ error: FOLDER_NOT_FOUND }, { status: 404 })
  }

  // 루트 폴더는 unique 제약이 안 막으므로 여기서 본다 (POST 와 같은 이유).
  const duplicate = await prisma.folder.findFirst({
    where: { parentId: target.parentId, name, NOT: { id } },
    select: { id: true },
  })
  if (duplicate) {
    return NextResponse.json({ error: FOLDER_NAME_CONFLICT }, { status: 409 })
  }

  try {
    await prisma.folder.update({ where: { id }, data: { name }, select: { id: true } })
  } catch (err) {
    const failure = folderMutationFailure(err)
    if (!failure) throw err
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }

  return NextResponse.json({ id })
}

/**
 * 하드 삭제. 하위 폴더는 onDelete: Cascade 로 함께 지워지고 소속 문서는 onDelete: SetNull 로
 * 미분류가 된다 — 문서 자체는 사라지지 않는다. 확인 문구는 클라이언트가 띄운다.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params

  try {
    await prisma.folder.delete({ where: { id }, select: { id: true } })
  } catch (err) {
    const failure = folderMutationFailure(err)
    if (!failure) throw err
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }

  return NextResponse.json({ id })
}
