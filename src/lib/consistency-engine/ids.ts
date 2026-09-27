/**
 * ID 문법. 정본은 정합성 저장소의 `scripts/docs.py` 이고 **다르면 그쪽이 이긴다.**
 * 골든 대조(`golden.test.ts`)가 두 엔진이 같은 답을 내는지 본다.
 *
 * 파이썬 `re` 와 JS 정규식이 갈리는 곳을 여기서 맞춘다:
 * - `\b` 는 파이썬에서 유니코드 단어 경계다. `화면SCR-MAN-001` 의 `면` 과 `S` 사이는
 *   경계가 아니라서 파이썬은 못 집는데, JS 의 `\b` 는 ASCII 기준이라 집는다.
 *   그래서 경계를 `[\p{L}\p{N}_]` lookaround 로 쓴다.
 * - `\s` 와 `strip()` 의 공백 집합이 조금 다르다(파이썬은 `\x1c-\x1f`·`\x85` 를 넣고
 *   `﻿` 를 뺀다). `PY_WS` 가 파이썬 쪽 집합이다.
 */

const W = String.raw`[\p{L}\p{N}_]`
export const PY_WS = String.raw`[\t\n\x0b\x0c\r\x1c-\x1f \x85\xa0  -     　]`

const ID_SOURCE = String.raw`(?<!${W})(REQ|SCR|FN)-([A-Z]{3})-(\d{3})(?:-(\d{2}))?(?!${W})`
// 축약: "REQ-AIM-003 · 005", "SCR-AIM-006~010", "SCR-MYP-020/030". 해석하지 않고 "미해석"으로 센다.
const ABBR_SOURCE = String.raw`(?:REQ|SCR|FN)-[A-Z]{3}-\d{3}(?:-\d{2})?(?:${PY_WS}*(?:[·~/]|,)${PY_WS}*\d{3}(?!\d|-))+`

const ID_ONE = new RegExp(`^${ID_SOURCE}`, 'u')

/** SCR-HOS-* / FN-HOS-* 는 PLC 문서 소속 */
export const DOMAIN_ALIAS: Record<string, string> = { HOS: 'PLC' }

export type IdFields = { kind: string; dom: string; n: number; sub: number | null }

export function idFields(id: string): IdFields {
  const m = ID_ONE.exec(id)
  if (!m) throw new Error(`ID 모양이 아닙니다: ${id}`)
  return { kind: m[1], dom: m[2], n: Number(m[3]), sub: m[4] === undefined ? null : Number(m[4]) }
}

/** 셀·텍스트에서 정식 ID 목록(순서 유지, 중복 제거). 파이썬처럼 falsy 는 빈 목록. */
export function splitIds(text: unknown): string[] {
  if (text === null || text === undefined || text === '' || text === 0 || text === false) return []
  const out: string[] = []
  for (const m of String(text).matchAll(new RegExp(ID_SOURCE, 'gu'))) {
    if (!out.includes(m[0])) out.push(m[0])
  }
  return out
}

export function findAbbr(text: string | null | undefined): string[] {
  return [...(text ?? '').matchAll(new RegExp(ABBR_SOURCE, 'gu'))].map((m) => pyStrip(m[0]))
}

const LEADING_WS = new RegExp(`^${PY_WS}+`, 'u')
const TRAILING_WS = new RegExp(`${PY_WS}+$`, 'u')

export function pyStrip(s: string): string {
  return s.replace(LEADING_WS, '').replace(TRAILING_WS, '')
}

export function collapseWs(s: string): string {
  return s.replace(new RegExp(`${PY_WS}+`, 'gu'), ' ')
}

const pad = (n: number, width: number) => String(n).padStart(width, '0')

export type ExistsHow = 'exact' | `alias:${string}` | 'parent-of-4tier'

/**
 * 정확 존재 / HOS↔PLC 별칭 존재 / 상위 3단 ID 를 하위 4단이 정의.
 * 검사 2·9·10 과 지표가 **전부 이 함수를 공유**한다 — 따로 짜면 축끼리 숫자가 어긋난다.
 */
export function existsOrAlias(id: string, where: ReadonlySet<string> | ReadonlyMap<string, unknown>): [boolean, ExistsHow | null] {
  if (where.has(id)) return [true, 'exact']
  const { kind, dom, n, sub } = idFields(id)
  const alt = ({ HOS: 'PLC', PLC: 'HOS' } as Record<string, string>)[dom]
  if (alt) {
    const cand = `${kind}-${alt}-${pad(n, 3)}` + (sub !== null ? `-${pad(sub, 2)}` : '')
    if (where.has(cand)) return [true, `alias:${cand}`]
  }
  if (sub === null) {
    const pref = `${kind}-${dom}-${pad(n, 3)}-`
    for (const k of where.keys()) if (k.startsWith(pref)) return [true, 'parent-of-4tier']
  }
  return [false, null]
}

/** 파이썬 `repr(str)` — 메시지 문구를 정본과 같게 두려고 쓴다. */
export function pyRepr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'"
  let body = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
  if (quote === "'") body = body.replace(/'/g, "\\'")
  return `${quote}${body}${quote}`
}

/** 파이썬 `list` 의 `repr` — `[1, 2]` · `['A', 'B']` */
export function pyListRepr(items: readonly (string | number)[]): string {
  return `[${items.map((x) => (typeof x === 'number' ? String(x) : pyRepr(x))).join(', ')}]`
}
