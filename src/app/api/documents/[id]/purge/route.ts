import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { deleteObject } from '@/lib/s3'
import {
  outcomeFromCount,
  purgeCandidateKeys,
  PURGE_NOT_FOUND,
  trashedDocumentWhere,
} from '@/lib/trash'

export const dynamic = 'force-dynamic'

/**
 * 영구삭제. 되돌릴 수 없다. 휴지통에 있는 문서만 대상이다 — 활성 문서를 한 번에
 * 지우는 경로를 만들지 않는 것이 소프트 삭제를 둔 이유다.
 *
 * 순서가 중요하다. **DB 를 먼저 지우고 S3 를 나중에 지운다.** 반대로 하면 S3 삭제 후
 * DB 삭제가 실패했을 때 존재하지 않는 객체를 가리키는 문서가 휴지통에 남아, 복구해도
 * 다운로드가 S3 XML 을 뱉는다. 이 순서면 최악이 고아 객체이고, 그건 이미 아는 문제다
 * (HANDOFF "S3 고아 객체 정리").
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { id } = await params

  // 지우기 전에 키를 확보한다. 삭제 후에는 버전 행이 없어서 무엇을 지울지 알 수 없다.
  const versions = await prisma.documentVersion.findMany({
    where: { documentId: id, document: trashedDocumentWhere() },
    select: { s3Key: true },
  })
  const keys = purgeCandidateKeys(versions)

  // deleteMany + count: 조회와 삭제 사이에 남이 복구할 수 있다. 조건을 삭제 쿼리에 건다.
  // 버전·태그 연결은 스키마의 onDelete: Cascade 가 함께 지운다.
  const { count } = await prisma.document.deleteMany({
    where: { id, ...trashedDocumentWhere() },
  })

  const outcome = outcomeFromCount(count, PURGE_NOT_FOUND)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  }

  // 다른 문서가 같은 키를 가리키면 지우지 않는다. `keyToken` 이 5분간 재사용 가능해서
  // 서로 다른 문서가 같은 S3 객체를 공유할 수 있고(HANDOFF "미룬 항목"), 그걸 모르고
  // 지우면 **남의 문서 파일이 사라진다.** 남는 쪽은 고아 객체인데, 파일 유실보다 낫다.
  //
  // S3 실패로 요청을 실패시키지 않는다. DB 는 이미 지워졌고, 여기서 500 을 내면
  // 사용자는 실패한 줄 알고 다시 눌러 404 를 받는다.
  for (const key of keys) {
    try {
      const stillUsed = await prisma.documentVersion.count({ where: { s3Key: key } })
      if (stillUsed === 0) await deleteObject(key)
    } catch (err) {
      console.error('영구삭제: S3 객체 정리 실패 (고아로 남음):', key, err)
    }
  }

  return NextResponse.json({ id })
}
