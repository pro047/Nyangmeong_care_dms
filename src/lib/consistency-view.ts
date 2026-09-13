import { FINDING_LEVELS, type FindingLevel } from '@/lib/consistency'

/**
 * 저장된 측정을 화면이 읽을 모양으로 옮긴다. **여기서도 판정하지 않는다.**
 *
 * 비율은 DB 에 없는 것이 사양이라(`consistency.ts` 참고) 나누는 자리가 여기다. 다만
 * 나누는 것과 *어느 축이 정합성이냐를 고르는 것*은 다르다 — 이 파일은 축 9개를 전부
 * 같은 모양으로 만들고, 무엇을 위에 둘지는 컴포넌트가 정한다.
 *
 * 순수 함수인 이유는 테스트가 node 환경이기 때문이다(`consistency.ts` 와 같다).
 */

/** 축 이름은 저쪽과의 계약이다. 오타가 나면 화면에서 조용히 빠지므로 상수로 묶는다. */
export const AXIS = {
  reference: 'reference',
  referenceTotal: 'referenceTotal',
  reqCoverage: 'reqCoverage',
  reqCoverageWithDocs: 'reqCoverageWithDocs',
  scrCoverage: 'scrCoverage',
} as const

export type MetricRow = {
  axis: string
  fromKind: string | null
  toKind: string | null
  ok: number
  total: number
}

export type AxisView = {
  /** 목록 key 이자 계약 확인용. `reference` 는 from/to 가 붙어야 유일해진다. */
  key: string
  label: string
  ok: number
  total: number
  /** 0~100. total 이 0 이면 null — "0%" 로 그리면 분모가 없는 것과 전부 틀린 것이 같아 보인다. */
  percent: number | null
  /**
   * 아직 안 맞는 개수. **화면이 실제로 읽는 숫자는 이쪽이다.**
   * `94.83%` 는 사람이 뺄셈을 해야 "3개" 가 나오는데, 할 일은 그 3개다.
   */
  gap: number
}

/**
 * 분모 0 을 null 로 돌리는 것이 이 함수의 전부다. `0/0` 은 `NaN%` 로 새고, 0 으로 뭉개면
 * *"측정 대상이 없다"* 와 *"전부 틀렸다"* 가 화면에서 같아진다 — 신호등을 금지한 이유와
 * 같은 종류의 오해다.
 */
export function percentOf(ok: number, total: number): number | null {
  return total === 0 ? null : (ok / total) * 100
}

/** 소수 둘째 자리. 95.76% 처럼 저쪽 보고와 같은 자릿수로 읽히게 한다. */
export function formatPercent(percent: number | null): string {
  return percent === null ? '—' : `${percent.toFixed(2)}%`
}

/** ID 를 **쓴 쪽**. 문서 이름으로 읽어야 "어느 파일을 열어야 하나"가 바로 나온다. */
const SOURCE_LABEL: Record<string, string> = {
  REQ: '요구사항정의서',
  FN: '기능명세서',
  SCR: '화면설계서',
}

/** ID 가 **정의된 쪽**. 여기는 문서가 아니라 대상의 종류라 짧게 쓴다. */
const TARGET_LABEL: Record<string, string> = {
  REQ: '요구사항',
  FN: '기능',
  SCR: '화면',
}

/**
 * `FN→SCR` 을 *"기능명세서가 쓴 화면 ID"* 로 읽는다.
 *
 * **화살표와 영문 약어를 쓰지 않는다** (2026-09-13). 이 화면은 개발자가 아니라 팀원 7명이
 * 보고, `CLAUDE.md` 가 "UI 문구는 한국어"로 못박아 뒀다. 원문 기호를 남겨 저쪽 보고서와
 * 대조하려던 것은 **개발자 한 명의 사정**이었다 — 대조는 숫자(`55/58`)로 되고, 축 이름까지
 * 영문일 이유가 없다.
 *
 * `SCR→SCR` 만 "다른 화면"이다. 같은 종류끼리면 자기 자신을 가리키는 것처럼 읽힌다.
 */
export function referenceLabel(fromKind: string | null, toKind: string | null): string {
  const source = fromKind === null ? '?' : (SOURCE_LABEL[fromKind] ?? fromKind)
  const target = toKind === null ? '?' : (TARGET_LABEL[toKind] ?? toKind)
  const same = fromKind !== null && fromKind === toKind
  return `${source}가 쓴 ${same ? '다른 ' : ''}${target} ID`
}

