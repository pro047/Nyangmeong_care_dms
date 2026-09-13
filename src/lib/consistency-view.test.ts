import { describe, expect, it } from 'vitest'
import {
  AXIS,
  axisGroups,
  EMPTY_FILTER,
  filterFindings,
  findingFacets,
  formatPercent,
  levelCounts,
  levelLabel,
  measuredAgo,
  percentOf,
  reconcileFilter,
  referenceLabel,
  snapshotDocViews,
  type FindingRow,
  type MetricRow,
} from '@/lib/consistency-view'

/** 2026-09-11 실측 페이로드의 축 9개. 값과 순서를 그대로 쓴다. */
const METRICS: MetricRow[] = [
  { axis: AXIS.reference, fromKind: 'FN', toKind: 'REQ', ok: 42, total: 42 },
  { axis: AXIS.reference, fromKind: 'FN', toKind: 'SCR', ok: 55, total: 58 },
  { axis: AXIS.reference, fromKind: 'SCR', toKind: 'FN', ok: 129, total: 129 },
  { axis: AXIS.reference, fromKind: 'SCR', toKind: 'REQ', ok: 48, total: 48 },
  { axis: AXIS.reference, fromKind: 'SCR', toKind: 'SCR', ok: 87, total: 100 },
  { axis: AXIS.referenceTotal, fromKind: null, toKind: null, ok: 361, total: 377 },
  { axis: AXIS.reqCoverage, fromKind: null, toKind: null, ok: 37, total: 62 },
  { axis: AXIS.reqCoverageWithDocs, fromKind: null, toKind: null, ok: 37, total: 50 },
  { axis: AXIS.scrCoverage, fromKind: null, toKind: null, ok: 54, total: 54 },
]

const finding = (over: Partial<FindingRow> & { id: string }): FindingRow => ({
  level: 'error',
  check: '참조',
  doc: 'SCR-COM',
  refId: null,
  where: null,
  message: '메시지',
  ...over,
})

describe('percentOf / formatPercent', () => {
  it('저쪽 보고와 같은 자릿수로 나와야 한다', () => {
    expect(formatPercent(percentOf(361, 377))).toBe('95.76%')
    expect(formatPercent(percentOf(37, 62))).toBe('59.68%')
    expect(formatPercent(percentOf(37, 50))).toBe('74.00%')
    expect(formatPercent(percentOf(54, 54))).toBe('100.00%')
  })

  it('분모가 0 이면 0% 가 아니라 표시를 비워야 한다', () => {
    // "측정 대상이 없다" 와 "전부 틀렸다" 가 화면에서 같아지면 안 된다.
    expect(percentOf(0, 0)).toBeNull()
    expect(formatPercent(percentOf(0, 0))).toBe('—')
    expect(formatPercent(percentOf(0, 5))).toBe('0.00%')
  })
})

