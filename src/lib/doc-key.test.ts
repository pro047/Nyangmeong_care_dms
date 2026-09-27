import { describe, expect, it } from 'vitest'
import { docKindOf, isDocKey } from './doc-key'

describe('isDocKey', () => {
  it('인계문 §4 의 세 모양을 받는다', () => {
    expect(isDocKey('REQ')).toBe(true)
    expect(isDocKey('SCR-ACC')).toBe(true)
    expect(isDocKey('FN-HLT')).toBe(true)
  })

  it('모양이 다르면 거절한다', () => {
    for (const bad of ['', 'req', 'REQ-ACC', 'SCR-AC', 'SCR-ACCT', 'scr-acc', 'FN_HLT', ' SCR-ACC']) {
      expect(isDocKey(bad)).toBe(false)
    }
  })
})

describe('docKindOf', () => {
  it('첫 마디가 종류다', () => {
    expect(docKindOf('REQ')).toBe('REQ')
    expect(docKindOf('SCR-PLC')).toBe('SCR')
    expect(docKindOf('FN-MYP')).toBe('FN')
  })
})
