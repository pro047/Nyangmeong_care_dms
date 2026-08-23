/**
 * 목록 페이지가 `?error=` 로 받는 코드.
 *
 * 문구 자체를 URL 에 실으면 누구나 `/?error=<임의 문장>` 링크로 앱의 공식 경고 배너에
 * 원하는 말을 띄울 수 있다. 그래서 코드만 싣고 문구는 여기서 찾는다.
 * `proxy.ts` 가 로그인 리다이렉트에서 `url.search` 를 통째로 버리는 것과 같은 취지다.
 */
export const DOCUMENT_NOT_FOUND = 'notfound'

// 객체 리터럴이 아니라 Map 인 이유: `?error=toString` 이 Object.prototype 의 속성을
// 주워 오는 것을 원천 차단한다.
const MESSAGES = new Map<string, string>([[DOCUMENT_NOT_FOUND, '문서를 찾을 수 없습니다.']])

/**
 * 모르는 코드는 배너를 띄우지 않는다. `?error=a&error=b` 면 Next 가 배열을 주는데,
 * 그것도 코드가 아니므로 같이 걸린다.
 */
export function pageErrorMessage(raw: string | string[] | undefined): string | null {
  return typeof raw === 'string' ? (MESSAGES.get(raw) ?? null) : null
}
