'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import {
  buildMergeLayout,
  columnWidthToPx,
  formatCellValue,
  parseThemePalette,
  resolveColor,
  rowHeightToPx,
  type ExcelColor,
  type ThemePalette,
} from '@/lib/xlsx-view'

/**
 * 한 시트를 그리는 데 필요한 것만 담은 평면 모델.
 * ExcelJS 객체를 그대로 state 에 넣지 않는다 — 렌더가 사설 API 에 매달리면
 * 라이브러리가 바뀔 때 화면 코드까지 같이 깨진다.
 */
type CellView = {
  key: string
  text: string
  rowSpan: number
  colSpan: number
  style: React.CSSProperties
}

type SheetView = {
  name: string
  colWidths: number[]
  rows: { number: number; height?: number; cells: CellView[] }[]
}

type WorkbookView = { sheets: SheetView[]; truncated: boolean; activeTab: number }

/** 실사용 격자가 이보다 크면 앞부분만 그린다. 팀 파일 최대는 2,279 (2026-08-28 실측). */
const MAX_CELLS = 50_000

/**
 * 이보다 큰 파일은 아예 받지 않는다.
 *
 * MAX_CELLS 는 **파싱이 끝난 뒤에야** 걸리므로 느려지는 것을 막지 못한다. 파싱은
 * 메인 스레드에서 돌아서 큰 파일이면 탭이 굳는다. 업로드 상한이 100MB(`s3.ts`)라
 * 그런 파일이 들어올 수 있다. 팀 파일 최대가 41KB 라 250배 여유다 (2026-08-28 실측).
 */
const MAX_BYTES = 10 * 1024 * 1024

const BORDER_STYLE: Record<string, string> = {
  thin: '1px solid',
  hair: '1px solid',
  dotted: '1px dotted',
  dashed: '1px dashed',
  medium: '2px solid',
  thick: '3px solid',
  double: '3px double',
}

const ALIGN: Record<string, React.CSSProperties['textAlign']> = {
  left: 'left',
  center: 'center',
  right: 'right',
  justify: 'justify',
}

const VALIGN: Record<string, React.CSSProperties['verticalAlign']> = {
  top: 'top',
  middle: 'middle',
  bottom: 'bottom',
}

type AnyCell = {
  value?: unknown
  font?: { bold?: boolean; italic?: boolean; underline?: unknown; size?: number; color?: ExcelColor }
  fill?: { type?: string; pattern?: string; fgColor?: ExcelColor }
  border?: Record<string, { style?: string; color?: ExcelColor } | undefined>
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean }
}

function cellStyle(cell: AnyCell, palette: ThemePalette): React.CSSProperties {
  const style: React.CSSProperties = {}

  // 채우기는 solid 만 재현한다. gradient·무늬는 팀 파일에 없고, 반쯤 재현하면
  // 원본과 다른 색이 되어 오히려 오해를 부른다.
  if (cell.fill?.type === 'pattern' && cell.fill.pattern === 'solid') {
    const bg = resolveColor(cell.fill.fgColor, palette)
    if (bg) style.background = bg
  }

  const font = cell.font
  if (font?.bold) style.fontWeight = 600
  if (font?.italic) style.fontStyle = 'italic'
  if (font?.underline) style.textDecoration = 'underline'
  // 행 높이와 같은 단위여야 한다 — pt 를 px 로 그대로 쓰면 11pt 글꼴이 11px(8.25pt)이
  // 되어, 11pt 기준으로 잡힌 행 높이 안에서 25% 작게 보인다.
  if (font?.size) style.fontSize = `${Math.round((font.size * 4) / 3)}px`
  const fg = resolveColor(font?.color, palette)
  if (fg) style.color = fg

  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const b = cell.border?.[side]
    if (!b?.style) continue
    // 테두리색의 절반이 indexed64(= 시스템 기본)라 resolveColor 가 undefined 를 준다.
    // 그때는 앱의 테두리 토큰으로 그린다 — 안 그리면 표의 격자가 통째로 사라진다.
    const color = resolveColor(b.color, palette) ?? 'var(--color-border-strong)'
    style[`border${side[0].toUpperCase()}${side.slice(1)}` as 'borderTop'] =
      `${BORDER_STYLE[b.style] ?? '1px solid'} ${color}`
  }

  const a = cell.alignment
  if (a?.horizontal && ALIGN[a.horizontal]) style.textAlign = ALIGN[a.horizontal]
  if (a?.vertical && VALIGN[a.vertical]) style.verticalAlign = VALIGN[a.vertical]
  // Excel 의 기본은 "넘치면 옆칸을 침범"인데 table 에서는 재현할 수 없다.
  // 줄바꿈으로 흘려야 글자가 잘려 사라지지 않는다.
  style.whiteSpace = a?.wrapText ? 'pre-wrap' : 'nowrap'

  return style
}

