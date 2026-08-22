import { describe, expect, it } from 'vitest'
import { parseVersionParam } from '@/lib/version'

describe('parseVersionParam', () => {
  it('파라미터가 없으면 null(최신 버전)이어야 한다', () => {
    expect(parseVersionParam(null)).toBeNull()
  })

  it('양의 정수 문자열이면 그 숫자여야 한다', () => {
    expect(parseVersionParam('1')).toBe(1)
    expect(parseVersionParam('42')).toBe(42)
  })

  it('숫자가 아니면 invalid 여야 한다', () => {
    // 예전엔 Number('abc') 의 NaN 이 Prisma Int 필터로 들어가 404 가 아니라 500 이 났다.
    expect(parseVersionParam('abc')).toBe('invalid')
    expect(parseVersionParam('')).toBe('invalid')
    expect(parseVersionParam(' ')).toBe('invalid')
  })

  it('정수가 아닌 수는 invalid 여야 한다', () => {
    expect(parseVersionParam('1.5')).toBe('invalid')
    expect(parseVersionParam('1e3')).toBe(1000) // 지수 표기는 정수라 통과한다 — 경계 명시
    expect(parseVersionParam('Infinity')).toBe('invalid')
  })

  it('0 이하는 invalid 여야 한다', () => {
    // versionNo 는 1부터 시작한다. 0이나 음수는 존재할 수 없는 버전이다.
    expect(parseVersionParam('0')).toBe('invalid')
    expect(parseVersionParam('-1')).toBe('invalid')
  })
})
