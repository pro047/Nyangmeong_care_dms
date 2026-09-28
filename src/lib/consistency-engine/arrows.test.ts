import { describe, expect, it } from 'vitest'
import { ARROW_AXES, ARROW_CHECKS, arrows } from './arrows'
import type { ParsedHtml, ParsedXlsx } from './types'
import type { DocInput } from './verify'

type Row = { reqRefs?: string[]; scrRefs?: string[]; cells?: Record<string, unknown> }

const xlsx = (rows: Record<string, Row>): ParsedXlsx => ({
  type: 'xlsx',
  entries: new Map(Object.entries(rows).map(([id, r], i) => [id, { row: i + 2, cells: r.cells ?? {}, reqRefs: r.reqRefs ?? [], scrRefs: r.scrRefs ?? [] }])),
  refs: {},
  unresolved: [],
  baseReqCell: null,
})

const html = (defines: string[], writes: string[]): ParsedHtml => ({
  type: 'html',
  entries: new Map(defines.map((id) => [id, { blocks: [1] }])),
  blocks: [{ n: 1, bar: '', id: defines[0] ?? null, refs: writes, text: '', funcs: [] }],
  refs: {},
  unresolved: [],
  barsWithoutId: [],
  baseReqMeta: null,
})

const doc = (key: string, parsed: ParsedHtml | ParsedXlsx): DocInput => ({ key, result: { parsed: true, doc: parsed } })
const metric = (result: ReturnType<typeof arrows>, axis: string) => result?.metrics.find((m) => m.axis === axis)
const ids = (result: ReturnType<typeof arrows>, check: string) =>
  [...(result?.errors ?? []), ...(result?.warnings ?? [])].filter((f) => f.check === check).map((f) => f.id)

describe('arrows', () => {
  it('관련 화면 ID 가 "해당 없음" 인 요구사항은 화면설계 분모에서 빠져야 한다 — 기능명세 분모는 영역으로 정한다', () => {
    const result = arrows([
      doc('REQ', xlsx({ 'REQ-ACC-001': {}, 'REQ-ACC-002': {}, 'REQ-ADM-001': { cells: { '관련 화면 ID': '해당 없음' } } })),
      doc('SCR-ACC', html(['SCR-ACC-001'], ['REQ-ACC-001'])),
      doc('FN-ACC', xlsx({ 'FN-ACC-001-01': { reqRefs: ['REQ-ACC-002'], scrRefs: ['SCR-ACC-001'] } })),
    ])

    expect(metric(result, ARROW_AXES.reqBySCR)).toMatchObject({ ok: 1, total: 2 })
    expect(metric(result, ARROW_AXES.reqByFN)).toMatchObject({ ok: 1, total: 2 })
    expect(metric(result, ARROW_AXES.fnToSCR)).toMatchObject({ ok: 1, total: 1 })
    expect(ids(result, ARROW_CHECKS.notInSCR)).toEqual(['REQ-ACC-002'])
    expect(ids(result, ARROW_CHECKS.notInFN)).toEqual(['REQ-ACC-001'])
    expect(ids(result, ARROW_CHECKS.missingEverywhere)).toEqual([])
  })

  it('화면설계·기능명세 어디에도 없는 요구사항은 확인 필요(error) 로 나와야 한다', () => {
    const result = arrows([
      doc('REQ', xlsx({ 'REQ-ACC-001': {}, 'REQ-ACC-002': {} })),
      doc('SCR-ACC', html(['SCR-ACC-001'], ['REQ-ACC-001'])),
      doc('FN-ACC', xlsx({ 'FN-ACC-001-01': { reqRefs: ['REQ-ACC-001'], scrRefs: ['SCR-ACC-001'] } })),
    ])

    expect(result?.errors.map((f) => [f.check, f.id])).toEqual([[ARROW_CHECKS.missingEverywhere, 'REQ-ACC-002']])
  })

  it('HOS 요구사항은 플레이스 문서가 있으면 분모에 들어가야 한다 — 플레이스로 통합됐다', () => {
    const result = arrows([
      doc('REQ', xlsx({ 'REQ-PLC-001': {}, 'REQ-HOS-002': {} })),
      doc('SCR-PLC', html(['SCR-PLC-001'], ['REQ-PLC-001'])),
    ])

    expect(metric(result, ARROW_AXES.reqBySCR)).toMatchObject({ ok: 1, total: 2 })
    expect(ids(result, ARROW_CHECKS.notInSCR)).toEqual(['REQ-HOS-002'])
  })

  it('화면 ID 가 없거나 없는 화면을 가리키는 기능명세 행은 화면 지정 없음으로 나와야 한다', () => {
    const result = arrows([
      doc('REQ', xlsx({ 'REQ-ACC-001': {} })),
      doc('SCR-ACC', html(['SCR-ACC-001'], ['REQ-ACC-001'])),
      doc('FN-ACC', xlsx({
        'FN-ACC-001-01': { reqRefs: ['REQ-ACC-001'], scrRefs: ['SCR-ACC-001'] },
        'FN-ACC-001-02': { reqRefs: ['REQ-ACC-001'] },
        'FN-ACC-001-03': { reqRefs: ['REQ-ACC-001'], scrRefs: ['SCR-ACC-099'] },
      })),
    ])

    expect(metric(result, ARROW_AXES.fnToSCR)).toMatchObject({ ok: 1, total: 3 })
    expect(result?.warnings.filter((f) => f.check === ARROW_CHECKS.fnNoScreen).map((f) => [f.id, f.msg])).toEqual([
      ['FN-ACC-001-02', '화면 ID 가 없음'],
      ['FN-ACC-001-03', '없는 화면을 가리킴: SCR-ACC-099'],
    ])
  })

  it('요구사항정의서를 못 읽었으면 축을 0/0 으로 내야 한다 — 축이 빠지면 안전망이 옛 스냅샷으로 보고 계속 잰다', () => {
    const result = arrows([{ key: 'REQ', result: { parsed: false, error: '읽기 실패' } }, doc('SCR-ACC', html(['SCR-ACC-001'], []))])

    expect(result.metrics).toEqual(Object.values(ARROW_AXES).map((axis) => ({ axis, ok: 0, total: 0 })))
    expect(result.errors).toEqual([])
  })

  it('화면설계서가 PLC 표기로 적은 HOS 요구사항은 담은 것으로 봐야 한다 — 영역 통합', () => {
    const result = arrows([
      doc('REQ', xlsx({ 'REQ-HOS-002': {} })),
      doc('SCR-PLC', html(['SCR-PLC-001'], ['REQ-PLC-002'])),
    ])

    expect(metric(result, ARROW_AXES.reqBySCR)).toMatchObject({ ok: 1, total: 1 })
  })

  it('한쪽 문서만 있는 영역의 요구사항은 "둘 다에 없음" 으로 세지 않아야 한다', () => {
    const result = arrows([
      doc('REQ', xlsx({ 'REQ-LAN-001': {} })),
      doc('SCR-LAN', html(['SCR-LAN-001'], [])),
    ])

    expect(ids(result, ARROW_CHECKS.notInSCR)).toEqual(['REQ-LAN-001'])
    expect(ids(result, ARROW_CHECKS.missingEverywhere)).toEqual([])
  })
})