describe('axisGroups', () => {
  it('축 9개를 하나도 잃지 않아야 한다', () => {
    const groups = axisGroups(METRICS)
    const seen = [
      groups.total,
      ...groups.reference,
      ...Object.values(groups.coverage),
      ...groups.others,
    ].filter((view) => view !== null)

    expect(seen).toHaveLength(9)
    expect(new Set(seen.map((view) => view.key)).size).toBe(9)
  })

  it('reference 5줄이 한국어 문장 라벨과 함께 순서대로 와야 한다', () => {
    // 화살표와 영문 약어를 쓰지 않는다 — 이 화면은 팀원 7명이 본다.
    const groups = axisGroups(METRICS)

    expect(groups.reference.map((view) => view.label)).toEqual([
      '기능명세서가 쓴 요구사항 ID',
      '기능명세서가 쓴 화면 ID',
      '화면설계서가 쓴 기능 ID',
      '화면설계서가 쓴 요구사항 ID',
      '화면설계서가 쓴 다른 화면 ID',
    ])
    expect(groups.reference[1]).toMatchObject({ ok: 55, total: 58, gap: 3 })
  })

  it('못 채운 개수를 따로 세어 줘야 한다', () => {
    // 94.83% 는 사람이 뺄셈을 해야 "3개" 가 나온다. 할 일은 그 3개다.
    const groups = axisGroups(METRICS)

    expect(groups.reference.map((view) => view.gap)).toEqual([0, 3, 0, 0, 13])
    expect(groups.total?.gap).toBe(16)
    expect(groups.coverage.reqNarrow?.gap).toBe(25)
  })

  it('REQ 커버리지는 넓은 분모와 좁은 분모가 짝으로 나와야 한다', () => {
    // 59.68% 만 띄우면 오해다 — 실제 판정 대상은 8건이다.
    const groups = axisGroups(METRICS)

    expect(groups.coverage.reqNarrow).toMatchObject({ ok: 37, total: 62 })
    expect(groups.coverage.reqWide).toMatchObject({ ok: 37, total: 50 })
  })

  it('모르는 축이 와도 버리지 않고 others 로 띄워야 한다', () => {
    // 조용히 빠지는 것이 가장 나쁜 결과다. 저쪽이 축을 더하면 여기로 온다.
    const groups = axisGroups([
      ...METRICS,
      { axis: 'nfrCoverage', fromKind: null, toKind: null, ok: 1, total: 3 },
    ])

    expect(groups.others).toHaveLength(1)
    expect(groups.others[0]).toMatchObject({ key: 'nfrCoverage', label: 'nfrCoverage' })
  })

  it('축 이름은 같고 to 만 다른 행들을 서로 다르게 봐야 한다', () => {
    // 2026-09-13 운영 실물. 저쪽이 `to` 에 문서 *종류*(SCR)가 아니라 문서 *키*(SCR-CMU)를
    // 넣기 시작했다 — 축 이름만으로 유일하다는 전제가 깨졌다. 9행이 key 하나로 뭉치면
    // 리액트 목록이 겹치고 화면에 한 줄만 남는다. 조용히 합쳐지는 것도 조용히 사라지는
    // 것만큼 나쁘다.
    const perDoc: MetricRow[] = [
      { axis: 'scrFuncCoverage', fromKind: null, toKind: 'SCR-ACC', ok: 51, total: 69 },
      { axis: 'scrFuncCoverage', fromKind: null, toKind: 'SCR-CMU', ok: 15, total: 71 },
      { axis: 'scrFuncCoverage', fromKind: null, toKind: 'SCR-MAN', ok: 0, total: 4 },
      { axis: 'scrFuncCoverage', fromKind: null, toKind: 'SCR-MYP', ok: 98, total: 98 },
    ]
    const groups = axisGroups(perDoc)

    expect(groups.others).toHaveLength(0)
    expect(groups.scrFuncCoverage).toHaveLength(4)
    expect(new Set(groups.scrFuncCoverage.map((view) => view.key)).size).toBe(4)
    // 라벨도 갈려야 한다 — 넷이 같은 이름이면 어느 문서 것인지 알 수 없다.
    expect(groups.scrFuncCoverage.map((view) => view.label)).toEqual([
      'SCR-MAN', 'SCR-CMU', 'SCR-ACC', 'SCR-MYP',
    ])
    expect(groups.scrFuncCoverage[0]).toMatchObject({ ok: 0, total: 4, gap: 4 })
  })

  it('삼각 축과 문서별 9행을 제자리에 두어 19축을 전부 보존해야 한다', () => {
    const perDoc: MetricRow[] = [
      ['SCR-ACC', 51, 69], ['SCR-AIM', 22, 44], ['SCR-CMU', 15, 71],
      ['SCR-COM', 16, 24], ['SCR-CSC', 2, 11], ['SCR-HLT', 31, 34],
      ['SCR-MAN', 0, 4], ['SCR-MYP', 98, 98], ['SCR-PLC', 31, 31],
    ].map(([toKind, ok, total]) => ({
      axis: AXIS.scrFuncCoverage, fromKind: null, toKind: toKind as string,
      ok: ok as number, total: total as number,
    }))
    const groups = axisGroups([
      ...METRICS,
      { axis: AXIS.triangle, fromKind: null, toKind: null, ok: 653, total: 660 },
      ...perDoc.reverse(),
    ])

    expect(groups.triangle).toMatchObject({
      key: 'triangle', label: '연결이 서로 어긋나는 곳', ok: 653, total: 660, gap: 7,
    })
    expect(groups.scrFuncCoverage.map((view) => view.label)).toEqual([
      'SCR-MAN', 'SCR-CSC', 'SCR-CMU', 'SCR-AIM', 'SCR-COM',
      'SCR-ACC', 'SCR-HLT', 'SCR-MYP', 'SCR-PLC',
    ])
    const seen = [groups.total, groups.triangle, ...groups.reference,
      ...Object.values(groups.coverage), ...groups.scrFuncCoverage, ...groups.others]
      .filter((view) => view !== null)
    expect(seen).toHaveLength(19)
    expect(new Set(seen.map((view) => view.key)).size).toBe(19)
    expect(groups.others).toEqual([])
  })

  it('문서별 비율이 없으면 0%와 구별하여 뒤에 두고 동률은 문서 키로 정렬한다', () => {
    const metrics: MetricRow[] = [
      { axis: AXIS.scrFuncCoverage, fromKind: null, toKind: 'SCR-Z', ok: 0, total: 0 },
      { axis: AXIS.scrFuncCoverage, fromKind: null, toKind: 'SCR-B', ok: 2, total: 4 },
      { axis: AXIS.scrFuncCoverage, fromKind: null, toKind: 'SCR-A', ok: 1, total: 2 },
      { axis: AXIS.scrFuncCoverage, fromKind: null, toKind: 'SCR-C', ok: 0, total: 3 },
      { axis: AXIS.scrFuncCoverage, fromKind: null, toKind: 'SCR-Y', ok: 0, total: 0 },
    ]
    const before = structuredClone(metrics)
    const views = axisGroups(metrics).scrFuncCoverage

    expect(views.map((view) => view.label)).toEqual(['SCR-C', 'SCR-A', 'SCR-B', 'SCR-Y', 'SCR-Z'])
    expect(views[3].percent).toBeNull()
    expect(metrics).toEqual(before)
  })

  it('from·to 가 둘 다 null 인 축은 키가 축 이름 그대로여야 한다', () => {
    // 기존 4축(referenceTotal 등)의 키가 바뀌면 안 된다.
    const groups = axisGroups(METRICS)

    expect(groups.total?.key).toBe('referenceTotal')
    expect(groups.coverage.reqNarrow?.key).toBe('reqCoverage')
  })

  it('축이 빠져도 화면이 깨지지 않아야 한다', () => {
    const groups = axisGroups([METRICS[0]])

    expect(groups.total).toBeNull()
    expect(groups.triangle).toBeNull()
    expect(groups.scrFuncCoverage).toEqual([])
    expect(groups.coverage).toEqual({ reqNarrow: null, reqWide: null, scr: null })
    expect(groups.reference).toHaveLength(1)
  })

  it('from/to 가 없는 reference 축도 키가 겹치지 않아야 한다', () => {
    // null 축 4개를 DB 유일 제약이 못 막으므로 여기로 흘러들 수 있다.
    const groups = axisGroups([
      { axis: AXIS.reference, fromKind: null, toKind: null, ok: 1, total: 2 },
      { axis: AXIS.reference, fromKind: 'FN', toKind: 'REQ', ok: 3, total: 4 },
    ])

    expect(new Set(groups.reference.map((view) => view.key)).size).toBe(2)
    expect(groups.reference[0].label).toBe('?가 쓴 ? ID')
  })
})