/** 한글 이름이 필요한 자리(툴팁 등)를 위해 따로 둔다. */
export function kindLabel(kind: string | null): string {
  return kind === null ? '?' : (TARGET_LABEL[kind] ?? kind)
}

/**
 * 나머지 축도 **질문 문장**으로 읽는다 — `REQ 커버리지` 는 용어를 아는 사람만 읽지만
 * *"요구사항이 화면·기능에 나오나"* 는 아무나 읽는다.
 *
 * `reqCoverageWithDocs` 의 라벨이 분모를 설명하는 이유: 62 와 50 의 차이가 이 화면에서
 * 가장 오해받기 쉬운 자리다. 빠진 25건 중 12건은 관리자·비기능이라 화면설계서가 있을 수
 * 없고 5건은 신규다 — **실제 판정 대상은 8건**이라는 것이 두 줄을 나란히 둔 이유다.
 */
const AXIS_LABEL: Record<string, string> = {
  [AXIS.referenceTotal]: '가리킨 ID 가 실제로 있나',
  [AXIS.reqCoverage]: '요구사항이 화면·기능에 나오나',
  [AXIS.reqCoverageWithDocs]: '화면설계서가 있을 수 있는 것만',
  [AXIS.scrCoverage]: '화면이 기능명세서에 나오나',
}

function toView(metric: MetricRow): AxisView {
  const isReference = metric.axis === AXIS.reference
  return {
    key: isReference
      ? `${metric.axis}:${metric.fromKind}:${metric.toKind}`
      : metric.axis,
    label: isReference
      ? referenceLabel(metric.fromKind, metric.toKind)
      : (AXIS_LABEL[metric.axis] ?? metric.axis),
    ok: metric.ok,
    total: metric.total,
    percent: percentOf(metric.ok, metric.total),
    gap: metric.total - metric.ok,
  }
}

export type AxisGroups = {
  /** 강조해서 위에 두는 한 줄. 없으면 null — 저쪽이 축을 빼도 화면이 안 깨진다. */
  total: AxisView | null
  /** `reference` 5줄. 저쪽이 보낸 순서를 그대로 쓴다. */
  reference: AxisView[]
  /**
   * 커버리지 3축. `reqNarrow`(분모 62)와 `reqWide`(분모 50)는 **반드시 나란히** 그린다 —
   * 짝이 아니라 두 필드로 둔 이유가 그것이다. 리스트로 두면 순서가 흔들려 떨어질 수 있다.
   */
  coverage: { reqNarrow: AxisView | null; reqWide: AxisView | null; scr: AxisView | null }
  /** **축 계약에 없는 것.** 저쪽이 축을 새로 더해도 화면에서 사라지지 않게 받는 자리다. */
  others: AxisView[]
}

/**
 * 축 9개를 화면 구획으로 나눈다. **하나도 버리지 않는 것이 요건이다** — 대표 축을 뽑으면
 * 그게 *"정합성 = N%"* 라는 판정이 되는데 그 판정은 팀장이 한다. 같은 데이터로 100% ·
 * 95.76% · 59.68% · 74.00% 가 다 나온다.
 *
 * 그래서 `others` 가 있다. 저쪽이 축을 새로 더했는데 우리가 모르는 이름이면 어느 구획에도
 * 안 들어가는데, 그때 **조용히 빠지는 것이 가장 나쁜 결과**다. 모르는 축은 모르는 채로 띄운다.
 *
 * `reqCoverage` 짝을 따로 뽑는 이유: 59.68% 만 띄우면 오해다. 빠진 25건 중 12건은
 * 관리자(ADM)·비기능(NFR) 이라 화면설계서가 있을 수 없고 5건은 방금 추가된 신규다 —
 * 실제 판정 대상은 8건이라 좁은 분모(74.00%)가 반드시 같이 보여야 한다.
 */
export function axisGroups(metrics: MetricRow[]): AxisGroups {
  const views = metrics.map(toView)
  const pick = (axis: string) => views.find((view) => view.key === axis) ?? null

  const reference = views.filter((_, i) => metrics[i].axis === AXIS.reference)
  const coverage = {
    reqNarrow: pick(AXIS.reqCoverage),
    reqWide: pick(AXIS.reqCoverageWithDocs),
    scr: pick(AXIS.scrCoverage),
  }
  const total = pick(AXIS.referenceTotal)

  const claimed = new Set(
    [total, ...Object.values(coverage), ...reference]
      .filter((view) => view !== null)
      .map((view) => view.key),
  )

  return { total, reference, coverage, others: views.filter((view) => !claimed.has(view.key)) }
}

