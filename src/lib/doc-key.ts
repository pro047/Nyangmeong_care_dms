/**
 * 정합성 측정 대상 표시. `REQ` 하나 + `SCR-<도메인 3자>` + `FN-<도메인 3자>`.
 * 문서 종류는 첫 마디로 정한다 — REQ 는 요구사항 xlsx, SCR 은 화면설계서 html,
 * FN 은 기능명세서 xlsx (정합성 인계문 §4).
 */
export const DOC_KEY_RE = /^(?:REQ|(?:SCR|FN)-[A-Z]{3})$/

export type DocKind = 'REQ' | 'SCR' | 'FN'

export function isDocKey(value: string): boolean {
  return DOC_KEY_RE.test(value)
}

export function docKindOf(docKey: string): DocKind {
  return docKey.split('-')[0] as DocKind
}