function toSheetViews(workbook: unknown): WorkbookView {
  const wb = workbook as {
    worksheets: unknown[]
    views?: { activeTab?: number }[]
    _themes?: { theme1?: string }
  }
  // _themes 는 ExcelJS 의 사설 필드다(타입에 없음). 없으면 기본 팔레트로 떨어진다.
  const palette = parseThemePalette(wb._themes?.theme1)

  const sheets: SheetView[] = []
  let truncated = false

  for (const raw of wb.worksheets) {
    const ws = raw as {
      name: string
      state?: string
      columns?: { width?: number }[]
      properties?: { defaultRowHeight?: number }
      model?: { merges?: string[] }
      eachRow: (opts: { includeEmpty: boolean }, cb: (row: unknown, n: number) => void) => void
    }
    // 작성자가 엑셀에서 숨긴 시트(계산·룩업용)는 탭에 내지 않는다.
    if (ws.state === 'hidden' || ws.state === 'veryHidden') continue
    const { spans, covered } = buildMergeLayout(ws.model?.merges)

    // rowCount·columnCount 는 값 없는 스타일 행까지 센다 (표지 시트가 4셀인데 38행).
    // 값이 든 셀로 실사용 범위를 다시 구한다.
    let maxRow = 0
    let maxCol = 0
    const collected = new Map<number, { height?: number; cells: Map<number, AnyCell> }>()
    ws.eachRow({ includeEmpty: false }, (rawRow, n) => {
      const row = rawRow as {
        height?: number
        eachCell: (o: { includeEmpty: boolean }, cb: (c: unknown, n: number) => void) => void
      }
      const cells = new Map<number, AnyCell>()
      row.eachCell({ includeEmpty: false }, (rawCell, c) => {
        const cell = rawCell as AnyCell
        const text = formatCellValue(cell.value)
        // 값도 채우기도 없는 셀은 격자만 차지한다. 범위 계산에서 뺀다.
        if (text === '' && !cell.fill && !cell.border) return
        cells.set(c, cell)
        if (text !== '' || cell.fill) {
          if (n > maxRow) maxRow = n
          if (c > maxCol) maxCol = c
        }
      })
      if (cells.size) collected.set(n, { height: row.height, cells })
    })

    if (maxRow === 0 || maxCol === 0) {
      sheets.push({ name: ws.name, colWidths: [], rows: [] })
      continue
    }
    if (maxRow * maxCol > MAX_CELLS) {
      truncated = true
      maxRow = Math.max(1, Math.floor(MAX_CELLS / maxCol))
    }

    const colWidths = Array.from({ length: maxCol }, (_, i) => columnWidthToPx(ws.columns?.[i]?.width))
    // 1..maxRow 를 빠짐없이 낸다. 빈 행을 건너뛰어 <tr> 을 압축하면 rowSpan 이
    // 어긋난다 — span 은 원본 행번호로 계산되므로, 병합 범위 안의 행이 하나라도
    // 빠지면 남는 span 이 다음 행을 침범해 셀이 통째로 오른쪽으로 밀린다.
    // 겸사겸사 Excel 과도 같아진다 — Excel 도 빈 행을 접지 않는다.
    const defaultHeight = rowHeightToPx(ws.properties?.defaultRowHeight) ?? 20
    const rows: SheetView['rows'] = []
    for (let n = 1; n <= maxRow; n++) {
      const row = collected.get(n)
      const cells: CellView[] = []
      for (let c = 1; c <= maxCol; c++) {
        const key = `${n},${c}`
        if (covered.has(key)) continue
        const cell = row?.cells.get(c)
        const span = spans.get(key)
        cells.push({
          key,
          text: cell ? formatCellValue(cell.value) : '',
          rowSpan: span?.rowSpan ?? 1,
          colSpan: span?.colSpan ?? 1,
          style: cell ? cellStyle(cell, palette) : {},
        })
      }
      // tr 의 height 는 최소 높이로 동작한다 — 내용이 더 크면 늘어나므로
      // 기본값을 줘도 줄바꿈된 셀이 눌리지 않는다.
      rows.push({ number: n, height: rowHeightToPx(row?.height) ?? defaultHeight, cells })
    }
    sheets.push({ name: ws.name, colWidths, rows })
  }

  // Excel 이 파일을 열 때 보여주는 시트로 맞춘다 — 표지가 1번이어도 작성자가
  // 요구사항 시트를 켠 채 저장했다면 그쪽이 첫 화면이어야 한다.
  const saved = wb.views?.[0]?.activeTab ?? 0
  const activeTab = saved >= 0 && saved < sheets.length ? saved : 0

  return { sheets, truncated, activeTab }
}

