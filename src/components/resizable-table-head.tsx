'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  applyBoundaryDelta,
  CELL_HIDE_CLASS,
  COL_HIDE_CLASS,
  fitWidths,
  keyboardDelta,
  parseStoredWidths,
  resizeBoundaries,
  serializeWidths,
  storageKey,
  TABLE_COLUMNS,
  TITLE_MIN_WIDTH,
  type Boundary,
  type ColumnWidths,
  type ResizableColumn,
  type TableId,
} from '@/lib/column-widths'
import { useStoredString, writeStoredString } from '@/lib/use-stored-string'

type Layout = { available: number; visibleKeys: string[] }

const sameLayout = (a: Layout | null, b: Layout) =>
  a !== null &&
  a.available === b.available &&
  a.visibleKeys.length === b.visibleKeys.length &&
  a.visibleKeys.every((k, i) => k === b.visibleKeys[i])

/**
 * 서버가 그리는 <table className="table-fixed"> 바로 아래에 둔다. colgroup 과 thead 를
 * 함께 그려야 핸들이 있는 th 와 폭을 쥔 col 이 같은 열 정의를 본다.
 */
export function ResizableTableHead({ table }: { table: TableId }) {
  const specs = TABLE_COLUMNS[table]
  const key = storageKey(table)

  const stored = useStoredString(key)
  // 드래그 중에는 pointermove 마다 렌더되므로 같은 문자열을 매번 다시 파싱하지 않는다.
  const base = useMemo(() => parseStoredWidths(stored, specs), [stored, specs])

  // 드래그 중에만 쓴다 — 손이 움직이는 동안 storage 이벤트가 끼어들어 폭이 튀면 안 된다.
  // 끝나면 null 로 돌려 저장값을 다시 따른다. 남겨 두면 그때 화면 폭에 맞춰 줄인 모든 열의
  // 폭이 굳어서, 창을 넓혀도 저장값으로 돌아오지 않는다.
  const [dragged, setDragged] = useState<ColumnWidths | null>(null)
  // 클래스에 쓰이므로 ref 가 아니라 상태다 (react-hooks/refs).
  const [dragging, setDragging] = useState(false)
  const [layout, setLayout] = useState<Layout | null>(null)
  const drag = useRef<{
    startX: number
    start: ColumnWidths
    boundary: Boundary
    titleRoom: number
  } | null>(null)
  const theadRef = useRef<HTMLTableSectionElement>(null)
  const cols = useRef<Record<string, HTMLTableColElement | null>>({})

  useEffect(() => {
    const wrapper = theadRef.current?.closest('table')?.parentElement
    if (!wrapper) return
    // 표 자체가 아니라 감싼 요소를 잰다 — 표가 넘치면 표 폭이 가용 폭보다 커져 맞춤 계산이 틀어진다.
    const observer = new ResizeObserver(() => {
      const next: Layout = {
        available: wrapper.clientWidth,
        // 셀과 col 은 같은 브레이크포인트로 숨기므로 col 의 display 가 곧 열이 보이는지다.
        visibleKeys: specs
          .filter((s) => {
            const col = cols.current[s.key]
            return col !== null && col !== undefined && getComputedStyle(col).display !== 'none'
          })
          .map((s) => s.key),
      }
      setLayout((prev) => (sameLayout(prev, next) ? prev : next))
    })
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [specs])

  const shown = layout
    ? fitWidths(dragged ?? base, specs, layout.visibleKeys, layout.available)
    : { widths: dragged ?? base, titleWidth: null }
  const titleRoom = (shown.titleWidth ?? 0) - TITLE_MIN_WIDTH
  const boundaries = layout ? resizeBoundaries(specs, layout.visibleKeys) : []

  // 바뀐 열 하나만 저장한다. 표시 값은 fitWidths 로 줄인 값이라 통째로 저장하면
  // 좁은 화면에서 한 번 끈 것만으로 나머지 열까지 좁은 값으로 굳는다.
  // 저장에 실패하면(프라이빗 모드 등) 저장값이 안 바뀌므로, 이번 세션 동안은 그 폭을 쥐고 있는다.
  const commitWidths = (targetKey: string, widths: ColumnWidths) => {
    const saved = writeStoredString(key, serializeWidths({ ...base, [targetKey]: widths[targetKey] }, specs))
    setDragged(saved ? null : widths)
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, boundary: Boundary) => {
    // 끄는 동안 포인터가 본문으로 내려가도 글자가 선택되지 않게 한다.
    e.preventDefault()
    // 포인터를 캡처하면 커서가 핸들 밖으로 나가도 move/up 이 이 요소로 온다.
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, start: shown.widths, boundary, titleRoom }
    setDragged(shown.widths)
    setDragging(true)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d === null) return
    setDragged(applyBoundaryDelta(d.start, d.boundary, e.clientX - d.startX, specs, d.titleRoom))
  }

  // 상태를 먼저 비운다 — 캡처 해제가 던지면 드래그가 끝나지 않은 채 남는다.
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    return d
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = endDrag(e)
    if (d === null) return
    const dx = e.clientX - d.startX
    // 누르기만 했으면 저장하지 않는다. 표시 값은 화면 폭에 맞춰 줄인 값이라, 좁은 화면에서
    // 클릭 한 번으로 그 줄인 폭이 저장되면 넓은 화면에서도 좁게 남는다.
    if (dx === 0) {
      setDragged(null)
      return
    }
    // 렌더 시점의 shown 이 아니라 여기서 다시 계산한다 — 마지막 pointermove 가 아직 렌더되지
    // 않았으면 shown 은 한 단계 전 폭이다.
    commitWidths(d.boundary.targetKey, applyBoundaryDelta(d.start, d.boundary, dx, specs, d.titleRoom))
  }

  // 취소된 드래그(시스템 제스처 등)는 사람이 놓은 것이 아니므로 저장하지 않는다.
  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (endDrag(e) !== null) setDragged(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, boundary: Boundary) => {
    const delta = keyboardDelta(e.key)
    if (delta === 0) return
    // 화살표로 열을 조절하는 동안 페이지가 같이 스크롤되면 안 된다.
    e.preventDefault()
    commitWidths(boundary.targetKey, applyBoundaryDelta(shown.widths, boundary, delta, specs, titleRoom))
  }

  return (
    <>
      <colgroup>
        {specs.map((s) => {
          const width =
            s.kind === 'resizable'
              ? shown.widths[s.key]
              : s.kind === 'fixed'
                ? s.width
                : (shown.titleWidth ?? undefined)
          return (
            <col
              key={s.key}
              ref={(el) => {
                cols.current[s.key] = el
              }}
              className={s.hideBelow ? COL_HIDE_CLASS[s.hideBelow] : undefined}
              style={width === undefined ? undefined : { width }}
            />
          )
        })}
      </colgroup>
      <thead ref={theadRef}>
        <tr className="border-b border-border text-left text-xs text-ink-muted">
          {specs.map((s) => {
            const boundary = boundaries.find((b) => b.afterKey === s.key)
            const target = boundary
              ? specs.find((t): t is ResizableColumn => t.kind === 'resizable' && t.key === boundary.targetKey)
              : undefined
            return (
              <th
                key={s.key}
                scope="col"
                className={`relative truncate-cell ${s.thClassName} ${
                  s.hideBelow ? CELL_HIDE_CLASS[s.hideBelow] : ''
                } ${dragging ? 'select-none' : ''}`}
              >
                {s.srOnly ? <span className="sr-only">{s.label}</span> : s.label}
                {boundary && target && (
                  // th 가 overflow:hidden 이라 경계 밖으로 빼면 잘린다 — right-0 으로 th 안에 둔다.
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`${target.label} 열 너비 조절`}
                    aria-valuenow={shown.widths[target.key]}
                    aria-valuemin={target.min}
                    aria-valuemax={target.max}
                    tabIndex={0}
                    onPointerDown={(e) => handlePointerDown(e, boundary)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onKeyDown={(e) => handleKeyDown(e, boundary)}
                    // touch-none 이 없으면 터치 드래그가 페이지 스크롤로 먹힌다.
                    // 선이 없으면 경계가 어디인지 몰라 8px 손잡이를 찾지 못한다 — 항상 보이게 둔다.
                    // 열 경계는 th 의 오른쪽 끝이므로 선도 right-0 에 붙인다.
                    className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none after:absolute after:inset-y-2.5 after:right-0 after:w-px after:bg-border hover:after:inset-y-0 hover:after:bg-border-strong focus-visible:bg-accent focus-visible:outline-none"
                  />
                )}
              </th>
            )
          })}
        </tr>
      </thead>
    </>
  )
}