describe('referenceLabel', () => {
  it('쓴 쪽은 문서 이름으로, 가리킨 쪽은 종류로 읽혀야 한다', () => {
    // 쓴 쪽은 "어느 파일을 열어야 하나" 라서 문서 이름이어야 한다.
    expect(referenceLabel('SCR', 'FN')).toBe('화면설계서가 쓴 기능 ID')
    expect(referenceLabel('FN', 'REQ')).toBe('기능명세서가 쓴 요구사항 ID')
  })

  it('같은 종류끼리면 "다른" 을 붙여야 한다', () => {
    // 안 붙이면 자기 자신을 가리키는 것처럼 읽힌다.
    expect(referenceLabel('SCR', 'SCR')).toBe('화면설계서가 쓴 다른 화면 ID')
  })

  it('모르는 종류는 원문 그대로 내보내야 한다', () => {
    expect(referenceLabel('NFR', 'REQ')).toBe('NFR가 쓴 요구사항 ID')
  })
})

describe('findingFacets', () => {
  const findings = [
    finding({ id: '1', level: 'error', check: '참조', doc: 'SCR-COM' }),
    finding({ id: '2', level: 'error', check: '참조', doc: 'FN-HLT' }),
    finding({ id: '3', level: 'warning', check: '기준REQ', doc: 'FN-HLT' }),
    finding({ id: '4', level: 'unresolved', check: 'unresolved', doc: 'SCR-ACC' }),
  ]

  it('건수 0 인 등급도 칸에 남아야 한다', () => {
    // pending 이 사라지면 "그 등급이 없다" 와 "0건이다" 가 같아진다.
    const facets = findingFacets(findings)

    expect(facets.levels).toEqual([
      { value: 'error', count: 2 },
      { value: 'warning', count: 1 },
      { value: 'pending', count: 0 },
      { value: 'unresolved', count: 1 },
    ])
  })

  it('모르는 등급이 와도 칸에 나타나야 한다', () => {
    const facets = findingFacets([...findings, finding({ id: '5', level: 'fatal' })])

    expect(facets.levels).toContainEqual({ value: 'fatal', count: 1 })
  })

  it('check 는 건수 많은 순, doc 은 이름순이어야 한다', () => {
    const facets = findingFacets(findings)

    // 동수(1건)면 이름순이고 ko 로케일은 한글이 앞이다. 임의여도 정해져 있어야 한다 —
    // 흔들리면 측정마다 필터 칸의 순서가 바뀐다.
    expect(facets.checks.map((option) => option.value)).toEqual(['참조', '기준REQ', 'unresolved'])
    expect(facets.docs.map((option) => option.value)).toEqual(['FN-HLT', 'SCR-ACC', 'SCR-COM'])
  })

  it('받은 데이터에 없는 분류는 만들지 않아야 한다', () => {
    // errors 14건 중 6건이 "파서 한계" 였지만 그 표시는 오지 않는다 — 없는 분류를
    // 화면에 만들면 사람이 도구가 판정한 것으로 읽는다.
    const facets = findingFacets(findings)

    expect(facets.checks.map((option) => option.value)).not.toContain('파서 한계')
  })
})