export function SpreadsheetPreview({
  src,
  fileName,
  sizeBytes,
  downloadHref,
}: {
  src: string
  fileName: string
  sizeBytes: number
  downloadHref: string
}) {
  const tooLarge = sizeBytes > MAX_BYTES
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | ({ status: 'ready' } & WorkbookView)
  >(() =>
    tooLarge
      ? { status: 'error', message: '파일이 너무 커서 미리보기를 만들지 않습니다. 내려받아서 여세요.' }
      : { status: 'loading' },
  )
  const [active, setActive] = useState(0)

  // src 가 바뀌면 부모가 key 로 이 컴포넌트를 갈아끼운다. 그래서 여기서 상태를
  // 되돌릴 필요가 없다 — effect 본문에서 setState 를 부르면 렌더가 한 번 더 돈다.
  useEffect(() => {
    if (tooLarge) return
    let cancelled = false

    // 925KB(gzip 252KB)라 첫 화면 번들에 넣지 않는다. 파일을 받는 동안 같이 온다.
    // fetch 는 same-origin 으로 시작하므로 S3 로 307 돼도 오리진이 강등되지 않는다
    // — 서명 URL 을 JSON 으로 받는 우회 라우트가 필요 없다 (2026-08-28 실측).
    Promise.all([import('exceljs'), fetch(src)])
      .then(async ([mod, res]) => {
        if (!res.ok) throw new Error(`파일을 받지 못했습니다 (${res.status})`)
        const ExcelJS = mod.default ?? mod
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(await res.arrayBuffer())
        if (cancelled) return
        const view = toSheetViews(workbook)
        setState({ status: 'ready', ...view })
        setActive(view.activeTab)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const why = e instanceof Error ? e.message : '알 수 없는 오류'
        setState({ status: 'error', message: `이 파일은 미리보기를 만들지 못했습니다. 내려받아서 여세요. (${why})` })
      })

    return () => {
      cancelled = true
    }
  }, [src, tooLarge])

  const sheet = state.status === 'ready' ? state.sheets[active] : undefined
  const totalWidth = useMemo(
    () => (sheet ? sheet.colWidths.reduce((a, b) => a + b, 0) : 0),
    [sheet],
  )

  if (state.status === 'loading') {
    return (
      <div className="flex h-40 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        시트를 여는 중…
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-5">
        <p className="min-w-0 text-sm text-ink-muted">{state.message}</p>
        <a
          href={downloadHref}
          className="ml-auto flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm text-ink transition-colors hover:bg-canvas"
        >
          <Download className="h-4 w-4" />
          다운로드
        </a>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {state.sheets.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-border bg-canvas px-2 pt-2">
          {state.sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActive(i)}
              className={`shrink-0 rounded-t-md px-3 py-1.5 text-xs transition-colors ${
                i === active
                  ? 'bg-surface font-medium text-ink'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {state.truncated && (
        <p className="border-b border-border bg-canvas px-4 py-2 text-xs text-ink-muted">
          시트가 너무 커서 앞부분만 보여줍니다. 전체는 내려받아서 여세요.
        </p>
      )}

      {sheet && sheet.rows.length > 0 ? (
        <div className="max-h-[70vh] overflow-auto">
          <table
            className="border-collapse text-xs text-ink"
            style={{ width: totalWidth ? `${totalWidth}px` : undefined, tableLayout: 'fixed' }}
          >
            <colgroup>
              {sheet.colWidths.map((w, i) => (
                <col key={i} style={{ width: `${w}px` }} />
              ))}
            </colgroup>
            <tbody>
              {sheet.rows.map((row) => (
                <tr key={row.number} style={row.height ? { height: `${row.height}px` } : undefined}>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.key}
                      rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                      colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                      style={{ ...cell.style, padding: '2px 4px', overflow: 'hidden' }}
                    >
                      {cell.text}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-5 text-sm text-ink-muted">{fileName} 에 표시할 내용이 없습니다.</p>
      )}
    </div>
  )
}
