import { compareFileVersions, fileVersionLabel, parseFileNameDate } from '@/lib/file-version'
import {
  compareCandidatesByRecency,
  documentMatchKey,
  type SimilarCandidate,
} from '@/lib/similar-document'

/**
 * 업로드 다이얼로그의 "새 문서 / 기존 문서의 새 버전" 선택을 값으로 옮긴다.
 *
 * **화면 문구에서 "판"을 쓰지 않는다** (2026-09-13, 사람 지시). 같은 동작을 상세 페이지는
 * `새 버전 올리기` 로 부르는데 여기만 `새 판으로 붙이기` 였다 — 결과가 같은 일에 이름이
 * 둘이었다. 코드 식별자(`attach*`)는 그대로 둔다: 인계 문서가 이 기능을 "붙이기"로 적고
 * 있어 내부 이름과 화면 문구를 갈라 두는 편이 추적이 산다.
 *
 * 판정(같은 문서인가)은 `similar-document.ts` 가, 판번호 비교는 `file-version.ts` 가
 * 이미 한다. 여기 있는 것은 **그 결과를 사람의 선택과 합쳐 업로드 대상으로 바꾸는 일**과
 * **붙이기가 위험한 순간의 문구** 둘뿐이다. 컴포넌트에 두지 않는 이유는 테스트가
 * node 환경이라(vitest.config.mts) 렌더 테스트가 없어서다 — 컴포넌트에 두면 안 덮인다.
 */

/** 이 파일 하나를 어디에 넣을 것인가. `folderId: null` 은 미분류다. */
export type UploadTarget =
  | { kind: 'new'; folderId: string | null }
  | { kind: 'attach'; documentId: string }

/**
 * 선택을 업로드 대상으로 바꾼다. **후보 목록에 없는 선택은 버리고 새 문서로 떨어진다.**
 *
 * 선택한 뒤에 목적지 폴더를 바꿀 수 있기 때문이다(자동 분류 미리보기). 폴더가 바뀌면
 * 후보 목록도 바뀌는데 선택만 남아 있으면 **다른 폴더의 문서에 붙는다** — 붙인 판을
 * 떼는 화면이 없으므로 되돌릴 수 없는 사고다. 선택을 지우는 책임을 화면에 맡기지 않고
 * 마지막 순간에 여기서 한 번 더 거른다.
 */
export function uploadTarget(
  attachTo: string | undefined,
  folderId: string | null,
  candidates: SimilarCandidate[],
): UploadTarget {
  if (attachTo !== undefined && candidates.some((candidate) => candidate.id === attachTo)) {
    return { kind: 'attach', documentId: attachTo }
  }
  return { kind: 'new', folderId }
}

/** 업로드 다이얼로그가 사람에게 묻지 않고 정할 수 있는 것. `ask` 는 사람이 고를 때까지
    미선택으로 둔다 — 어느 쪽으로도 조용히 떨어지면 안 된다. */
export type AttachDefault =
  | { kind: 'none' }
  | { kind: 'auto'; documentId: string }
  | { kind: 'ask' }

/**
 * 사람이 아직 건드리지 않은 항목의 기본 선택(2026-09-20, 사람 지시로 뒤집음).
 *
 * **원래 기본값은 항상 새 문서였다.** 팀원이 선택칸의 뜻을 몰라 기본값(새 문서)으로
 * 그대로 올려 같은 문서가 여러 건으로 쪼개졌다(운영 실측: `마이페이지_화면설계서_v0.5`
 * 5건). 비대칭(잘못 붙인 판은 뗄 화면이 없다)은 그대로이므로 자동은 좁게 잡는다.
 *
 * **같은 묶음 안의 충돌도 `ask` 로 민다.** 업로드는 최대 3건씩 병렬이라(`MAX_PARALLEL`,
 * `upload-dialog.tsx`) 같은 문서의 다음 판(v0.7·v0.8)을 한 번에 담으면 도착 순서가
 * 뒤집혀 옛 판이 최신으로 저장될 수 있다 — 대상 문서가 이미 있는지와 무관하게, 같은
 * 묶음에 `documentMatchKey` 가 같은 파일이 둘 이상이면 그 파일들은 자동에서 뺀다.
 *
 * > **2026-09-22 갱신(사람 지시).** "후보 정확히 1건 + 버전이 엄격히 높음"만 자동이던
 * > 규칙을 운영 업로드 66건으로 재생했더니 자동이 14건뿐이었다 — 팀원이 버전 번호를 안
 * > 올리고 날짜만 바꿔 재업로드하고(`_v0.5_20260913` → `_20260914` → `_260916` → …),
 * > 이미 쪼개진 문서 때문에 후보가 최대 9건인 폴더가 있어서다. 지금 규칙:
 * >
 * > 1. 후보 0건이면 `none`.
 * > 2. 후보가 1건 이상이면 `compareCandidatesByRecency` 로 가장 최신 후보 하나(target)를
 * >    고른다 — 후보 2건 이상이라고 곧장 `ask` 로 가지 않는다.
 * >  3. 올리는 파일과 target 을 `compareFileVersions` 로 비교해, 엄격히 높으면 `auto`.
 * >    **버전이 같아도**, 두 파일명의 날짜(`parseFileNameDate`)를 둘 다 읽었고 올리는
 * >    쪽이 target 과 같거나 늦으면 `auto` 다 — "같은 버전이면 나중에 올린 쪽이 최신"
 * >    (업로드 시각은 항상 새 것이 늦으므로 파일명 날짜가 같으면 자동으로 친다). 그 밖
 * >    (버전을 못 읽음·버전이 낮음·같은 버전인데 날짜가 더 이르거나 한쪽이라도 날짜를
 * >    못 읽음)은 전부 `ask`.
 * >
 * > **알고 받는 위험**: 같은 버전·같은 날짜의 옛 사본을 나중에 올리면 그 사본이
 * > 자동으로 최신이 되고 뗄 수 없다(옛 판은 이력에서 받을 수 있다) — 비대칭은 그대로
 * > 다, 자동 조건만 넓어졌다. 이미 쪼개진 중복 문서를 하나로 합치는 일은 이번 범위
 * > 밖이다(docKey 작업과 함께 한다).
 */