describe('filterFindings', () => {
  const findings = [
    finding({ id: '1', level: 'error', check: '참조', doc: 'SCR-COM' }),
    finding({ id: '2', level: 'error', check: '결번', doc: 'SCR-COM' }),
    finding({ id: '3', level: 'warning', check: '참조', doc: 'FN-HLT' }),
  ]

  it('빈 필터는 전부 통과시켜야 한다', () => {
    expect(filterFindings(findings, EMPTY_FILTER)).toHaveLength(3)
  })

  it('세 칸을 AND 로 걸어야 한다', () => {
    expect(
      filterFindings(findings, { level: 'error', check: '참조', doc: 'SCR-COM' }).map((f) => f.id),
    ).toEqual(['1'])
    expect(
      filterFindings(findings, { level: 'error', check: '참조', doc: 'FN-HLT' }),
    ).toEqual([])
  })

  it('한 칸만 걸면 그 축으로만 걸러야 한다', () => {
    expect(
      filterFindings(findings, { ...EMPTY_FILTER, doc: 'SCR-COM' }).map((f) => f.id),
    ).toEqual(['1', '2'])
  })
})

describe('levelLabel', () => {
  it('등급을 한국어로 쓰되 "오류" 라고 하지 않아야 한다', () => {
    // "오류" 는 "14개가 잘못됐다" 로 읽힌다. 뜻은 "14개를 사람이 봐야 한다" 다 —
    // 판정을 피하려고 영어로 도망가면 팀원이 아예 못 읽는다.
    expect(levelLabel('error')).toBe('확인 필요')
    expect(levelLabel('warning')).toBe('참고')
    expect(levelLabel('pending')).toBe('보류')
    expect(levelLabel('unresolved')).toBe('미해결')
  })

  it('모르는 등급은 원문 그대로 내보내야 한다', () => {
    // 저쪽이 등급을 더했을 때 조용히 빠지는 것이 최악이다.
    expect(levelLabel('fatal')).toBe('fatal')
  })
})

