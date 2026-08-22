/**
 * `?v=` 쿼리 파라미터를 버전 번호로 읽는다.
 *
 * 라우트 파일에 두지 않고 여기 둔 이유: Next 16 은 route.ts 의 export 를 검사하므로
 * HTTP 메서드 외의 것을 내보낼 수 없고, 그러면 테스트에서 부를 방법이 없다.
 *
 * 반환값: null = 미지정(최신 버전), 'invalid' = 형식 오류, 숫자 = 그 버전.
 */
export function parseVersionParam(raw: string | null): number | null | 'invalid' {
  if (raw === null) return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : 'invalid'
}
