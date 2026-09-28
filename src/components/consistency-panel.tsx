'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import {
  arrowPanel,
  formatPercent,
  snapshotDocViews,
  type ArrowView,
  type MissingItem,
  type FindingRow,
  type MetricRow,
  type SnapshotDocRow,
} from '@/lib/consistency-view'
import type { RunStatus } from '@/lib/consistency-run'

export type ConsistencySnapshotView = {
  /**
   * **서버에서 만든 문자열로 받는다.** 이 컴포넌트는 클라이언트라 SSR 후 하이드레이션을
   * 하는데, 시각 포매팅을 여기서 하면 두 가지가 갈린다 — `Date.now()` 가 렌더마다 다르고,
   * `toLocaleDateString` 이 **실행 머신의 TZ**를 쓴다(운영은 UTC, 브라우저는 KST).
   * 날짜가 하루 어긋난 채 하이드레이션 불일치가 나고, 바로 옆 절대 시각과 모순된다.
   */
  measuredLabel: string
  metrics: MetricRow[]
  findings: FindingRow[]
  docs: SnapshotDocRow[]
}

/**
 * 비율 하나를 한계에 대고 보는 자리라 **미터**를 쓴다.
 *
 * **채움 색으로 심각도를 나타내지 않는다** — 결과 지표의 신호등 금지는 그대로다(색은 헤더의 실행 상태만).
 * **트랙이 배경보다 진하다.** 거의 찬 미터에서 사람이 봐야 할 것은 *남은 몇 %* 라, 트랙이 배경과 같으면
 * 그 자리가 "빈 곳"이 아니라 "카드 여백"으로 읽힌다.
 */
function Meter({ ok, total }: { ok: number; total: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border" role="img" aria-label={`${total} 중 ${ok}`}>
      <div className="h-full rounded-full bg-ink" style={{ width: `${total === 0 ? 0 : (ok / total) * 100}%` }} />
    </div>
  )
}

/**
 * ID + 이름 한 줄씩. 세부내용은 툴팁(`title`)으로만 둔다 — 길어서 목록에 넣으면 카드가 늘어나고, 툴팁은 훑어볼 수
 * 없어 이름까지는 목록에 둔다(2026-09-28 사람 결정). **이름은 자르지 않는다** — 넘치면 단어 단위로 줄을 바꾼다.
 */
