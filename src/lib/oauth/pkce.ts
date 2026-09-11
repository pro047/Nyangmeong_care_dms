import { createHash } from 'node:crypto'

/** RFC 7636 §4.1 — unreserved 문자만, 43~128자. */
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/

/** `base64url(sha256(verifier)) === challenge`. verifier 형식이 틀리면 계산 없이 false. */
export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  if (!VERIFIER_PATTERN.test(codeVerifier)) return false
  const computed = createHash('sha256').update(codeVerifier).digest('base64url')
  return computed === codeChallenge
}