export function attachDefault(
  fileName: string,
  candidates: SimilarCandidate[],
  otherFileNamesInBatch: string[],
): AttachDefault {
  if (candidates.length === 0) return { kind: 'none' }

  // 가장 최신 후보 하나만 본다 — 나머지는 사람이 셀렉트에서 직접 고른다.
  const [target] = [...candidates].sort(compareCandidatesByRecency)
  const compared = compareFileVersions(fileName, target.latestFileName)

  const uploadDate = parseFileNameDate(fileName)
  const targetDate = parseFileNameDate(target.latestFileName)
  const sameVersionButNotOlder =
    compared === 0 && uploadDate !== null && targetDate !== null && uploadDate >= targetDate

  const isStrictlyHigher = compared !== null && compared > 0
  if (!isStrictlyHigher && !sameVersionButNotOlder) return { kind: 'ask' }

  const key = documentMatchKey(fileName)
  const clashesInBatch =
    key !== null && otherFileNamesInBatch.some((name) => documentMatchKey(name) === key)
  if (clashesInBatch) return { kind: 'ask' }

  return { kind: 'auto', documentId: target.id }
}

export type AttachWarning = { level: 'danger' | 'notice'; message: string }

/**
 * 이 파일을 그 문서의 새 판으로 붙여도 되는가. 문제가 없으면 null.
 *
 * **없으면 사고가 조용하다** (2026-09-08 재현). 옛 판을 나중에 붙이면 목록 API·다운로드·
 * 목록의 버전 열이 **전부 그 옛 판을 최신이라고 답한다** — 셋 다 `versionNo desc` 로 고르고
 * `versionNo` 는 파일명의 판번호가 아니라 앱이 센 재업로드 횟수라서다. 에러는 안 난다.
 * 붙이기 기능은 재업로드를 주력 경로로 만드는 일이라 이 사고를 상시로 끌어올린다.
 *
 * 등급을 둘로 나눈다 — 판번호를 읽어서 낮다고 **판정한 것**(danger)과 판번호가 없어
 * **판정하지 못한 것**(notice)은 사람이 할 일이 다르다. 후자는 실데이터에 흔하므로
 * (`06_로그인_회원가입_와이어프레임.html`) 빨갛게 띄우면 경고 자체가 무시된다.
 */
export function attachVersionWarning(
  uploadFileName: string,
  targetFileName: string,
): AttachWarning | null {
  const compared = compareFileVersions(uploadFileName, targetFileName)
  const becomesLatest = '올리면 이 파일이 최신본이 됩니다.'

  if (compared === null) {
    return { level: 'notice', message: `버전을 읽을 수 없어 순서를 확인하지 못했습니다. ${becomesLatest}` }
  }
  if (compared < 0) {
    return {
      level: 'danger',
      message: `현재 버전 ${fileVersionLabel(targetFileName)} 보다 낮은 ${fileVersionLabel(uploadFileName)} 입니다. ${becomesLatest}`,
    }
  }
  if (compared === 0) {
    return {
      level: 'notice',
      message: `현재 버전과 같은 ${fileVersionLabel(targetFileName)} 입니다. ${becomesLatest}`,
    }
  }
  return null
}
