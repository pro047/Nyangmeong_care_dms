import type { Prisma } from '@/generated/prisma/client'
import { coreTokens, MIN_KEY_LENGTH, normalizeForMatch } from '@/lib/classify'
import { canDeleteRow, type DeletePermission } from '@/lib/ownership'
import { compareFileVersions, parseFileNameDate, parseFileVersion } from '@/lib/file-version'
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
 * **이 함수 자체는 후보만 돌려준다.** 최종 선택은 `attach-plan.ts` 의 `attachDefault` 와
 * 업로드 다이얼로그가 한다 — 붙인 판을 떼는 화면이 앱에 없어서(버전 롤백은 범위 밖)
 * 잘못 붙이면 되돌릴 수단이 없다는 전제는 여전하다.
 *
 * > **2026-09-20 정정.** 이 문단은 원래 "자동으로 붙이지 않는다"를 시스템 전체의 보장으로
 * > 적고 있었다. 지금은 후보가 정확히 1건이고 버전이 엄격히 높을 때만 `attachDefault` 가
 * > 사람 확인 없이 붙인다 — 팀원이 선택칸의 뜻을 몰라 기본값(새 문서)으로 그대로 올려
 * > 같은 문서가 여러 건으로 쪼개진 사고(운영 실측: `마이페이지_화면설계서_v0.5` 5건)
 * > 때문에 뒤집었다. 위 비대칭은 그대로이므로 자동 조건은 그 비대칭이 사고로 이어지지
 * > 않을 만큼 좁게 잡았다(후보 1건 + 버전이 엄격히 높음, 같은 묶음 충돌은 제외).
 *
 * > **2026-09-22 갱신.** "후보 1건"으로는 운영 재생(66건)에서 자동이 14건뿐이었다 — 팀원이
 * > 버전 번호를 안 올리고 날짜만 바꿔 재업로드하고(같은 major.minor 가 여러 날짜로 반복),
 * > 이미 쪼개진 문서 때문에 후보가 9건까지 잡히는 폴더가 있어서다. 후보가 여럿이어도
 * > `compareCandidatesByRecency` 로 가장 최신 후보 하나(target)를 고르고 그 하나에 대해서만
 * > 판정한다(사람 지시로 뒤집음, 재생 실측: 자동 14/66 → 약 42/66). "버전이 같으면 나중에
 * > 올린 쪽이 최신"도 자동에 넣었다 — 파일명 날짜를 둘 다 읽었고 올리는 쪽이 같거나 늦으면
 * > 자동이다. 위험은 그대로다 — **같은 버전·같은 날짜의 옛 사본을 다시 올리면 그 사본이
 * > 최신이 되고 뗄 수 없다**(옛 판은 이력에서 받을 수 있다). 이미 쪼개진 중복 문서를
 * > 하나로 합치는 일은 범위 밖이다(docKey 작업과 함께 한다).
 */

/** 후보 판정에 필요한 최소 정보. 최신 파일명은 `versionNo desc` 로 고른 그 판의 것이다. */
export type SimilarCandidate = {
  id: string
  folderId: string | null
  createdById: string
  latestFileName: string
  /** 그 최신 판(위 latestFileName)이 실제로 업로드된 시각. `compareCandidatesByRecency` 의
      3번째 타이브레이크다(2026-09-22) — 파일명 버전·날짜가 둘 다 같을 때만 본다. */
  latestVersionCreatedAt: Date
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
      // createdAt 을 더한다(2026-09-22) — compareCandidatesByRecency 의 3번째 타이브레이크
      // (업로드 시각)가 필요하다. 이미 같은 조회에 얹는 관계라 왕복은 늘지 않는다.
      versions: {
        orderBy: { versionNo: 'desc' },
        take: 1,
        select: { fileName: true, createdAt: true },
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
    versions: { fileName: string; createdAt: Date }[]
  }[],
): SimilarCandidate[] {
  return rows
    .filter((row) => row.versions.length > 0)
    .map((row) => ({
      id: row.id,
      folderId: row.folderId,
      createdById: row.createdById,
      latestFileName: row.versions[0].fileName,
      latestVersionCreatedAt: row.versions[0].createdAt,
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
 * **가장 최신 후보가 맨 앞이다** — 호출부가 첫 원소를 "현재 최신"으로 읽고 올리려는
 * 파일과 비교해 경고할 수 있게 하려는 것이다. 정렬은 `compareCandidatesByRecency` 를 쓴다
 * (2026-09-22) — `attach-plan.ts` 의 `attachDefault` 가 target 을 고르는 순서와 같은 함수를
 * 써야 업로드 모달 셀렉트의 첫 후보 = 자동 붙임 대상이 어긋나지 않는다.
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
    .sort(compareCandidatesByRecency)
}

/**
 * 후보 중 "가장 최신"을 고르는 순서(2026-09-22). `findSimilarDocuments` 의 정렬과
 * `attach-plan.ts` 의 `attachDefault` 가 target 을 고르는 기준이 **하나를 공유**한다 —
 * 두 벌이면 셀렉트 첫 후보와 자동 붙임 대상이 갈린다.
 *
 * 순서: 파일명 버전 높은 순(`compareFileVersions`) → 버전이 같으면 파일명 날짜
 * (`parseFileNameDate`) 늦은 순 → 그래도 같으면 그 후보 최신 버전의 업로드 시각
 * (`latestVersionCreatedAt`) 늦은 순 → 그래도 같으면 id 로 결정적으로.
 *
 * 판번호를 못 읽는 후보는 뒤로(비교할 근거가 없다), 날짜를 못 읽는 후보는 그 단계에서만
 * 뒤로 — 버전으로 이미 갈렸으면 날짜를 보지 않는다.
 */
export function compareCandidatesByRecency(a: SimilarCandidate, b: SimilarCandidate): number {
  const versionCompared = compareFileVersions(a.latestFileName, b.latestFileName)
  if (versionCompared !== null && versionCompared !== 0) return -versionCompared

  if (versionCompared === null) {
    const aHasVersion = parseFileVersion(a.latestFileName) !== null
    const bHasVersion = parseFileVersion(b.latestFileName) !== null
    if (aHasVersion !== bHasVersion) return aHasVersion ? -1 : 1
  }

  const aDate = parseFileNameDate(a.latestFileName)
  const bDate = parseFileNameDate(b.latestFileName)
  if (aDate !== null && bDate !== null && aDate !== bDate) return bDate - aDate
  if ((aDate === null) !== (bDate === null)) return aDate !== null ? -1 : 1

  const uploadedDiff = b.latestVersionCreatedAt.getTime() - a.latestVersionCreatedAt.getTime()
  if (uploadedDiff !== 0) return uploadedDiff

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
