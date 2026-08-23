/** PostgreSQL int4 상한. versionNo 컬럼이 Int 라 이 위는 DB 가 받지 못한다. */
export const MAX_VERSION_NO = 2147483647

/**
 * `?v=` 쿼리 파라미터를 버전 번호로 읽는다.
 *
 * 반환값: null = 미지정(최신 버전), 'invalid' = 형식 오류, 숫자 = 그 버전.
 *
 * 받는 표기는 십진 양의 정수 문자열 하나뿐이다. Number() 하나로 판정하면 지수(1e21)·
 * 16진수(0x10)·부호(+5)·공백( 5 )이 전부 통과해 int4 를 넘는 값이 Prisma 로 들어가고
 * 404 대신 500 이 난다. 그래서 정규식으로 먼저 표기를 거르고, 그다음 상한을 본다.
 */
export function parseVersionParam(raw: string | null): number | null | 'invalid' {
  if (raw === null) return null
  if (!/^[1-9]\d*$/.test(raw)) return 'invalid'
  const n = Number(raw)
  // 자릿수가 많으면 Number() 가 정밀도를 잃지만, 그런 값은 여기서 걸린다.
  return n <= MAX_VERSION_NO ? n : 'invalid'
}
