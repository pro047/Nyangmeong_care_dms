import { activeDocumentWhere } from '@/lib/trash'

/** 배지 판정에 필요한 최소 컬럼. 목록 조회와 달리 조인이 없다. */
export type LatestCandidate = { id: string; folderId: string | null; updatedAt: Date }

/**
 * 배지 후보 조회 인자. 목록과 검색이 같은 배지 규칙을 쓰도록 한곳에서 만든다.
 *
 * 화면에 그리는 문서 집합과 따로 조회하는 것이 요점이다 — 렌더 배열 안에서 최신을 고르면
 * 태그 필터·검색이 집합을 좁혔을 때 "그 폴더의 최신본"이 아닌 행에 배지가 붙는다.
 * activeDocumentWhere 를 쓰므로 휴지통 문서는 후보가 아니다.
 */
export function latestCandidateQuery() {
  return {
    where: activeDocumentWhere(),
    select: { id: true, folderId: true, updatedAt: true },
  } as const
}

/**
 * 폴더마다 가장 최근에 수정된 문서 하나씩. 정렬된 입력을 요구하지 않는다 —
 * 조회 쪽 orderBy 가 바뀌어도 여기가 안 깨진다.
 *
 * 폴더가 없는 문서끼리도 한 그룹으로 본다. 규칙은 "같은 자리에서 가장 최근 1건"이라
 * 미분류만 영영 배지를 못 받으면 규칙이 아니라 예외가 된다.
 */
export function latestDocumentIds(rows: LatestCandidate[]): Set<string> {
  const best = new Map<string, LatestCandidate>()

  for (const row of rows) {
    const key = row.folderId ?? ''
    const current = best.get(key)
    if (current === undefined || isNewer(row, current)) best.set(key, row)
  }

  return new Set([...best.values()].map((row) => row.id))
}

/** 같은 시각이면 id 로 가른다 — 조회 순서에 따라 배지가 옮겨 다니면 안 된다. */
function isNewer(row: LatestCandidate, current: LatestCandidate): boolean {
  const diff = row.updatedAt.getTime() - current.updatedAt.getTime()
  return diff > 0 || (diff === 0 && row.id < current.id)
}
