import { describe, expect, it } from 'vitest'
import { ARROW_AXES, ARROW_CHECKS } from '@/lib/consistency-arrow-keys'
import { PARSE_CHECK, arrowPanel, formatPercent, percentOf, snapshotDocViews, type FindingRow, type MetricRow } from '@/lib/consistency-view'

const metric = (axis: string, ok: number, total: number): MetricRow => ({ axis, fromKind: null, toKind: null, ok, total })
const f = (check: string, refId: string, message = '이름'): FindingRow => ({ check, doc: 'REQ', refId, message })

/** 2026-09-28 운영 최신판 실측 값 */
const METRICS: MetricRow[] = [
  metric('referenceTotal', 563, 591),
  metric(ARROW_AXES.reqBySCR, 39, 48),
  metric(ARROW_AXES.reqByFN, 39, 48),
  metric(ARROW_AXES.fnToSCR, 623, 627),
]

describe('percentOf / formatPercent', () => {
  it('소수 첫째 자리로 나와야 한다', () => {
    expect(formatPercent(percentOf(39, 48))).toBe('81.3%')
  })

  it('분모가 0 이면 0% 가 아니라 표시를 비워야 한다', () => {
    expect(percentOf(0, 0)).toBeNull()
    expect(formatPercent(null)).toBe('—')
  })
})

describe('arrowPanel', () => {
  it('세 화살표를 정해진 순서로, 빠진 ID 목록과 함께 만들어야 한다', () => {
    const panel = arrowPanel(METRICS, [
      f(ARROW_CHECKS.missingEverywhere, 'REQ-COM-001'),
      f(ARROW_CHECKS.notInSCR, 'REQ-COM-001'),
      f(ARROW_CHECKS.notInSCR, 'REQ-AIM-006'),
      f(ARROW_CHECKS.notInFN, 'REQ-CMU-008'),
      f(ARROW_CHECKS.fnNoScreen, 'FN-ACC-002-02'),
      f(ARROW_CHECKS.fnNoScreen, 'FN-ACC-002-02'),
      f('참조', 'SCR-CMU-001-01'),
    ])

    expect(panel?.nowhere.map((m) => m.id)).toEqual(['REQ-COM-001'])
    expect(panel?.arrows.map((a) => [a.axis, a.ok, a.total, a.missing.map((m) => m.id)])).toEqual([
      [ARROW_AXES.reqBySCR, 39, 48, ['REQ-COM-001', 'REQ-AIM-006']],
      [ARROW_AXES.reqByFN, 39, 48, ['REQ-CMU-008']],
      // 같은 ID 가 두 번 와도 한 번만 — 목록 key 가 겹치지 않게
      [ARROW_AXES.fnToSCR, 623, 627, ['FN-ACC-002-02']],
    ])
  })

  it('메시지의 첫 줄은 이름, 나머지는 세부내용으로 나눠야 한다', () => {
    const panel = arrowPanel(METRICS, [f(ARROW_CHECKS.missingEverywhere, 'REQ-ACC-004', '비밀번호 재설정\n○ 링크를 보낸다\n○ 30분 유효')])

    expect(panel?.nowhere).toEqual([{ id: 'REQ-ACC-004', name: '비밀번호 재설정', detail: '○ 링크를 보낸다\n○ 30분 유효' }])
  })

  it('읽지 못한 문서를 사유와 함께 내야 한다 — 분모가 조용히 줄어드는 것을 가리지 않게', () => {
    const panel = arrowPanel(METRICS, [{ check: PARSE_CHECK, doc: 'SCR-ACC', refId: null, message: '휴지통에 있음' }])

    expect(panel?.unreadable).toEqual([{ doc: 'SCR-ACC', message: '휴지통에 있음' }])
  })

  it('화살표 축이 하나라도 없으면 null 이어야 한다 — 화살표 전 스냅샷을 0% 로 그리지 않는다', () => {
    expect(arrowPanel(METRICS.filter((m) => m.axis !== ARROW_AXES.fnToSCR), [])).toBeNull()
  })
})

describe('snapshotDocViews', () => {
  const docs = [
    { key: 'SCR-COM', ver: 'v0.5', dmsId: 'doc-alive', dmsVersion: 2 },
    { key: 'FN-HLT', ver: 'v0.5', dmsId: 'doc-merged-away', dmsVersion: 3 },
  ]

  it('사라진 문서는 링크를 빼되 행은 남겨야 한다', () => {
    // 합치기가 하드 삭제라 dmsId 가 남아 있지 않을 수 있다. 행까지 감추면 측정이
    // 19개 문서를 봤다는 사실이 사라진다.
    const views = snapshotDocViews(docs, new Set(['doc-alive']))

    expect(views).toHaveLength(2)
    expect(views[0].linkable).toBe(true)
    expect(views[1].linkable).toBe(false)
    expect(views[1].key).toBe('FN-HLT')
  })

  it('활성 문서가 하나도 없어도 던지지 않아야 한다', () => {
    expect(snapshotDocViews(docs, new Set()).every((view) => !view.linkable)).toBe(true)
  })
})
