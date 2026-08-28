/**
 * 제목 규칙. 업로드 다이얼로그(클라이언트)와 재업로드 라우트(서버)가 같은 규칙을
 * 써야 "자동 생성된 제목인가"를 서로 같은 기준으로 판정할 수 있다.
 */

/** `documents/route.ts` 와 `document-edit.ts` 의 zod 스키마가 쓰는 상한. */
export const TITLE_MAX_LENGTH = 200

export function titleFromFileName(fileName: string) {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

/**
 * 재업로드 때 제목을 새 파일명으로 바꿀지 정한다. 바꾸지 않으면 null.
 *
 * **손으로 고친 제목은 덮지 않는다.** 현재 제목이 이전 버전 파일명에서 자동
 * 생성된 값 그대로일 때만 따라간다 — 그 경우에만 "제목을 정한 적이 없다"고
 * 볼 수 있기 때문이다. 사람이 고친 제목을 재업로드가 지우면 되돌릴 방법이 없다.
 */
export function retitleOnReupload(
  currentTitle: string,
  prevFileName: string,
  nextFileName: string,
): string | null {
  if (currentTitle !== titleFromFileName(prevFileName)) return null

  const next = titleFromFileName(nextFileName)
  // 빈 제목과 상한 초과는 생성 경로가 거부하는 값이라 여기서도 만들지 않는다.
  if (!next || next.length > TITLE_MAX_LENGTH) return null
  if (next === currentTitle) return null

  return next
}