export type FindingRow = {
  id: string
  level: string
  check: string
  doc: string
  refId: string | null
  where: string | null
  message: string
}

/** 한 필터 칸의 선택지 하나. 건수를 같이 주어 고르기 전에 규모가 보이게 한다. */
export type FacetOption = { value: string; count: number }

export type FindingFacets = {
  /** `FINDING_LEVELS` 순서를 따른다 — 건수 순으로 정렬하면 측정마다 칸이 움직인다. */
  levels: FacetOption[]
  /** 건수 많은 순. `참조` 51건처럼 큰 묶음이 앞에 오는 편이 고르기 쉽다. */
  checks: FacetOption[]
  /** 문서 이름순. 사람이 아는 순서가 이쪽이다. */
  docs: FacetOption[]
}

function tally(values: string[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const value of values) out.set(value, (out.get(value) ?? 0) + 1)
  return out
}

/**
 * findings 149건을 걸러 볼 축 3개를 만든다.
 *
 * **선택지는 받은 데이터에서만 만든다.** 없는 분류를 화면에 만들지 않기 위해서다 —
 * 2026-09-11 측정의 errors 14건 중 6건은 문서 결함이 아니라 저쪽 파서 한계였는데,
 * 그 6건에 "파서 한계" 표시는 **오지 않는다.** 사람이 손으로 가른 것이지 도구 태그가 아니다.
 *
 * `level` 만 예외로 `FINDING_LEVELS` 전체를 깐다. 건수 0 인 등급(pending 이 그렇다)이
 * 사라지면 *"그 등급이 없다"* 와 *"0건이다"* 가 화면에서 같아진다.
 */
export function findingFacets(findings: FindingRow[]): FindingFacets {
  const byLevel = tally(findings.map((finding) => finding.level))
  const byCheck = tally(findings.map((finding) => finding.check))
  const byDoc = tally(findings.map((finding) => finding.doc))

  const levels: FacetOption[] = FINDING_LEVELS.map((level) => ({
    value: level,
    count: byLevel.get(level) ?? 0,
  }))
  // 저쪽이 등급을 새로 더하면 열거에 없어 위 map 에서 빠진다. 그것도 띄운다.
  for (const [value, count] of byLevel) {
    if (!levels.some((option) => option.value === value)) levels.push({ value, count })
  }

  return {
    levels,
    checks: [...byCheck]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'ko')),
    docs: [...byDoc]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value, 'ko')),
  }
}

export type FindingFilter = {
  level: string | null
  check: string | null
  doc: string | null
}

export const EMPTY_FILTER: FindingFilter = { level: null, check: null, doc: null }

/**
 * 고른 값이 지금 선택지에 없으면 "안 거름"으로 되돌린다.
 *
 * 필터는 클라이언트 상태라 **새 측정이 와도 살아남는다.** 고른 `check` 가 새 측정에 없으면
 * `<select>` 는 맞는 `<option>` 이 없어 "전체"를 그리는데 `filterFindings` 는 옛 값으로
 * 계속 거른다 — **화면은 안 걸렀다고 하는데 0건이 나온다.** 렌더 중에 맞추므로 이펙트가
 * 필요 없다(`react-hooks/set-state-in-effect` 를 피하는 정석 자리다).
 */
export function reconcileFilter(filter: FindingFilter, facets: FindingFacets): FindingFilter {
  const keep = (value: string | null, options: FacetOption[]) =>
    value !== null && options.some((option) => option.value === value) ? value : null
  return {
    level: keep(filter.level, facets.levels),
    check: keep(filter.check, facets.checks),
    doc: keep(filter.doc, facets.docs),
  }
}

/** 세 칸은 AND 다. 각 칸의 null 은 "이 축으로는 안 거른다"는 뜻이다. */
export function filterFindings(findings: FindingRow[], filter: FindingFilter): FindingRow[] {
  return findings.filter(
    (finding) =>
      (filter.level === null || finding.level === filter.level) &&
      (filter.check === null || finding.check === filter.check) &&
      (filter.doc === null || finding.doc === filter.doc),
  )
}

const LEVEL_LABEL: Record<string, string> = {
  error: '확인 필요',
  warning: '참고',
  pending: '보류',
  unresolved: '미해결',
}

