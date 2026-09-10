import { compareFileVersions, fileVersionLabel } from '@/lib/file-version'
import type { SimilarCandidate } from '@/lib/similar-document'

/**
 * 업로드 다이얼로그의 "새 문서 / 기존 문서의 새 판" 선택을 값으로 옮긴다.
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
  const becomesLatest = '붙이면 이 파일이 최신본이 됩니다.'

  if (compared === null) {
    return { level: 'notice', message: `판번호를 읽을 수 없어 순서를 확인하지 못했습니다. ${becomesLatest}` }
  }
  if (compared < 0) {
    return {
      level: 'danger',
      message: `현재 판 ${fileVersionLabel(targetFileName)} 보다 낮은 ${fileVersionLabel(uploadFileName)} 입니다. ${becomesLatest}`,
    }
  }
  if (compared === 0) {
    return {
      level: 'notice',
      message: `현재 판과 같은 ${fileVersionLabel(targetFileName)} 입니다. ${becomesLatest}`,
    }
  }
  return null
}