describe('arrows 메시지', () => {
  it('요구사항 누락은 요구사항명과 세부내용을 줄바꿈으로 실어야 한다 — 패널이 첫 줄을 목록, 나머지를 툴팁에 쓴다', () => {
    const result = arrows([
      doc('REQ', xlsx({ 'REQ-ACC-004': { cells: { 요구사항명: '비밀번호 재설정', 세부내용: '○ 이메일로 재설정 링크를 보낸다' } } })),
      doc('SCR-ACC', html(['SCR-ACC-001'], [])),
      doc('FN-ACC', xlsx({ 'FN-ACC-001-01': { reqRefs: [], scrRefs: ['SCR-ACC-001'] } })),
    ])

    expect(result.errors).toEqual([
      expect.objectContaining({ check: ARROW_CHECKS.missingEverywhere, id: 'REQ-ACC-004', msg: '비밀번호 재설정\n○ 이메일로 재설정 링크를 보낸다' }),
    ])
  })

  it('해당 없음 요구사항은 둘 다에 없어도 미반영 요구사항이 아니어야 한다', () => {
    const result = arrows([
      doc('REQ', xlsx({ 'REQ-COM-001': { cells: { '관련 화면 ID': '해당 없음' } } })),
      doc('SCR-COM', html(['SCR-COM-001'], [])),
      doc('FN-COM', xlsx({ 'FN-COM-001-01': { reqRefs: [], scrRefs: ['SCR-COM-001'] } })),
    ])

    expect(ids(result, ARROW_CHECKS.missingEverywhere)).toEqual([])
    expect(ids(result, ARROW_CHECKS.notInSCR)).toEqual([])
    expect(ids(result, ARROW_CHECKS.notInFN)).toEqual(['REQ-COM-001'])
  })
})

describe('arrows 제외 규칙', () => {
  it('못 읽은 화면설계서의 영역은 화면설계 분모와 화면 매핑 분모에서 빠져야 한다 — 가짜 누락이 되지 않게', () => {
    const result = arrows([
      doc('REQ', xlsx({ 'REQ-ACC-001': {}, 'REQ-CMU-001': {} })),
      doc('SCR-ACC', html(['SCR-ACC-001'], ['REQ-ACC-001'])),
      { key: 'SCR-CMU', result: { parsed: false, error: '문서가 휴지통에 있습니다' } },
      doc('FN-CMU', xlsx({ 'FN-CMU-001-01': { reqRefs: ['REQ-CMU-001'], scrRefs: ['SCR-CMU-001'] } })),
    ])

    expect(metric(result, ARROW_AXES.reqBySCR)).toMatchObject({ ok: 1, total: 1 })
    expect(metric(result, ARROW_AXES.fnToSCR)).toMatchObject({ ok: 0, total: 0 })
    expect(ids(result, ARROW_CHECKS.missingEverywhere)).toEqual([])
  })

  it('"해당없음"·"-" 같은 표기도 화면 없음으로 봐야 한다', () => {
    const result = arrows([
      doc('REQ', xlsx({
        'REQ-ADM-001': { cells: { '관련 화면 ID': '해당없음' } },
        'REQ-ADM-002': { cells: { '관련 화면 ID': ' - ' } },
        'REQ-ACC-001': {},
      })),
      doc('SCR-ACC', html(['SCR-ACC-001'], ['REQ-ACC-001'])),
    ])

    expect(metric(result, ARROW_AXES.reqBySCR)).toMatchObject({ ok: 1, total: 1 })
  })

  it('요구사항명 안의 줄바꿈은 공백으로 실어야 한다 — 첫 줄이 이름 전체여야 한다', () => {
    const result = arrows([
      doc('REQ', xlsx({ 'REQ-ACC-004': { cells: { 요구사항명: '비밀번호\n재설정', 세부내용: '상세' } } })),
      doc('SCR-ACC', html(['SCR-ACC-001'], [])),
      doc('FN-ACC', xlsx({ 'FN-ACC-001-01': { reqRefs: [], scrRefs: ['SCR-ACC-001'] } })),
    ])

    expect(result.errors[0]?.msg).toBe('비밀번호 재설정\n상세')
  })
})