/**
 * 등급을 한국어로 쓰되 **"오류"라고 쓰지 않는다** (2026-09-13, 사람이 정함).
 *
 * 원래는 영문 그대로 뒀다 — *"오류"로 쓰면 "14개가 잘못됐다"로 읽히는데 뜻은 "14개를
 * 사람이 봐야 한다"* 라는 이유였다. 그 이유는 맞지만 **결론이 틀렸다**: 영문으로 두면
 * 팀원이 아예 못 읽는다. 판정을 피하려면 영어로 도망갈 게 아니라 **판정하지 않는 한국어**
 * 를 고르면 된다 — `error` → `확인 필요` 가 그것이다. 뜻을 그대로 옮긴다.
 *
 * 모르는 등급은 원문 그대로 내보낸다. 저쪽이 등급을 더했을 때 조용히 빠지는 것이 최악이다.
 */
export function levelLabel(level: string): string {
  return LEVEL_LABEL[level] ?? level
}

export type SnapshotDocRow = { key: string; ver: string; dmsId: string; dmsVersion: number }

export type SnapshotDocView = SnapshotDocRow & {
  /** false 면 링크를 걸지 않는다. FK 가 없어서 문서는 이미 없을 수 있다. */
  linkable: boolean
}

/**
 * 측정에 쓴 문서에 링크를 걸 수 있는지 판정한다.
 *
 * **`dmsId` 에 FK 가 없다.** 문서는 하드 삭제되고(2026-09-09 통합에서 9건) 스냅샷은 그
 * 시점의 기록이라 남아야 한다. 그래서 *지금 살아 있는지*는 조회로만 알 수 있고, 없으면
 * 링크를 빼고 이름만 남긴다 — 행을 통째로 감추면 측정이 19개 문서를 봤다는 사실이 사라진다.
 *
 * `activeIds` 는 목록이 이미 읽어 둔 활성 문서 id 집합을 그대로 쓴다(`latest.ts`).
 * 여기서 따로 조회하지 않는 이유는 왕복 하나가 95ms 이기 때문이다.
 */
export function snapshotDocViews(
  docs: SnapshotDocRow[],
  activeIds: ReadonlySet<string>,
): SnapshotDocView[] {
  return docs.map((doc) => ({ ...doc, linkable: activeIds.has(doc.dmsId) }))
}

/**
 * "3일 전 측정" 처럼 쓸 상대 시각. **미래면 null 이다.**
 *
 * `measuredAt` 은 이 앱에서 유일하게 외부가 정하는 시각이고 스키마가 과거로 묶지 않는다.
 * 보내는 쪽 시계가 틀어지거나 연도를 잘못 치면 미래 값이 들어오는데, 그러면 `formatRelative`
 * 가 음수 차이를 `방금` 으로 읽는다 — **"측정 시각을 크게" 라는 요건이 막으려던 바로 그
 * 오해**(낡은 숫자가 현재값으로 읽히는 것)를 도리어 만든다. 그래서 미래는 상대 시각을 안
 * 붙이고 절대 시각만 남긴다. 2099년이 크게 찍혀 있으면 사람이 바로 안다.
 *
 * `now` 를 인자로 받는 이유: 서버에서 계산해 문자열로 내려보내야 한다. 클라이언트에서
 * `Date.now()` 를 읽으면 SSR 과 하이드레이션의 값이 달라진다.
 */
export function measuredAgo(measuredAt: Date, now: Date): string | null {
  const diffMs = now.getTime() - measuredAt.getTime()
  if (diffMs < 0) return null
  const days = Math.floor(diffMs / 86_400_000)
  return days < 1 ? '오늘 측정' : `${days}일 전 측정`
}

export type LevelCount = { level: FindingLevel; count: number }

/**
 * 헤더 줄에 쓸 등급별 건수. **스냅샷에 저장된 값을 쓴다** — findings 를 다시 세지 않는다.
 * 라우트가 저장 전에 `counts` 와 findings 가 같음을 확인했고(체크섬), 저쪽이 보고한 값을
 * 그대로 보여주는 편이 두 숫자가 갈릴 여지를 아예 없앤다.
 */
export function levelCounts(snapshot: {
  errorCount: number
  warningCount: number
  pendingCount: number
  unresolvedCount: number
}): LevelCount[] {
  return [
    { level: 'error', count: snapshot.errorCount },
    { level: 'warning', count: snapshot.warningCount },
    { level: 'pending', count: snapshot.pendingCount },
    { level: 'unresolved', count: snapshot.unresolvedCount },
  ]
}
