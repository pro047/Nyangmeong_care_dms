import { existsOrAlias, idFields, pyListRepr, pyRepr } from './ids'
import type { DocResult, Finding, ParsedDoc } from './types'

/**
 * `docs.py` 의 `cmd_verify` 중 DMS 로 오는 검사(1~4·7~10)와 축 지표.
 * **판정하지 않는다** — 목록과 분자/분모만 낸다. 비율·통과/실패는 사람 몫이다.
 * 검사 5·6(결정로그)은 정합성 저장소에 남는다(인계문 §5-6).
 */

export type DocInput = { key: string; result: DocResult }

type Parsed = { key: string; doc: ParsedDoc }
type Where = Map<string, string[]>

export type Metrics = {
  reference: Map<string, { ok: number; total: number }>
  referenceTotal: { ok: number; total: number }
  reqCoverage: { ok: number; total: number }
  reqCoverageWithDocs: { ok: number; total: number }
  scrCoverage: { ok: number; total: number }
  triangle: { ok: number; total: number }
  scrFuncCoverage: Map<string, { ok: number; total: number }>
}

export type VerifyResult = {
  errors: Finding[]
  warnings: Finding[]
  unresolved: Finding[]
  metrics: Metrics
}

const pad = (n: number, width: number) => String(n).padStart(width, '0')

function allDefined(docs: Parsed[]): Where {
  const where: Where = new Map()
  for (const { key, doc } of docs) {
    for (const id of doc.entries.keys()) {
      const list = where.get(id) ?? []
      list.push(key)
      where.set(id, list)
    }
  }
  return where
}

function refCheck(
  ref: string,
  srcId: string | null,
  key: string,
  whereIn: string | number,
  where: Where,
  errors: Finding[],
  warnings: Finding[],
  soft = false,
) {
  const loc = `${srcId ?? ''}@${whereIn}`
  const [ok, how] = existsOrAlias(ref, where)
  if (!ok) (soft ? warnings : errors).push({ check: '참조', doc: key, id: ref, where: loc, msg: '참조 대상 없음' })
  else if (how !== 'exact') warnings.push({ check: '참조', doc: key, id: ref, where: loc, msg: `간접 존재 (${how})` })
}

/** 문서 기준 REQ 표기에서 판 번호만. `docs.py:496-504` 와 같은 정규화 */
function baseReqLabel(marker: string): string {
  return (marker.split('v').at(-1) ?? '').replace(/[^\d.]/g, '')
}

