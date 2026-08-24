import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import {
  ACTIVE_DOCUMENT_NOT_FOUND,
  activeDocumentWhere,
  outcomeFromCount,
  TRASH_NOT_FOUND,
} from '@/lib/trash'
import { documentPatchSchema, toDocumentPatchData } from '@/lib/document-edit'

export const dynamic = 'force-dynamic'

/**
 * 제목·설명 수정. 삭제와 같은 이유로 작성자를 보지 않고, 같은 updateMany + count 패턴을 쓴다.
 * @updatedAt 이 함께 갱신돼 목록(최근 수정순) 위로 올라온다 — "수정"이므로 의도한 동작이다.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const parsed = documentPatchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { id } = await params

  const { count } = await prisma.document.updateMany({
    where: { id, ...activeDocumentWhere() },
    data: toDocumentPatchData(parsed.data),
  })

  const outcome = outcomeFromCount(count, ACTIVE_DOCUMENT_NOT_FOUND)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  }

  return NextResponse.json({ id })
}

/**
 * 소프트 삭제. deletedAt만 세팅하고 S3 객체와 버전은 그대로 둔다.
 * 전원 동등하므로 작성자 여부는 보지 않는다.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params

  // updateMany + count: 조회 후 수정하면 그 사이에 남이 지울 수 있다. 한 쿼리로 끝낸다.
  const { count } = await prisma.document.updateMany({
    where: { id, ...activeDocumentWhere() },
    data: { deletedAt: new Date() },
  })

  const outcome = outcomeFromCount(count, TRASH_NOT_FOUND)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  }

  return NextResponse.json({ id })
}
