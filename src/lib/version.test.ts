import { describe, expect, it } from 'vitest'
import { MAX_VERSION_NO, parseVersionParam } from '@/lib/version'

describe('parseVersionParam', () => {
  it('파라미터가 없으면 null(최신 버전)이어야 한다', () => {
    expect(parseVersionParam(null)).toBeNull()
  })

  it('양의 정수 문자열이면 그 숫자여야 한다', () => {
    expect(parseVersionParam('1')).toBe(1)
    expect(parseVersionParam('42')).toBe(42)
    expect(parseVersionParam('2147483647')).toBe(MAX_VERSION_NO)
  })

  it('숫자가 아니면 invalid 여야 한다', () => {
    // 예전엔 Number('abc') 의 NaN 이 Prisma Int 필터로 들어가 404 가 아니라 500 이 났다.
    expect(parseVersionParam('abc')).toBe('invalid')
    expect(parseVersionParam('')).toBe('invalid')
    expect(parseVersionParam(' ')).toBe('invalid')
  })

  it('정수가 아닌 수는 invalid 여야 한다', () => {
    expect(parseVersionParam('1.5')).toBe('invalid')
    expect(parseVersionParam('Infinity')).toBe('invalid')
  })

  it('지수 표기는 invalid 여야 한다', () => {
    // 예전엔 Number('1e3') 가 정수 1000 이라 통과했다. 1e21 은 int4 를 넘어 Prisma 가
    // 검증 단계에서 던졌고 500 이 났다 — 표기 자체를 거부해야 한다.
    expect(parseVersionParam('1e3')).toBe('invalid')
    expect(parseVersionParam('1e21')).toBe('invalid')
  })

  it('십진수가 아닌 표기는 invalid 여야 한다', () => {
    expect(parseVersionParam('0x10')).toBe('invalid')
    expect(parseVersionParam('+5')).toBe('invalid')
    expect(parseVersionParam(' 5 ')).toBe('invalid')
    expect(parseVersionParam('5 ')).toBe('invalid')
    expect(parseVersionParam('007')).toBe('invalid')
  })

  it('int4 상한을 넘으면 invalid 여야 한다', () => {
    expect(parseVersionParam('2147483648')).toBe('invalid')
    // Number() 가 정밀도를 잃는 자릿수라도 상한 비교에서 걸려야 한다.
    expect(parseVersionParam('99999999999999999999')).toBe('invalid')
  })

  it('0 이하는 invalid 여야 한다', () => {
    // versionNo 는 1부터 시작한다. 0이나 음수는 존재할 수 없는 버전이다.
    expect(parseVersionParam('0')).toBe('invalid')
    expect(parseVersionParam('-1')).toBe('invalid')
  })

  it('상한은 PostgreSQL int4 최대값이어야 한다', () => {
    expect(MAX_VERSION_NO).toBe(2147483647)
  })
})