export function verify(inputs: DocInput[], reqVer: string | null): VerifyResult {
  const errors: Finding[] = []
  const warnings: Finding[] = []
  const unresolved: Finding[] = []
  const docs: Parsed[] = []
  for (const { key, result } of inputs) {
    if (result.parsed) docs.push({ key, doc: result.doc })
  }
  const where = allDefined(docs)

  for (const { key, result } of inputs) {
    if (!result.parsed) {
      errors.push({ check: '파싱', doc: key, msg: result.error })
      continue
    }
    const d = result.doc
    // (1) 형식: FN 은 4단, REQ 는 3단
    for (const i of d.entries.keys()) {
      const { kind, sub } = idFields(i)
      if (kind === 'FN' && sub === null) {
        warnings.push({ check: '형식', doc: key, id: i, msg: 'FN은 4단(FN-XXX-000-00)이어야 함 — 3단' })
      }
      if (kind === 'REQ' && sub !== null) warnings.push({ check: '형식', doc: key, id: i, msg: 'REQ는 3단' })
    }
    // (3) 중복 / 결번
    if (d.type === 'xlsx') {
      for (const [i, e] of d.entries) {
        if (e.dupRows?.length) errors.push({ check: '중복', doc: key, id: i, msg: `행 ${e.row} 외 ${pyListRepr(e.dupRows)}` })
      }
    } else {
      for (const [i, e] of d.entries) {
        if (e.blocks.length > 1) {
          warnings.push({ check: '중복블록', doc: key, id: i, msg: `프레임 ${pyListRepr(e.blocks)} 에 같은 ID (상태 화면 분할)` })
        }
      }
    }
    const groups = new Map<string, number[]>()
    for (const i of d.entries.keys()) {
      const { kind, dom, n, sub } = idFields(i)
      const g = sub === null ? `${kind}-${dom}` : `${kind}-${dom}-${pad(n, 3)}`
      const list = groups.get(g) ?? []
      list.push(sub === null ? n : sub)
      groups.set(g, list)
    }
    for (const [g, raw] of groups) {
      const nums = [...new Set(raw)].sort((a, b) => a - b)
      const present = new Set(nums)
      const gaps: number[] = []
      for (let x = nums[0]; x < nums[nums.length - 1]; x++) if (!present.has(x)) gaps.push(x)
      if (gaps.length) {
        warnings.push({
          check: '결번',
          doc: key,
          id: g,
          msg: `${gaps.length}개: ${pyListRepr(gaps.slice(0, 12))}${gaps.length > 12 ? '…' : ''}`,
        })
      }
    }
    if (d.type === 'html') {
      for (const b of d.barsWithoutId) {
        warnings.push({ check: '프레임바', doc: key, msg: `ID 없는 프레임바: ${Array.from(b).slice(0, 40).join('')}` })
      }
    }
    // (2) 참조 존재
    if (d.type === 'xlsx' && key !== 'REQ') {
      for (const [i, e] of d.entries) {
        for (const r of [...e.reqRefs, ...e.scrRefs]) refCheck(r, i, key, e.row, where, errors, warnings)
      }
    } else if (d.type === 'html') {
      for (const bk of d.blocks) {
        for (const r of bk.refs) refCheck(r, bk.id, key, `블록${bk.n}`, where, errors, warnings)
      }
      for (const list of Object.values(d.refs)) {
        for (const r of list) refCheck(r, null, key, '프레임 밖', where, errors, warnings, true)
      }
    }
    // (4) 기준 REQ — 비교 기준은 REQ 문서 `제.개정내역` 의 현재 판(파일명이 아니다)
    const marker = (d.type === 'xlsx' ? d.baseReqCell : d.baseReqMeta) || null
    if (key !== 'REQ') {
      if (marker === null) {
        warnings.push({
          check: '기준REQ',
          doc: key,
          msg: 'D-041 표기 없음 (xlsx 제.개정내역!B1 / html meta base-req) → null',
        })
      } else {
        const got = baseReqLabel(marker)
        if (reqVer && got !== reqVer) {
          errors.push({ check: '기준REQ', doc: key, msg: `문서 기준 ${got} ≠ REQ 현재 판 ${reqVer}` })
        }
      }
    }
    for (const u of d.unresolved) unresolved.push({ doc: key, ...u })
  }

  // (7) REQ 커버리지
  const uncovered = reqCoverage(docs, where)
  warnings.push(...uncovered)
  // (8) 화면설계서 기능 정의 ↔ 기능명세서
  const { gaps: funcGaps, per: funcPer } = scrFuncCoverage(docs, where)
  warnings.push(...funcGaps)
  // (9) 요구사항정의서 `관련 화면 ID` → 화면설계서
  warnings.push(...reqScreenRefs(docs, where))
  // (10) REQ↔SCR↔FN 삼각
  const tri = triangleCheck(docs, where)
  warnings.push(...tri.gaps)

  return { errors, warnings, unresolved, metrics: consistencyMetrics(docs, where, uncovered, funcPer, tri) }
}

/** 기능명 비교용 정규화. 기호는 표기 취향이지 내용이 아니다 */
function funcNameKey(s: unknown): string {
  return String(s).toLowerCase().replace(/[^0-9a-z가-힣]/g, '')
}

function cellString(cells: Record<string, unknown>, name: string): string | null {
  const v = cells[name]
  if (v === null || v === undefined || v === '' || v === 0 || v === false) return null
  return String(v).trim()
}

/**
 * 검사 (8) — 화면설계서의 기능 정의 표 항목이 기능명세서에 있는가. **SCR→FN 한 방향뿐**
 * (FN 이 더 많은 것은 세분화라 정상). 문서별 집계를 같이 낸다 — 합계만 보면 "작성 방식이
 * 다른 문서" 와 "진짜 누락" 이 섞인다.
 */
function scrFuncCoverage(docs: Parsed[], where: Where) {
  const fnByScr = new Map<string, Set<string>>()
  const fnById = new Map<string, string>()
  for (const { key, doc } of docs) {
    if (!key.startsWith('FN-') || doc.type !== 'xlsx') continue
    for (const [eid, e] of doc.entries) {
      const nm = cellString(e.cells, '기능명')
      if (nm === null) continue
      fnById.set(eid, nm)
      for (const s of e.scrRefs) {
        const set = fnByScr.get(s) ?? new Set<string>()
        set.add(nm)
        fnByScr.set(s, set)
      }
    }
  }

  const gaps: Finding[] = []
  const per = new Map<string, { ok: number; total: number }>()
  for (const { key, doc } of docs) {
    if (!key.startsWith('SCR-') || doc.type !== 'html') continue
    for (const b of doc.blocks) {
      const sid = b.id
      if (!sid) continue
      const names = new Set(fnByScr.get(sid) ?? [])
      const [, how] = existsOrAlias(sid, where)
      if (how && how.startsWith('alias')) for (const x of fnByScr.get(how.split(':')[1]) ?? []) names.add(x)
      const keys = [...names].map(funcNameKey)
      for (const [name, fid] of b.funcs) {
        const row = per.get(key) ?? { ok: 0, total: 0 }
        per.set(key, row)
        row.total += 1
        const n = funcNameKey(name)
        const found =
          (fid !== null && fnById.has(fid) && funcNameKey(fnById.get(fid)) === n) ||
          (n !== '' && keys.some((k2) => n.includes(k2) || k2.includes(n)))
        if (found) row.ok += 1
        else {
          gaps.push({
            check: '화면기능대응',
            doc: key,
            id: sid,
            where: `블록${b.n}`,
            msg: `기능 정의 표의 ${pyRepr(name)} 을 기능명세서에서 못 찾음`,
          })
        }
      }
    }
  }
  return { gaps, per }
}

