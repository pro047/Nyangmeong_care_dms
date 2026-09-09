import type { Prisma } from '@/generated/prisma/client'
import { coreTokens, MIN_KEY_LENGTH, normalizeForMatch } from '@/lib/classify'
import { canDeleteRow, type DeletePermission } from '@/lib/ownership'
import { compareFileVersions, parseFileVersion } from '@/lib/file-version'
import { activeDocumentWhere } from '@/lib/trash'

/**
 * 올리려는 파일이 기존 문서의 **새 판**인지 판정한다.
 *
 * 이 팀은 `v0.3 → v0.6` 을 재업로드가 아니라 별개 `Document` 로 올린다 — 운영 32건 중
 * 7쌍이 그렇게 갈려 있다(2026-09-08 실측). 그 습관을 못 바꾸므로(파일명에서 판번호를
 * 빼면 받아서 저장한 쪽이 어느 판인지 모른다) 앱이 먼저 알아보고 물어보는 쪽으로 간다.
 *
 * **판정 규칙을 새로 만들지 않는다.** 폴더 자동 분류가 쓰던 `extractCore` 가 판번호·
 * 날짜·순번 접두·말미 코드(`HLT`)·제품명을 이미 걷어낸다. 그 결과를 정규화한 것이 키다.
 * 실데이터로 대조했을 때 dev 28건·운영 32건 양쪽에서 **오탐 0** 이었다.
 *
 * **자동으로 붙이지 않는다.** 이 함수는 후보만 돌려주고 선택은 사람이 한다 — 붙인 판을
 * 떼는 화면이 앱에 없어서(버전 롤백은 범위 밖) 잘못 붙이면 되돌릴 수단이 없다.
 */

/** 후보 판정에 필요한 최소 정보. 최신 파일명은 `versionNo desc` 로 고른 그 판의 것이다. */
export type SimilarCandidate = {
  id: string
  folderId: string | null
  createdById: string
  latestFileName: string
}

/**
 * 후보 조회 인자. 타입 옆에 두는 이유는 `latest.ts` 와 같다 — **휴지통 필터를 호출부에
 * 맡기면 언젠가 빠진다.** 빠지면 목록에 안 보이는 문서에 새 판을 붙이라고 제안하고,
 * 사람이 수락하면 새 파일이 휴지통 안에 묻힌다.
 */
export function similarCandidateQuery() {
  return {
    where: activeDocumentWhere(),
    select: {
      id: true,
      folderId: true,
      createdById: true,
      versions: {
        orderBy: { versionNo: 'desc' },
        take: 1,
        select: { fileName: true },
      },
    },
  } satisfies {
    where: Prisma.DocumentWhereInput
    select: Prisma.DocumentSelect
  }
}

/** 조회 결과를 판정 입력으로 옮긴다. 버전이 없는 문서는 비교할 파일명이 없어 뺀다. */
export function toSimilarCandidates(
  rows: {
    id: string
    folderId: string | null
    createdById: string
    versions: { fileName: string }[]
  }[],
): SimilarCandidate[] {
  return rows
    .filter((row) => row.versions.length > 0)
    .map((row) => ({
      id: row.id,
      folderId: row.folderId,
      createdById: row.createdById,
      latestFileName: row.versions[0].fileName,
    }))
}

/**
 * 같은 문서인지 가르는 키. 못 만들면 null.
 *
 * 폴더 이름을 짓는 `extractCore` 와 두 군데가 다르다. 같은 함수를 두 목적에 쓰면
 * 한쪽 요구로 고칠 때 다른 쪽이 조용히 깨진다.
 *
 * **말미 코드를 남긴다** — 폴더 이름에서 `HLT` 는 소음이지만 문서 식별에서는 구별의
 * 근거다. 떼면 `건강기록_와이어프레임_HLT` 와 `..._PAY` 가 같은 문서가 된다.
 *
 * **토큰을 정렬해서 붙인다** — 사람이 쓰는 순서가 갈린다. 운영에 실제로 있다
 * (2026-09-09 실측): `03_건강기록_화면설계서_HLT_v0_5` 와
 * `냥멍케어_화면설계서_건강기록_HLT_v0.3` 은 같은 문서인데 순서만 뒤집혀 있어
 * 정렬하지 않으면 **가장 최신인 v0.5 를 못 묶는다.** 폴더가 이미 비교 범위를 좁혀 주므로
 * 순서를 버려도 오탐이 늘지 않는다 (운영 32건 재측정으로 확인).
 *
 * null 은 **후보 없음으로 처리해야 한다.** 빈 키나 너무 짧은 키로 묶으면 아무 문서나
 * 서로의 새 판이 된다.
 */
export function documentMatchKey(fileName: string): string | null {
  const key = coreTokens(fileName, { keepTrailingCode: true })
    .map(normalizeForMatch)
    .filter((token) => token !== '')
    .sort()
    .join('')
  return key.length >= MIN_KEY_LENGTH ? key : null
}

/**
 * 새 판으로 붙일 만한 기존 문서들. 없으면 빈 배열.
 *
 * 판번호가 높은 순으로 돌려준다 — 호출부가 첫 원소를 "현재 최신"으로 읽고 올리려는
 * 파일과 비교해 경고할 수 있게 하려는 것이다. 판번호가 없는 후보는 뒤로 민다.
 *
 * **미분류(`folderId === null`)는 판정하지 않는다.** 같은 폴더에 든 문서는 사람이 같은
 * 칸에 넣었다는 신호라도 있지만, 미분류의 공통점은 "아직 분류를 안 했다" 하나뿐이다
 * (`latest.ts` 의 구버전 판정이 미분류를 빼는 것과 같은 근거).
 *
 * **남의 문서는 후보에서 뺀다.** 새 버전 올리기는 올린 사람과 관리자만 할 수 있어서
 * (2026-09-07, `denyIfNotOwner`) 제안을 띄워도 누르면 403 이다. 고칠 수 없는 선택지를
 * 보여주지 않는다.
 */
export function findSimilarDocuments(
  fileName: string,
  folderId: string | null,
  candidates: SimilarCandidate[],
  permission: DeletePermission,
): SimilarCandidate[] {
  if (folderId === null) return []

  const key = documentMatchKey(fileName)
  if (key === null) return []

  return candidates
    .filter(
      (candidate) =>
        candidate.folderId === folderId &&
        documentMatchKey(candidate.latestFileName) === key &&
        canDeleteRow(permission, candidate),
    )
    .sort(byVersionDesc)
}

/** 판번호를 못 읽는 후보는 순서를 정할 근거가 없으므로 뒤로 보낸다. */
function byVersionDesc(a: SimilarCandidate, b: SimilarCandidate): number {
  const compared = compareFileVersions(a.latestFileName, b.latestFileName)
  if (compared !== null) return -compared

  const aHas = parseFileVersion(a.latestFileName) !== null
  const bHas = parseFileVersion(b.latestFileName) !== null
  return aHas === bHas ? 0 : aHas ? -1 : 1
}