function MissingList({ items }: { items: MissingItem[] }) {
  return (
    <ul className="grid gap-1 text-xs">
      {items.map((item) => (
        <li key={item.id} title={item.detail || undefined} className="flex min-w-0 gap-2">
          <span className="shrink-0 font-mono text-ink">{item.id}</span>
          <span className="min-w-0 break-keep text-ink-muted">{item.name}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * 화살표 한 줄 = 질문 · 분수 · 비율 · 막대, 펼치면 빠진 ID. 빠진 개수 문구("15개 빠짐")는 뺐다(2026-09-28 사람 지시) —
 * 분수에 이미 있고, 할 일은 펼친 목록이 말한다.
 */
function ArrowRow({ arrow }: { arrow: ArrowView }) {
  const [open, setOpen] = useState(false)
  return (
    <div data-arrow={arrow.axis}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-xs text-ink">{arrow.label}</p>
        <p className="shrink-0 text-xs">
          <span className="font-medium tabular-nums text-ink">
            {arrow.ok}/{arrow.total}
          </span>
          <span className="ml-1.5 tabular-nums text-ink-subtle">{formatPercent(arrow.percent)}</span>
        </p>
      </div>
      <div className="mt-0.5">
        <Meter ok={arrow.ok} total={arrow.total} />
      </div>
      {arrow.missing.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="mt-1.5 flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
          >
            {open ? '누락 항목 접기' : '누락 항목 보기'}
            <ChevronDown className={`h-3.5 w-3.5 ${open ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {open && (
            <div className="mt-1.5">
              <MissingList items={arrow.missing} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * 실행 상태 표시. **이 패널에서 색을 쓰는 유일한 곳이다** — 결과 지표의 신호등 금지(위 `Meter`)는 그대로고,
 * 이것은 "검사가 돌았는가" 라는 사실이라 파서 한계가 빨갛게 보일 일이 없다(2026-09-27 사람 결정).
 * `data-run-status` 는 E2E V8 이 이 영역만 신호등 검사에서 빼는 표지다.
 */
const RUN_BADGE = {
  done: { dot: 'bg-success', label: '검사 완료' },
  running: { dot: 'bg-warning motion-safe:animate-pulse', label: '검사 중' },
  failed: { dot: 'bg-danger', label: '검사 실패' },
} as const

function RunBadge({ run }: { run: RunStatus }) {
  const badge = RUN_BADGE[run.kind]
  return (
    <span data-run-status={run.kind} role="status" className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
      {/* 색만으로 말하지 않는다 — 글자가 같이 간다 */}
      <span aria-hidden className={`size-2 rounded-full ${badge.dot}`} />
      {badge.label}
    </span>
  )
}

const RUN_POLL_MS = 3000

/**
 * 검사 중일 때만 3초마다 서버 컴포넌트를 다시 그린다 — 측정이 3~8초라 새로고침을 안 하면 "검사 중" 이
 * 그대로 남는다. 상태가 바뀌면 `remainingMs` 가 null 이 되어 멈춘다.
 *
 * **상한은 서버가 준 남은 시간이다, 마운트 시각도 절대 시각도 아니다.** 마운트 기준이면 마지막 새로고침이 서버의
 * 시간 초과 판정보다 먼저 나가 "검사 중" 에 멈출 수 있고, 절대 시각을 내 시계와 비교하면 PC 시계가 어긋난 만큼
 * 틀린다. 남은 시간을 넘긴 뒤 한 번 더 그려 실패로 바뀌는 것을 받는다. 새로 그릴 때마다 남은 시간이 다시 온다.
 */
function useRefreshWhileRunning(remainingMs: number | null) {
  const router = useRouter()
  useEffect(() => {
    if (remainingMs === null) return
    const until = Date.now() + remainingMs + RUN_POLL_MS
    const timer = setInterval(() => {
      router.refresh()
      if (Date.now() > until) clearInterval(timer)
    }, RUN_POLL_MS)
    return () => clearInterval(timer)
  }, [remainingMs, router])
}

/**
 * 정합성 측정 1회를 메인 목록 위에 띄운다. **세 화살표만 본다**(2026-09-28 사람 결정) — 요구사항 ← 화면설계,
 * 요구사항 ← 기능명세, 화면설계 ← 기능명세. 화살표는 "누가 누구의 ID 를 적는가" 다.
 *
 * 이 결정이 대체한 것: "축 9개를 전부 펼친다" · "히어로는 findings 건수" · findings 목록과 필터. 433건 중 71% 가
 * 미터와 겹치거나(화면기능대응·삼각·REQ커버리지) 할 일이 없는 것(중복블록·해석 못 한 표기)이었다(2026-09-28 실측).
 * 왼쪽 카드는 **미반영 요구사항** 목록 — 화면설계·기능명세 둘 다에 없으니 설계에 전혀 반영되지 않은 것이다.
 */
export function ConsistencyPanel({
  snapshot,
  run,
  activeDocumentIds,
}: {
  snapshot: ConsistencySnapshotView
  /** 가장 최근에 시작한 측정의 상태. 숫자는 늘 마지막으로 **성공한** 측정 것이다. */
  run: RunStatus
  /** 링크를 걸 수 있는 문서. `dmsId` 에 FK 가 없어 이미 사라진 문서가 섞여 있다. */
  activeDocumentIds: ReadonlySet<string>
}) {
  useRefreshWhileRunning(run.kind === 'running' ? run.remainingMs : null)
  const panel = arrowPanel(snapshot.metrics, snapshot.findings)
  const docs = snapshotDocViews(snapshot.docs, activeDocumentIds)

  return (
    <section className="mb-5 rounded-xl border border-border bg-surface" aria-label="정합성 지표">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">정합성</h2>
        {/* 측정 시각 옆에 실행 상태 하나만 둔다 (2026-09-28, 사람 지시 — "오늘 측정"·요구사항 판을 뺐다).
            측정 시각은 계속 보인다 — 실패·검사 중일 때 아래 숫자가 **언제 것인지**가 여기서 드러난다. */}
        <p className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span className="text-ink">{snapshot.measuredLabel} 측정</span>
          <span aria-hidden>·</span>
          <RunBadge run={run} />
        </p>
        {run.kind === 'failed' && (
          <p data-run-status="failed-reason" className="w-full text-xs text-danger">
            {run.reason} — 아래 숫자는 {snapshot.measuredLabel} 측정 결과입니다
          </p>
        )}
      </div>

      {panel ? (
        <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <section className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-canvas p-3">
            <h3 className="text-xs font-semibold text-ink">미반영 요구사항</h3>
            {/* 히어로에는 tabular-nums 를 쓰지 않는다 — 큰 글자에서 자간이 벌어진다. 숫자 아래에 무엇인지 이름까지 보인다
                (2026-09-28 사람 지시) — 화면설계·기능명세 둘 다에 없는 것만 센다 */}
            <p className="text-5xl font-semibold leading-none text-ink">{panel.nowhere.length}</p>
            {panel.nowhere.length > 0 && <MissingList items={panel.nowhere} />}
          </section>
          <section className="grid min-w-0 content-start gap-4 rounded-lg border border-border bg-canvas p-3">
            {panel.arrows.map((arrow) => (
              <ArrowRow key={arrow.axis} arrow={arrow} />
            ))}
            {panel.unreadable.length > 0 && (
              // 읽지 못한 문서는 분모에서 빠져 비율을 **올린다** — 비율 바로 아래에서 같이 읽히게 둔다
              <div className="border-t border-border pt-3">
                <h3 className="text-xs font-semibold text-ink">측정 제외 문서</h3>
                <ul className="mt-1.5 grid gap-1 text-xs text-ink-muted">
                  {panel.unreadable.map((u) => (
                    <li key={u.doc}>
                      <span className="font-medium text-ink">{u.doc}</span> — {u.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      ) : (
        // 화살표가 생기기 전 스냅샷 — 빈칸을 0% 로 그리지 않는다. 메인 안전망이 곧 다시 잰다
        <p className="px-4 py-4 text-xs text-ink-muted">새 기준으로는 아직 측정하지 않았습니다 — 곧 다시 잽니다</p>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border px-4 py-2.5 text-xs text-ink-muted">
        <span>측정에 쓴 문서 {docs.length}건</span>
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
    </section>
  )
}
