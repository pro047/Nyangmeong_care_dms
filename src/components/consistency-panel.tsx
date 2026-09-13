'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import {
  axisGroups,
  EMPTY_FILTER,
  filterFindings,
  findingFacets,
  formatPercent,
  levelCounts,
  levelLabel,
  reconcileFilter,
  snapshotDocViews,
  type AxisView,
  type FindingFilter,
  type FindingRow,
  type MetricRow,
  type SnapshotDocRow,
} from '@/lib/consistency-view'

export type ConsistencySnapshotView = {
  /**
   * **서버에서 만든 문자열로 받는다.** 이 컴포넌트는 클라이언트라 SSR 후 하이드레이션을
   * 하는데, 시각 포매팅을 여기서 하면 두 가지가 갈린다 — `Date.now()` 가 렌더마다 다르고,
   * `toLocaleDateString` 이 **실행 머신의 TZ**를 쓴다(운영은 UTC, 브라우저는 KST).
   * 날짜가 하루 어긋난 채 하이드레이션 불일치가 나고, 바로 옆 절대 시각과 모순된다.
   */
  measuredLabel: string
  /** "3일 전 측정". 측정 시각이 미래면 null 이라 아무것도 안 붙는다. */
  agoLabel: string | null
  reqVer: string
  errorCount: number
  warningCount: number
  pendingCount: number
  unresolvedCount: number
  metrics: MetricRow[]
  findings: FindingRow[]
  docs: SnapshotDocRow[]
}

/**
 * 비율 하나를 한계에 대고 보는 자리라 **미터**를 쓴다 (막대그래프도 파이도 아니다).
 *
 * **채움 색으로 심각도를 나타내지 않는다.** 미터의 일반 관례는 accent→warning→danger 지만
 * 이 화면은 신호등이 금지다 — 2026-09-11 측정의 `확인 필요` 14건 중 **6건은 문서 결함이
 * 아니라 저쪽 파서 한계**였고, 색이 있었으면 빨강이었으며 그건 틀린 신호다. 전부 한 색이다.
 *
 * **트랙이 배경보다 진하다.** 95.76% 처럼 거의 찬 미터에서 사람이 봐야 할 것은 *남은 4%*
 * 인데, 트랙이 배경과 같으면 그 자리가 "빈 곳"이 아니라 "카드 여백"으로 읽힌다.
 */
function Meter({ view, strong = false }: { view: AxisView; strong?: boolean }) {
  const filled = view.total === 0 ? 0 : (view.ok / view.total) * 100
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-border"
      role="img"
      aria-label={`${view.total} 중 ${view.ok}`}
    >
      <div
        className={`h-full rounded-full ${strong ? 'bg-ink' : 'bg-ink-muted'}`}
        style={{ width: `${filled}%` }}
      />
    </div>
  )
}

/**
 * 미터 한 줄 = 라벨 · 분수 · 못 채운 개수 · 막대.
 *
 * **못 채운 개수를 직접 라벨로 단다.** 축 9개가 전부 90% 이상이라 막대만으로는 서로
 * 구분이 안 된다 — 그게 사실이기도 하다(거의 다 맞다). 그래서 막대는 맥락이고 **메시지는
 * 숫자**다. `94.83%` 는 사람이 뺄셈을 해야 "3개"가 나오는데 할 일은 그 3개다.
 */