describe('levelCounts', () => {
  it('스냅샷에 저장된 값을 그대로 써야 한다', () => {
    expect(
      levelCounts({ errorCount: 14, warningCount: 107, pendingCount: 0, unresolvedCount: 28 }),
    ).toEqual([
      { level: 'error', count: 14 },
      { level: 'warning', count: 107 },
      { level: 'pending', count: 0 },
      { level: 'unresolved', count: 28 },
    ])
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

describe('measuredAgo', () => {
  const now = new Date('2026-09-13T10:00:00+09:00')

  it('같은 날이면 오늘로 읽어야 한다', () => {
    expect(measuredAgo(new Date('2026-09-13T02:00:00+09:00'), now)).toBe('오늘 측정')
  })

  it('하루가 지나면 일수로 세야 한다', () => {
    expect(measuredAgo(new Date('2026-09-11T10:00:00+09:00'), now)).toBe('2일 전 측정')
    expect(measuredAgo(new Date('2026-08-13T10:00:00+09:00'), now)).toBe('31일 전 측정')
  })

  it('측정 시각이 미래면 상대 시각을 붙이지 않아야 한다', () => {
    // "방금" 으로 읽히면 낡은 숫자가 현재값으로 보인다 — 시각을 크게 띄운 이유가 그것이다.
    expect(measuredAgo(new Date('2099-09-11T20:14:48+09:00'), now)).toBeNull()
    expect(measuredAgo(new Date('2026-09-13T10:00:01+09:00'), now)).toBeNull()
  })
})

describe('reconcileFilter', () => {
  const facets = findingFacets([
    finding({ id: '1', level: 'error', check: '참조', doc: 'SCR-COM' }),
    finding({ id: '2', level: 'warning', check: '결번', doc: 'FN-HLT' }),
  ])

  it('선택지에 있는 값은 그대로 둬야 한다', () => {
    const filter = { level: 'error', check: '참조', doc: 'SCR-COM' }

    expect(reconcileFilter(filter, facets)).toEqual(filter)
  })

  it('새 측정에 없는 값은 안 거름으로 되돌려야 한다', () => {
    // 되돌리지 않으면 select 는 "전체" 를 그리는데 실제로는 걸러서 0건이 나온다.
    expect(reconcileFilter({ level: 'error', check: '사라진검사', doc: '없는문서' }, facets)).toEqual({
      level: 'error',
      check: null,
      doc: null,
    })
  })

  it('건수 0 인 등급은 남겨 둬야 한다', () => {
    // facets.levels 는 0건 등급도 칸에 깔아 둔다 — 그건 "없는 값" 이 아니다.
    expect(reconcileFilter({ ...EMPTY_FILTER, level: 'pending' }, facets).level).toBe('pending')
  })
})
