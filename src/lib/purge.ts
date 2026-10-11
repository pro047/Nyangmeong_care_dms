import type { PrismaClient } from '@/generated/prisma/client'
import { purgeCandidateKeys, trashedDocumentWhere } from '@/lib/trash'

/**
 * 지울 범위. 휴지통 조건은 여기에 넣지 않는다 — 함수가 항상 직접 얹는다.
 * `createdById` 가 없으면 전원(관리자)이고, `deletedBefore` 는 화면을 그린 시각이다.
 */
export type PurgeScope = { id: string } | { createdById?: string; deletedBefore?: Date }

// env·prisma·s3 를 직접 import 하지 않고 받는다 — 실제 DB·S3 없이 순서와 분기를 테스트하려고.
export type PurgeDeps = {
  prisma: PrismaClient
  deleteObject: (key: string) => Promise<unknown>
  scheduleMeasure: () => void
}

/** 실제로 지워진 문서 수(deleteMany 의 count). 읽은 id 수가 아니다. */
export type PurgeResult = { count: number }

// `Date.prototype.toISOString()` 이 내는 모양만 받는다. `new Date()` 는 '9999' 나 시간대 없는
// 시각도 읽어 주는데, 앞의 것은 기준이 사실상 없어지고 뒤의 것은 서버 시간대에 따라 9시간 어긋난다.
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

/** 비우기 요청의 `before` 값. 못 읽으면 null — 기준 시각 없이 비우지 않는다. */
export function parseTrashCutoff(raw: string | null): Date | null {
  if (raw === null || !ISO_UTC.test(raw)) return null
  const cutoff = new Date(raw)
  return Number.isNaN(cutoff.getTime()) ? null : cutoff
}

/**
 * 키는 있는데 값이 비어 있는 범위. Prisma 는 where 의 undefined 를 "조건 없음"으로 읽어서,
 * `{ createdById: undefined }` 가 그대로 가면 내 문서가 아니라 전원의 휴지통이 대상이 된다.
 * 세션은 서명만 확인하고 내용물은 보지 않으므로(session.ts) 타입이 이걸 막아 주지 않는다.
 */
function hasEmptyScopeValue(scope: PurgeScope): boolean {
  const values = scope as Record<string, unknown>
  const emptyText = ['id', 'createdById'].some(
    (key) => key in values && (typeof values[key] !== 'string' || values[key] === ''),
  )
  // 기준 시각도 같다 — 키만 있고 값이 없으면 "기준 없음"으로 떨어져 범위가 가장 넓어진다.
  const cutoff = values.deletedBefore
  const emptyCutoff =
    'deletedBefore' in values && !(cutoff instanceof Date && !Number.isNaN(cutoff.getTime()))
  return emptyText || emptyCutoff
}

export function unreferencedKeys(candidates: string[], stillReferenced: { s3Key: string }[]): string[] {
  const used = new Set(stillReferenced.map((v) => v.s3Key))
  return candidates.filter((key) => !used.has(key))
}

/**
 * 휴지통 문서 영구삭제. 되돌릴 수 없다. 범위와 상관없이 휴지통 조건을 항상 얹는다 —
 * 활성 문서를 한 번에 지우는 경로를 만들지 않는 것이 소프트 삭제를 둔 이유다.
 *
 * **DB 를 먼저 지우고 S3 를 나중에 지운다.** 반대면 S3 삭제 후 DB 삭제가 실패했을 때
 * 없는 객체를 가리키는 문서가 휴지통에 남아, 복구해도 다운로드가 깨진다. 이 순서의
 * 최악은 고아 객체다.
 *
 * 쿼리는 순차로 하나씩 낸다 — 공유 RDS 커넥션이 모자라 한 요청이 여러 개를 쥐지 않게.
 */
export async function purgeTrashedDocuments(
  scope: PurgeScope,
  deps: PurgeDeps,
): Promise<PurgeResult> {
  const { prisma, deleteObject, scheduleMeasure } = deps

  if (hasEmptyScopeValue(scope)) throw new Error('영구삭제: 범위 값이 비어 있습니다.')

  // 화면을 그린 뒤 휴지통에 들어온 문서는 사람이 본 적이 없다 — 대상에서 뺀다.
  const { deletedBefore, ...target } = scope as { deletedBefore?: Date }
  const trashed = deletedBefore
    ? { deletedAt: { not: null, lte: deletedBefore } }
    : trashedDocumentWhere()

  // 지운 뒤에는 읽을 수 없는 것(docKey·S3 키)을 한 번에 확보한다.
  // scope 를 먼저 펴고 휴지통 조건을 뒤에 펴야 scope 가 조건을 덮지 못한다.
  const docs = await prisma.document.findMany({
    where: { ...target, ...trashed },
    select: { id: true, docKey: true, versions: { select: { s3Key: true } } },
  })
  if (docs.length === 0) return { count: 0 }

  const ids = docs.map((d) => d.id)
  const measured = docs.some((d) => d.docKey !== null)
  const keys = purgeCandidateKeys(docs.flatMap((d) => d.versions))

  // 조회와 삭제 사이에 남이 복구할 수 있다. 조건을 삭제 쿼리에 다시 건다 — 기준 시각까지
  // 같이 걸어야 복구됐다가 다시 지워진 문서(새 deletedAt)가 빠진다.
  // 버전·태그 연결은 스키마의 onDelete: Cascade 가 함께 지운다.
  const { count } = await prisma.document.deleteMany({
    where: { id: { in: ids }, ...trashed },
  })
  if (count === 0) return { count: 0 }

  if (measured) scheduleMeasure()

  if (keys.length === 0) return { count }

  // S3 실패로 요청을 실패시키지 않는다. DB 는 이미 지워졌고, 여기서 500 을 내면
  // 사용자는 실패한 줄 알고 다시 눌러 404 를 받는다.
  try {
    // 다른 문서가 같은 키를 가리키면 지우지 않는다(keyToken 재사용, 읽은 뒤 복구된 문서).
    // 남는 쪽은 고아 객체인데, 파일 유실보다 낫다.
    const stillReferenced = await prisma.documentVersion.findMany({
      where: { s3Key: { in: keys } },
      select: { s3Key: true },
    })
    for (const key of unreferencedKeys(keys, stillReferenced)) {
      try {
        await deleteObject(key)
      } catch (err) {
        console.error('영구삭제: S3 객체 정리 실패 (고아로 남음):', key, err)
      }
    }
  } catch (err) {
    // 키를 같이 남긴다 — DB 행은 이미 없어서 여기서 놓치면 고아 객체를 되찾을 길이 없다.
    console.error('영구삭제: 키 참조 조회 실패 (S3 객체를 지우지 않음):', keys, err)
  }

  return { count }
}
