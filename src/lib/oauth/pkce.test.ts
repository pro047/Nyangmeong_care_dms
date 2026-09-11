import { describe, expect, it } from 'vitest'
import { verifyPkceS256 } from '@/lib/oauth/pkce'

// RFC 7636 Appendix B 의 예제 verifier/challenge 쌍.
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

describe('verifyPkceS256', () => {
  it('RFC 7636 부록 B 의 verifier/challenge 쌍은 통과해야 한다', () => {
    expect(verifyPkceS256(VERIFIER, CHALLENGE)).toBe(true)
  })

  it('challenge 가 한 글자만 달라도 실패해야 한다', () => {
    const wrong = CHALLENGE.slice(0, -1) + (CHALLENGE.endsWith('M') ? 'N' : 'M')
    expect(verifyPkceS256(VERIFIER, wrong)).toBe(false)
  })

  it('verifier 가 42자(하한 미달)면 실패해야 한다', () => {
    const short = 'a'.repeat(42)
    expect(verifyPkceS256(short, CHALLENGE)).toBe(false)
  })

  it('verifier 가 129자(상한 초과)면 실패해야 한다', () => {
    const long = 'a'.repeat(129)
    expect(verifyPkceS256(long, CHALLENGE)).toBe(false)
  })
})