/** 검사 (9) — `관련 화면 ID` 가 가리키는 화면이 있는가. `해당 없음`·`미배정` 은 ID 가 아니라 대상이 아니다 */
function reqScreenRefs(docs: Parsed[], where: Where): Finding[] {
  const out: Finding[] = []
  const req = docs.find((d) => d.key === 'REQ')?.doc
  if (!req || req.type !== 'xlsx') return out
  for (const [rid, e] of req.entries) {
    for (const s of e.scrRefs) {
      if (!existsOrAlias(s, where)[0]) {
        out.push({
          check: 'REQ화면대응',
          doc: 'REQ',
          id: rid,
          where: `행${e.row}`,
          msg: `\`관련 화면 ID\` 의 ${s} 가 화면설계서에 없음`,
        })
      }
    }
  }
  return out
}

/**
 * 검사 (10) — 기능명세서가 이은 REQ↔SCR 쌍을 양 끝이 인정하는가.
 * REQ 의 `관련 화면 ID` 는 **닫힘 근거로만** 쓴다 — 완전한 목록이 아니라 대표 화면이라,
 * 어긋남으로 세면 399건이 나오고 대부분 오탐이다(`docs.py:665-729`).
 *
 * 파이썬에서 빈 set 은 거짓이다. `scr_req` 는 defaultdict 라 REQ 참조가 없는 화면도
 * 빈 set 으로 들어 있고, 그때 별칭 쪽으로 넘어간다 — size 로 흉내 낸다.
 */
function triangleCheck(docs: Parsed[], where: Where) {
  const scrReq = new Map<string, Set<string>>()
  for (const { key, doc } of docs) {
    if (!key.startsWith('SCR-') || doc.type !== 'html') continue
    for (const b of doc.blocks) {
      if (!b.id) continue
      const set = scrReq.get(b.id) ?? new Set<string>()
      for (const r of b.refs) if (r.startsWith('REQ-')) set.add(r)
      scrReq.set(b.id, set)
    }
  }
  const reqScr = new Map<string, Set<string>>()
  const req = docs.find((d) => d.key === 'REQ')?.doc
  if (req && req.type === 'xlsx') {
    for (const [rid, e] of req.entries) if (e.scrRefs.length) reqScr.set(rid, new Set(e.scrRefs))
  }

  const same = (a: string, b: string) => a === b || existsOrAlias(a, new Set([b]))[0]
  const nonEmpty = (s: Set<string> | undefined) => (s && s.size ? s : undefined)

  const gaps: Finding[] = []
  let closed = 0
  let total = 0
  for (const { key, doc } of docs) {
    if (!key.startsWith('FN-') || doc.type !== 'xlsx') continue
    for (const [eid, e] of doc.entries) {
      for (const r of e.reqRefs) {
        for (const scr of e.scrRefs) {
          const saysReq = reqScr.get(r)
          const saysScr =
            nonEmpty(scrReq.get(scr)) ?? nonEmpty(scrReq.get((existsOrAlias(scr, where)[1] ?? '').split(':').at(-1)!))
          if (saysReq && [...saysReq].some((x) => same(scr, x))) {
            total += 1
            closed += 1
            continue
          }
          if (!saysScr) continue // 화면이 말이 없다 — 대조 불가
          total += 1
          if ([...saysScr].some((x) => same(r, x))) {
            closed += 1
            continue
          }
          gaps.push({
            check: '삼각불일치',
            doc: key,
            id: eid,
            where: `행${e.row}`,
            msg: `${r} ↔ ${scr} 을 이었는데 ${scr} 는 ${pyListRepr([...saysScr].sort())} 를 참조한다`,
          })
        }
      }
    }
  }
  return { gaps, closed, total }
}

