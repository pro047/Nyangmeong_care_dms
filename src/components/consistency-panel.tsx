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

/** 분자/분모와 비율을 한 덩이로. 비율만 크게 쓰지 않는다 — 37/62 를 봐야 25건이 보인다. */
function AxisCell({ view, emphasis = false }: { view: AxisView; emphasis?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-ink-muted">{view.label}</p>
      <p className={emphasis ? 'text-base font-semibold text-ink' : 'text-sm text-ink'}>
        <span className="tabular-nums">
          {view.ok}/{view.total}
        </span>
        <span className="ml-1.5 tabular-nums text-ink-muted">{formatPercent(view.percent)}</span>
      </p>
    </div>
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
 * 정합성 측정 1회를 메인 목록 위에 띄운다.
 *
 * **축 9개는 항상 펼쳐 두고 findings 만 접는다.** 접힘 상태에서 한 축만 보이면 그게
 * *"정합성 = N%"* 라는 판정이 되는데 그 판정은 팀장이 한다 — 같은 데이터로 100% ·
 * 95.76% · 59.68% · 74.00% 가 다 나온다. findings 149건은 "지금 볼 사람"만 여는 목록이라
 * 사정이 다르다.
 *
 * **신호등을 붙이지 않는다.** 빨강/초록이나 "합격" 표시가 없는 것이 사양이다. `errors 14`
 * 는 *"14개가 잘못됐다"* 가 아니라 *"14개를 사람이 봐야 한다"* 는 뜻이고, 2026-09-11 측정의
 * 14건 중 6건은 문서 결함이 아니라 저쪽 파서 한계였다. 신호등이 있었으면 빨강이었고
 * 그건 틀린 신호다.
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
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">정합성</h2>
        {/* 이 숫자는 자동으로 갱신되지 않는다 — 문서를 올려도 안 바뀌고 정합성 저장소가
            손으로 돌려야 새 값이 온다. 시각이 안 보이면 낡은 숫자가 현재값으로 읽힌다. */}
        <p className="text-sm text-ink">{snapshot.measuredLabel} 측정</p>
        <p className="text-xs text-ink-muted">
          {snapshot.agoLabel && `${snapshot.agoLabel} · `}요구사항 {snapshot.reqVer} · 문서{' '}
          {docs.length}건
        </p>
      </div>

      <div className="grid gap-4 px-4 py-3 md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
        {groups.total && (
          <div className="md:border-r md:border-border md:pr-4">
            <AxisCell view={groups.total} emphasis />
          </div>
        )}

        <div className="grid gap-3">
          {groups.reference.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-ink-muted">참조</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
                {groups.reference.map((view) => (
                  <AxisCell key={view.key} view={view} />
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-medium text-ink-muted">커버리지</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {/* 두 REQ 축은 반드시 나란히. 59.68% 만 보이면 오해다 — 빠진 25건 중 12건은
                  관리자·비기능이라 화면설계서가 있을 수 없고 5건은 신규다. */}
              {groups.coverage.reqNarrow && <AxisCell view={groups.coverage.reqNarrow} />}
              {groups.coverage.reqWide && <AxisCell view={groups.coverage.reqWide} />}
              {groups.coverage.scr && <AxisCell view={groups.coverage.scr} />}
            </div>
          </div>

          {groups.others.length > 0 && (
            <div>
              {/* 축 계약에 없는 것. 모르는 채로라도 띄운다 — 조용히 빠지는 것이 가장 나쁘다. */}
              <p className="mb-1 text-xs font-medium text-ink-muted">그 밖의 축</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                {groups.others.map((view) => (
                  <AxisCell key={view.key} view={view} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5">
        <p className="text-xs text-ink-muted">
          {counts.map((entry, i) => (
            <span key={entry.level}>
              {i > 0 && <span className="mx-1.5 text-ink-subtle">·</span>}
              {levelLabel(entry.level)} <span className="tabular-nums text-ink">{entry.count}</span>
            </span>
          ))}
        </p>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-accent-soft hover:text-ink"
        >
          {snapshot.findings.length}건 {open ? '접기' : '보기'}
          <ChevronDown className={`h-3.5 w-3.5 ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
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
            <span>측정에 쓴 문서</span>
            {docs.map((doc) =>
              // 문서는 하드 삭제되므로 없으면 링크를 뺀다. 행까지 감추면 측정이 이
              // 문서를 봤다는 사실이 사라진다.
              doc.linkable ? (
                <Link key={doc.key} href={`/documents/${doc.dmsId}`} className="text-ink hover:underline">
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
