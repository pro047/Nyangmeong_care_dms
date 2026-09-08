import type { Prisma } from '@/generated/prisma/client'
import { activeDocumentWhere } from '@/lib/trash'

/**
 * 목록·검색의 문서 정렬. **구버전 판정과 같은 컬럼을 본다** — 여기 있는 이유가 그것이다.
 *
 * 기준이 갈리면 화면이 자기모순에 빠진다. 정렬만 updatedAt 이던 시절에는 구버전으로
 * 흐려진 행이 선명한 최신본보다 **위에** 놓일 수 있었다(2026-09-08, 사람이 신고).
 * 두 규칙을 한 파일에 두는 것은 취향이 아니라 그 재발을 막는 장치다.
 *
 * 대가를 알고 받는다 — **제목·설명을 고쳐도 그 문서는 위로 올라오지 않는다.** 첫 화면을
 * "최근 수정순"으로 정한 원래 결정(MILESTONES 표)을 사람이 뒤집었다. 이 팀에서 문서는
 * 고쳐지기보다 새 판으로 다시 올라오므로(활성 28건 중 27건이 versionNo=1) 시간축을
 * "마지막으로 건드린 때"가 아니라 "새 판이 들어온 때"로 읽는 쪽이 실제 사용과 맞는다.
 */
export function documentListOrderBy(): Prisma.DocumentOrderByWithRelationInput {
  return { createdAt: 'desc' }
}

/**
 * 구버전 판정에 필요한 최소 컬럼. 목록 조회와 달리 조인이 없다.
 *
 * **updatedAt 을 넣지 말 것** (2026-09-08). 그 컬럼은 `@updatedAt` 이라 제목·설명·폴더를
 * 고치기만 해도 갱신된다 — 파일이 새 것인지와 아무 상관이 없다. 실제로 v0.4 의 제목을
 * 수정하자 v0.4 가 폴더 내 최댓값이 되어 **더 새 판인 v0.5 쪽에 구버전 표시가 붙었다.**
 * 목록 정렬(page.tsx)이 updatedAt 을 쓰는 것은 "최근 수정순"이 의도라 맞지만, 같은 값을
 * 버전 판정에 재사용하면 안 된다. 두 화면이 같은 컬럼을 봐도 묻는 질문이 다르다.
 */
export type LatestCandidate = { id: string; folderId: string | null; createdAt: Date }

/**
 * 판정 대상 조회 인자. 목록과 검색이 같은 규칙을 쓰도록 한곳에서 만든다.
 *
 * 화면에 그리는 문서 집합과 따로 조회하는 것이 요점이다 — 렌더 배열 안에서 판정하면
 * 태그 필터·검색이 집합을 좁혔을 때 실제로는 최신본인 문서가 구버전으로 흐려진다.
 * activeDocumentWhere 를 쓰므로 휴지통 문서는 비교 대상이 아니다.
 */
export function latestCandidateQuery() {
  return {
    where: activeDocumentWhere(),
    select: { id: true, folderId: true, createdAt: true },
  } as const
}

/**
 * 같은 폴더에 더 최신인 문서가 있는 문서들의 id. 표시는 최신이 아니라 **구버전에** 붙는다.
 *
 * 최신 쪽에 붙이면 표시가 다수에 달린다 — 폴더당 최신은 항상 1건씩 있으므로 문서가
 * 폴더 수만큼 있으면 거의 전 행이 강조된다(실측 71%). 구버전은 구조적으로 소수다.
 * 문서관리 관행도 같은 방향이다 — 최신본을 칭찬하는 게 아니라 폐기본에 표시를 남긴다.
 *
 * 정렬된 입력을 요구하지 않는다 — 조회 쪽 orderBy 가 바뀌어도 여기가 안 깨진다.
 * 폴더에 문서가 1건뿐이면 그 문서는 최신이라 아무 표시도 안 붙는다 — 비교 대상이 없는데
 * "구버전"이라고 할 수 없다.
 *
 * **미분류 문서는 아예 판정하지 않는다.** 폴더가 같아서 묶이는 것과 폴더가 *없어서* 묶이는
 * 것은 다르다 — 같은 폴더에 든 문서는 사람이 같은 칸에 넣었다는 신호라도 있지만, 미분류의
 * 공통점은 "아직 분류를 안 했다" 하나뿐이다. 자동 분류가 두 번 연달아 실패하면 회의록과
 * 예산안이 한 그룹이 되어 먼저 올린 쪽이 구버전으로 흐려진다. 없는 관계를 만들어 보여주는
 * 쪽이 있는 관계를 안 보여주는 쪽보다 나쁘다 — 최신본을 구버전으로 오인해 안 받아 가는
 * 것이 진짜 사고다.
 */
export function supersededDocumentIds(rows: LatestCandidate[]): Set<string> {
  const best = new Map<string, LatestCandidate>()

  for (const row of rows) {
    if (row.folderId === null) continue
    const current = best.get(row.folderId)
    if (current === undefined || isNewer(row, current)) best.set(row.folderId, row)
  }

  const latest = new Set([...best.values()].map((row) => row.id))
  return new Set(
    rows
      .filter((row) => row.folderId !== null && !latest.has(row.id))
      .map((row) => row.id),
  )
}

/** 같은 시각이면 id 로 가른다 — 조회 순서에 따라 표시가 옮겨 다니면 안 된다. */
function isNewer(row: LatestCandidate, current: LatestCandidate): boolean {
  const diff = row.createdAt.getTime() - current.createdAt.getTime()
  return diff > 0 || (diff === 0 && row.id < current.id)
}