/**
 * 정의된 REQ 중 어느 SCR·FN 도 참조하지 않은 것. 프레임 밖 참조도 커버로 친다 —
 * "어디에도 안 쓰였다" 를 묻는 것이라 약한 참조도 쓰인 것이다.
 */
function reqCoverage(docs: Parsed[], where: Where): Finding[] {
  const used = new Set<string>()
  for (const { key, doc } of docs) {
    if (key === 'REQ') continue
    if (doc.type === 'xlsx') {
      for (const e of doc.entries.values()) for (const r of e.reqRefs) used.add(r)
    } else {
      for (const bk of doc.blocks) for (const r of bk.refs) if (r.startsWith('REQ-')) used.add(r)
      for (const list of Object.values(doc.refs)) for (const r of list) if (r.startsWith('REQ-')) used.add(r)
    }
  }
  const out: Finding[] = []
  const reqIds = [...where.keys()].filter((k) => k.startsWith('REQ-')).sort()
  for (const i of reqIds) {
    if (used.has(i)) continue
    const { dom } = idFields(i)
    const hasDoc = [...where.keys()].some((k) => k.startsWith(`SCR-${dom}-`) || k.startsWith(`FN-${dom}-`))
    out.push({
      check: 'REQ커버리지',
      doc: 'REQ',
      id: i,
      msg: hasDoc ? 'SCR·FN 은 있는데 이 REQ 만 참조 없음' : `${dom} 도메인 SCR·FN 정의 자체가 없음`,
    })
  }
  return out
}

/**
 * 축별 분자/분모. 세는 단위는 **(문서, 참조ID) 고유 쌍**이다 — "연" 으로 세면 같은 ID 가
 * 프레임 여러 곳에 나와 SCR→FN 이 129 대신 258 이 된다.
 */
function consistencyMetrics(
  docs: Parsed[],
  where: Where,
  uncovered: Finding[],
  funcPer: Map<string, { ok: number; total: number }>,
  tri: { closed: number; total: number },
): Metrics {
  const seen = new Map<string, Set<string>>()
  const broken = new Map<string, Set<string>>()
  const add = (m: Map<string, Set<string>>, axis: string, pair: string) => {
    const set = m.get(axis) ?? new Set<string>()
    set.add(pair)
    m.set(axis, set)
  }
  for (const { key, doc } of docs) {
    const src = key.split('-')[0]
    let refs: string[]
    if (doc.type === 'xlsx' && key !== 'REQ') {
      refs = [...doc.entries.values()].flatMap((e) => [...e.reqRefs, ...e.scrRefs])
    } else if (doc.type === 'html') {
      refs = [...doc.blocks.flatMap((bk) => bk.refs), ...Object.values(doc.refs).flat()]
    } else continue
    for (const r of new Set(refs)) {
      const axis = `${src}→${r.split('-')[0]}`
      add(seen, axis, `${key}\u0000${r}`)
      if (!existsOrAlias(r, where)[0]) add(broken, axis, `${key}\u0000${r}`)
    }
  }
  const reference = new Map<string, { ok: number; total: number }>()
  let refOk = 0
  let refTotal = 0
  for (const axis of [...seen.keys()].sort()) {
    const total = seen.get(axis)!.size
    const ok = total - (broken.get(axis)?.size ?? 0)
    reference.set(axis, { ok, total })
    refOk += ok
    refTotal += total
  }

  const noDoc = new Set(uncovered.filter((w) => w.msg?.includes('정의 자체가 없음')).map((w) => w.id))
  const reqAll = [...where.keys()].filter((k) => k.startsWith('REQ-'))
  const scrAll = [...where.keys()].filter((k) => k.startsWith('SCR-'))
  const usedScr = new Set<string>()
  for (const { key, doc } of docs) {
    if (key.startsWith('FN-') && doc.type === 'xlsx') for (const e of doc.entries.values()) e.scrRefs.forEach((s) => usedScr.add(s))
  }
  const covered = reqAll.length - uncovered.length
  return {
    reference,
    referenceTotal: { ok: refOk, total: refTotal },
    reqCoverage: { ok: covered, total: reqAll.length },
    // SCR·FN 문서 자체가 없는 도메인(ADM·NFR)을 뺀 분모. 어느 쪽을 쓸지는 사람이 고른다
    reqCoverageWithDocs: { ok: covered, total: reqAll.length - noDoc.size },
    scrCoverage: { ok: scrAll.filter((s) => usedScr.has(s)).length, total: scrAll.length },
    triangle: { ok: tri.closed, total: tri.total },
    scrFuncCoverage: new Map([...funcPer.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  }
}