function MeterRow({
  view,
  gapNoun,
  label,
  showPercent,
  strong = false,
  indent = false,
}: {
  view: AxisView
  /** "없음" · "아직 안 나옴" 처럼 구획마다 다른 말. 빠진 것의 뜻이 구획마다 다르다. */
  gapNoun: string
  /** 카드 제목과 같은 말이 되는 줄에서만 덮어쓴다 — 같은 문장이 두 번 나오면 읽다 멈춘다. */
  label?: string
  /**
   * 기본은 강조 줄만. **짝을 이루는 줄은 반드시 같이 켠다** — 한쪽만 비율이 보이면
   * 나란히 둔 뜻이 사라진다. 2026-09-13 에 `74.00%` 만 빠져 E2E V4 가 잡았다.
   */
  showPercent?: boolean
  strong?: boolean
  indent?: boolean
}) {
  return (
    <div className={indent ? 'pl-3' : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className={`min-w-0 text-xs ${strong ? 'text-ink' : 'text-ink-muted'}`}>
          {indent && <span className="mr-1 text-ink-subtle">└</span>}
          {label ?? view.label}
        </p>
        <p className="shrink-0 text-xs">
          <span className={`tabular-nums text-ink ${strong ? 'font-medium' : ''}`}>
            {view.ok}/{view.total}
          </span>{' '}
          <span className="tabular-nums text-ink-subtle">
            {view.gap === 0 ? '전부 확인됨' : gapNoun === '곳' ? `${view.gap}곳 어긋남` : `${view.gap}개 ${gapNoun}`}
          </span>
          {/* 저쪽 보고서는 비율로 적혀 있다. 붙여서 대조가 되게 하되 주인공은 개수다 —
              비율만 따로 모아 두면 어느 숫자가 어느 축인지 알 수 없다. */}
          {(showPercent ?? strong) && (
            <span className="ml-1.5 tabular-nums text-ink-subtle">
              {formatPercent(view.percent)}
            </span>
          )}
        </p>
      </div>
      <div className="mt-0.5">
        <Meter view={view} strong={strong} />
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-canvas p-3">
      <h3 className="mb-2.5 text-xs font-semibold text-ink">{title}</h3>
      <div className="grid gap-2">{children}</div>
    </section>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | null
  options: { value: string; count: number }[]
  onChange: (next: string | null) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-ink-muted">
      {label}
      <select
        // '' 가 "안 거른다" 다. null 을 value 로 줄 수 없어 빈 문자열로 갈음한다.
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink"
      >
        <option value="">전체</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.value} ({option.count})
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * 정합성 측정 1회를 메인 목록 위에 대시보드로 띄운다.
 *
 * **구획 셋이 팀원이 묻는 질문 셋이다** — 저쪽 데이터 모델("축 9개")을 그대로 늘어놓으면
 * `FN→REQ 42/42` 가 되는데 그건 개발자만 읽는다. ① 가리킨 ID 가 실제로 있나 ② 정의만 해
 * 놓고 안 쓴 것이 있나 ③ 내가 볼 목록이 뭔가.
 *
 * **축 9개는 항상 펼쳐 두고 findings 149건만 접는다.** 접힘 상태에서 한 축만 보이면 그게
 * *"정합성 = N%"* 라는 판정이 되는데 그 판정은 팀장이 한다 — 같은 데이터로 100% ·
 * 95.76% · 59.68% · 74.00% 가 다 나온다.
 *
 * **히어로 숫자를 findings 건수로 잡았다.** 비율을 크게 띄우면 그것이 곧 판정이지만
 * 149 는 *"사람이 볼 항목이 149개"* 라는 **할 일의 크기**라 판정이 아니다. 한 화면에
 * 히어로는 하나다.
 *
 * 필터를 searchParams 가 아니라 클라이언트 상태로 두는 이유: 여기는 메인이라 URL 이 바뀌면
 * 문서 목록·폴더·구버전 판정까지 전부 다시 조회된다. findings 149행은 이미 HTML 에 실려
 * 있으므로 거르는 데 왕복이 필요 없다.
 */
export function ConsistencyPanel({
  snapshot,
  activeDocumentIds,
}: {
  snapshot: ConsistencySnapshotView
  /** 링크를 걸 수 있는 문서. `dmsId` 에 FK 가 없어 이미 사라진 문서가 섞여 있다. */
  activeDocumentIds: ReadonlySet<string>
}) {
  const [open, setOpen] = useState(false)
  const [docsOpen, setDocsOpen] = useState(false)
  const [raw, setRaw] = useState<FindingFilter>(EMPTY_FILTER)

  const groups = axisGroups(snapshot.metrics)
  const facets = findingFacets(snapshot.findings)
  // 새 측정이 오면 선택지가 바뀐다. 렌더 중에 맞춰야 "전체인데 0건" 이 안 나온다.
  const filter = reconcileFilter(raw, facets)
  const shown = filterFindings(snapshot.findings, filter)
  const docs = snapshotDocViews(snapshot.docs, activeDocumentIds)
  const counts = levelCounts(snapshot)

  return (
    <section className="mb-5 rounded-xl border border-border bg-surface" aria-label="정합성 지표">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3">
        {/* 부제를 안 단다 (2026-09-14, 사람 지시). *"문서끼리 가리키는 ID 가 맞는지 검사한
            결과"* 라고 적었었는데, 카드가 셋이 되면서 **틀린 말이 됐다** — 오른쪽 카드는
            "정의만 해 놓고 안 쓴 것"이라 ID 가 맞는지와 다른 질문이다. 그리고 카드마다
            질문이 제목으로 붙어 있어 한 줄 요약이 할 일이 없다. */}
        <h2 className="text-sm font-semibold text-ink">정합성</h2>
        {/* 이 숫자는 자동으로 갱신되지 않는다 — 문서를 올려도 안 바뀌고 정합성 저장소가
            손으로 돌려야 새 값이 온다. 시각이 안 보이면 낡은 숫자가 현재값으로 읽히므로
            "자동 갱신 안 됨" 을 말로도 적는다. */}
        <p className="text-xs text-ink-muted">
          <span className="text-ink">{snapshot.measuredLabel} 측정</span>
          {snapshot.agoLabel && ` · ${snapshot.agoLabel}`} · 요구사항 {snapshot.reqVer} · 자동 갱신
          안 됨
        </p>
      </div>

      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,12rem)_minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* 히어로 + 등급 내역. findings 목록을 여는 자리이기도 하다. */}
        <section className="flex min-w-0 flex-col rounded-lg border border-border bg-canvas p-3">
          <h3 className="text-xs font-semibold text-ink">검사가 찾은 것</h3>
          {/* 히어로에는 tabular-nums 를 쓰지 않는다 — 큰 글자에서 자간이 벌어진다. */}
          <p className="mt-0.5 text-5xl font-semibold leading-none text-ink">
            {snapshot.findings.length}
          </p>
          <dl className="mb-3 mt-3 grid gap-1 text-xs">
            {counts.map((entry) => (
              <div key={entry.level} className="flex items-baseline justify-between gap-2">
                <dt className="text-ink-muted">{levelLabel(entry.level)}</dt>
                <dd className="tabular-nums text-ink">{entry.count}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="mt-auto flex items-center justify-center gap-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink-muted hover:bg-accent-soft hover:text-ink"
          >
            {open ? '목록 닫기' : '목록 보기'}
            <ChevronDown className={`h-3.5 w-3.5 ${open ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        </section>

        <Card title="문서 사이 연결">
          <p className="text-xs text-ink-muted">적어 놓은 ID 가 실제로 있나</p>
          {groups.total && <MeterRow view={groups.total} label="전체" gapNoun="없음" strong />}
          {groups.reference.length > 0 && (
            <div className="grid gap-2 border-t border-border pt-2.5">
              {groups.reference.map((view) => (
                <MeterRow key={view.key} view={view} gapNoun="없음" />
              ))}
            </div>
          )}
          {groups.triangle && (
            <div className="border-t border-border pt-2.5" title="양 끝이 다 적혀 있는 쌍만 셉니다">
              <MeterRow view={groups.triangle} gapNoun="곳" />
            </div>
          )}
        </Card>

        {/* 가운데 카드(`문서 사이 연결`)와 같은 화살표를 **반대로** 센다 — 저쪽은 가리킨
            것이 실제로 있나(틀린 것), 여기는 앞 문서에 있는 것이 뒤 문서에 왔나(빠진 것). */}
        <Card title="미반영 항목">
          {/* 두 REQ 축은 반드시 나란히. 25개만 보이면 오해다 — 그중 12건은 관리자·비기능이라
              화면설계서가 있을 수 없고 5건은 신규다. 좁은 분모를 바로 아래 들여쓰기로 붙여
              "같은 것을 다르게 센 값"임이 보이게 한다. */}
          {groups.coverage.reqNarrow && (
            <MeterRow view={groups.coverage.reqNarrow} gapNoun="아직 안 나옴" strong />
          )}
          {groups.coverage.reqWide && (
            <MeterRow view={groups.coverage.reqWide} gapNoun="아직 안 나옴" showPercent indent />
          )}
          {groups.coverage.scr && (
            <div className="border-t border-border pt-2.5">
              <MeterRow view={groups.coverage.scr} gapNoun="아직 안 나옴" strong />
            </div>
          )}
          {groups.others.length > 0 && (
            <div className="grid gap-2 border-t border-border pt-2.5">
              {/* 축 계약에 없는 것. 모르는 채로라도 띄운다 — 조용히 빠지는 것이 가장 나쁘다. */}
              {groups.others.map((view) => (
                <MeterRow key={view.key} view={view} gapNoun="남음" />
              ))}
            </div>
          )}
          {groups.scrFuncCoverage.length > 0 && (
            <div className="border-t border-border pt-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h3 className="text-xs font-semibold text-ink">화면설계서의 기능이 기능명세서에 옮겨졌나</h3>
                <p className="text-xs text-ink-muted">
                  문서 {groups.scrFuncCoverage.length}개 · 검사한 항목 {groups.scrFuncCoverage.reduce((sum, view) => sum + view.total, 0)}개
                </p>
                <button
                  type="button"
                  onClick={() => setDocsOpen(!docsOpen)}
                  aria-expanded={docsOpen}
                  className="ml-auto flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink-muted hover:bg-accent-soft hover:text-ink"
                >
                  {docsOpen ? '문서별 접기' : '문서별 보기'}
                  <ChevronDown className={`h-3.5 w-3.5 ${docsOpen ? 'rotate-180' : ''}`} aria-hidden />
                </button>
              </div>
              {docsOpen && (
                <div className="mt-3 grid gap-2.5">
                  {groups.scrFuncCoverage.map((view) => (
                    <MeterRow key={view.key} view={view} gapNoun="아직 안 나옴" />
                  ))}
                  <p className="text-xs text-ink-subtle">
                    낮다고 틀린 것이 아닙니다 — 문서마다 기능을 적는 방식이 다릅니다
                  </p>
            </div>
          )}
            </div>
          )}
        </Card>
      </div>

      {open && (
        <div className="border-t border-border">
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <FilterSelect
              label="등급"
              value={filter.level}
              options={facets.levels}
              onChange={(level) => setRaw({ ...filter, level })}
            />
            <FilterSelect
              label="검사"
              value={filter.check}
              options={facets.checks}
              onChange={(check) => setRaw({ ...filter, check })}
            />
            <FilterSelect
              label="문서"
              value={filter.doc}
              options={facets.docs}
              onChange={(doc) => setRaw({ ...filter, doc })}
            />
            <span className="text-xs text-ink-muted">
              <span className="tabular-nums text-ink">{shown.length}</span>건
            </span>
          </div>

          {/* 149행이라 높이를 묶는다. 페이지 전체가 늘어나면 문서 목록이 화면 밖으로 밀린다. */}
          <div className="max-h-96 overflow-y-auto border-t border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface text-left text-xs text-ink-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="px-4 py-2 font-medium">등급</th>
                  <th scope="col" className="px-4 py-2 font-medium">검사</th>
                  <th scope="col" className="px-4 py-2 font-medium">문서</th>
                  <th scope="col" className="px-4 py-2 font-medium">위치</th>
                  <th scope="col" className="px-4 py-2 font-medium">내용</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((finding) => (
                  <tr key={finding.id} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-ink-muted">
                      {levelLabel(finding.level)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-ink-muted">{finding.check}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-ink">{finding.doc}</td>
                    {/* `SCR-COM-001@블록1` 처럼 문서 안 위치라 그대로 보여준다. */}
                    <td className="whitespace-nowrap px-4 py-2 text-ink-muted">
                      {finding.where ?? finding.refId ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-ink">{finding.message}</td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-muted">
                      조건에 맞는 항목이 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border px-4 py-2.5 text-xs text-ink-muted">
            <span>측정에 쓴 문서 {docs.length}건</span>
            {docs.map((doc) =>
              // 문서는 하드 삭제되므로 없으면 링크를 뺀다. 행까지 감추면 측정이 이
              // 문서를 봤다는 사실이 사라진다.
              doc.linkable ? (
                <Link
                  key={doc.key}
                  href={`/documents/${doc.dmsId}`}
                  className="text-ink hover:underline"
                >
                  {doc.key} {doc.ver}
                </Link>
              ) : (
                <span key={doc.key} className="text-ink-subtle">
                  {doc.key} {doc.ver}
                </span>
              ),
            )}
          </div>
        </div>
      )}
    </section>
  )
}
