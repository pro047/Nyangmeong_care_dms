import { ARROW_AXES, ARROW_CHECKS, PARSE_CHECK } from '@/lib/consistency-arrow-keys'

export { PARSE_CHECK }

/**
 * 저장된 측정을 패널이 읽을 모양으로 옮긴다. **여기서도 판정하지 않는다** — 분자·분모와 빠진 목록만 낸다.
 *
 * 패널은 세 화살표만 그린다(2026-09-28 사람 결정, `consistency-engine/arrows.ts`). 그 전의 축 9개 · 등급 내역 ·
 * findings 필터는 버렸다 — 엔진은 계속 계산해 저장하지만 화면에는 없다. 순수 함수인 이유는 테스트가 node 환경이라서다.
 */

export type MetricRow = {
  axis: string
  fromKind: string | null
  toKind: string | null
  ok: number
  total: number
}

export type FindingRow = {
  check: string
  doc: string
  refId: string | null
  message: string
}

/**
 * 분모 0 을 null 로 돌리는 것이 이 함수의 전부다. `0/0` 은 `NaN%` 로 새고, 0 으로 뭉개면
 * *"측정 대상이 없다"* 와 *"전부 틀렸다"* 가 화면에서 같아진다.
 */
export function percentOf(ok: number, total: number): number | null {
  return total === 0 ? null : (ok / total) * 100
}

/** 소수 첫째 자리. 81.3% — 세 줄을 나란히 읽는 자리라 자릿수를 줄였다. */
export function formatPercent(percent: number | null): string {
  return percent === null ? '—' : `${percent.toFixed(1)}%`
}

export type ArrowView = {
  axis: string
  /** 요구사항 추적성(RTM) 용어로 적는다(2026-09-28 사람 지시) — 화살표는 "누가 누구의 ID 를 적는가" */
  label: string
  ok: number
  total: number
  percent: number | null
  /** 빠진 항목. 펼쳐 보는 목록이고 개수는 `total - ok` 와 같다 */
  missing: MissingItem[]
}

/**
 * 목록 한 줄. 요구사항이면 `name` 이 요구사항명·`detail` 이 세부내용(툴팁), 기능명세 행이면 `name` 이 사유다.
 * 엔진이 메시지를 "이름\n세부내용" 으로 싣는다(`arrows.ts`).
 */
export type MissingItem = { id: string; name: string; detail: string }

export type ArrowPanel = {
  /** 화면설계·기능명세 어디에도 없는 요구사항 — 왼쪽 카드 */
  nowhere: MissingItem[]
  arrows: ArrowView[]
  /**
   * 읽지 못한 문서와 사유. **반드시 보인다** — 못 읽은 문서의 영역은 분모에서 빠지므로(`arrows.ts`) 숫자만 보면
   * 그 영역이 검사됐는지 알 수 없다.
   */
  unreadable: { doc: string; message: string }[]
}

const ARROWS: { axis: string; check: string; label: string }[] = [
  { axis: ARROW_AXES.reqBySCR, check: ARROW_CHECKS.notInSCR, label: '화면설계 요구사항 반영률' },
  { axis: ARROW_AXES.reqByFN, check: ARROW_CHECKS.notInFN, label: '기능명세 요구사항 반영률' },
  { axis: ARROW_AXES.fnToSCR, check: ARROW_CHECKS.fnNoScreen, label: '기능명세 화면 매핑률' },
]

/**
 * 세 화살표 축이 **하나라도 없으면 null** — 화살표가 생기기 전(2026-09-28 이전)의 스냅샷이다. 빈칸을 0% 로 그리면
 * "전부 빠졌다" 로 읽힌다. 메인 안전망이 그런 스냅샷을 보면 다시 잰다(`consistency-refresh.ts`).
 */
export function arrowPanel(metrics: MetricRow[], findings: FindingRow[]): ArrowPanel | null {
  const idsOf = (check: string): MissingItem[] => {
    // 같은 FN ID 가 두 문서에 있으면 두 번 온다 — 목록 key 가 겹치지 않게 한 번만
    const seen = new Map<string, MissingItem>()
    for (const f of findings) {
      if (f.check !== check || !f.refId || seen.has(f.refId)) continue
      // 엔진이 이름 안의 줄바꿈을 공백으로 바꿔 싣는다 — 첫 줄은 언제나 이름 전체다
      const [name = '', ...rest] = f.message.split('\n')
      seen.set(f.refId, { id: f.refId, name, detail: rest.join('\n') })
    }
    return [...seen.values()]
  }
  const arrows: ArrowView[] = []
  for (const arrow of ARROWS) {
    const metric = metrics.find((m) => m.axis === arrow.axis)
    if (!metric) return null
    arrows.push({ ...arrow, ok: metric.ok, total: metric.total, percent: percentOf(metric.ok, metric.total), missing: idsOf(arrow.check) })
  }
  const unreadable = findings.filter((f) => f.check === PARSE_CHECK).map((f) => ({ doc: f.doc, message: f.message }))
  return { nowhere: idsOf(ARROW_CHECKS.missingEverywhere), arrows, unreadable }
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
