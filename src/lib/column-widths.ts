export type TableId = 'versions' | 'trash' | 'documents'
export type Breakpoint = 'sm' | 'md' | 'lg'

type Base = {
  key: string
  label: string
  /** 라벨을 화면에 안 보이고 스크린리더에만 준다 (아이콘·버튼 열). */
  srOnly?: boolean
  /** 이 폭 미만에서 숨긴다. 셀과 <col> 이 같은 값을 써야 열 순서가 안 어긋난다. */
  hideBelow?: Breakpoint
  /** th 의 패딩·글꼴 클래스 (숨김·relative 는 컴포넌트가 붙인다). */
  thClassName: string
}
/** 폭을 저장하지 않고 남는 폭을 흡수한다 — 넓은 화면에서 저장한 px 가 좁은 화면을 밀어내지 않게. */
export type TitleColumn = Base & { kind: 'title' }
export type ResizableColumn = Base & {
  kind: 'resizable'
  defaultWidth: number
  min: number
  max: number
}
/** 아이콘 하나만 담는 열이라 조절할 이유가 없다. */
export type FixedColumn = Base & { kind: 'fixed'; width: number }
export type ColumnSpec = TitleColumn | ResizableColumn | FixedColumn

/** 키 → px. resizable 열의 키만 담는다. */
export type ColumnWidths = Readonly<Record<string, number>>

/** 제목이 나머지를 다 먹고도 이 밑으로는 안 내려가게 한다 — 파일명 구별점이 뒤에 몰려 있다. */
export const TITLE_MIN_WIDTH = 96
/** 사이드바 화살표 이동량과 같은 값. */
export const RESIZE_STEP = 16

export const COL_HIDE_CLASS: Readonly<Record<Breakpoint, string>> = {
  sm: 'hidden sm:table-column',
  md: 'hidden md:table-column',
  lg: 'hidden lg:table-column',
}
export const CELL_HIDE_CLASS: Readonly<Record<Breakpoint, string>> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
}

const PX4 = 'px-4 py-2.5 font-medium'
const PX3 = 'px-3 py-2.5 font-medium'

export const TABLE_COLUMNS: Readonly<Record<TableId, readonly ColumnSpec[]>> = {
  versions: [
    // 최소 104: "12회" + "최신" 배지 + 칸 패딩이 한 줄에 들어가야 배지가 안 잘린다.
    { key: 'round', label: '회차', kind: 'resizable', defaultWidth: 112, min: 104, max: 160, thClassName: PX4 },
    { key: 'file', label: '파일', kind: 'title', thClassName: PX4 },
    { key: 'size', label: '크기', kind: 'resizable', defaultWidth: 88, min: 56, max: 160, hideBelow: 'sm', thClassName: PX4 },
    { key: 'uploader', label: '올린 사람', kind: 'resizable', defaultWidth: 112, min: 72, max: 240, hideBelow: 'lg', thClassName: PX4 },
    { key: 'uploadedAt', label: '올린 시각', kind: 'resizable', defaultWidth: 184, min: 112, max: 240, hideBelow: 'md', thClassName: PX4 },
    { key: 'note', label: '변경 메모', kind: 'resizable', defaultWidth: 200, min: 72, max: 480, thClassName: PX4 },
    // 고정 레이아웃은 칸이 내용 따라 안 넓어진다. 패딩 24 + 아이콘 버튼 28 = 52.
    { key: 'download', label: '다운로드', kind: 'fixed', width: 52, srOnly: true, thClassName: 'px-3 py-2.5' },
  ],
  trash: [
    { key: 'title', label: '문서', kind: 'title', thClassName: PX4 },
    { key: 'size', label: '크기', kind: 'resizable', defaultWidth: 88, min: 56, max: 160, hideBelow: 'sm', thClassName: PX4 },
    { key: 'deletedAt', label: '삭제', kind: 'resizable', defaultWidth: 104, min: 80, max: 200, thClassName: PX4 },
    // 최소 200: 텍스트 버튼이 둘이라 좁히면 한국어가 글자 단위로 줄바꿈된다.
    { key: 'actions', label: '복구', kind: 'resizable', defaultWidth: 208, min: 200, max: 320, srOnly: true, thClassName: 'px-4 py-2.5' },
  ],
  documents: [
    { key: 'title', label: '문서', kind: 'title', thClassName: PX4 },
    // 숨기지 않는다(hideBelow 없음) — 이 열을 보려고 만든 화면이고, 폭이 좁아 밀어내는 것도 없다.
    { key: 'version', label: '버전', kind: 'resizable', defaultWidth: 104, min: 80, max: 200, thClassName: PX3 },
    { key: 'folder', label: '폴더', kind: 'resizable', defaultWidth: 120, min: 72, max: 280, hideBelow: 'md', thClassName: PX3 },
    { key: 'uploader', label: '올린 사람', kind: 'resizable', defaultWidth: 112, min: 72, max: 240, hideBelow: 'lg', thClassName: PX3 },
    { key: 'size', label: '크기', kind: 'resizable', defaultWidth: 80, min: 56, max: 140, hideBelow: 'sm', thClassName: PX3 },
    { key: 'updatedAt', label: '최근 업로드', kind: 'resizable', defaultWidth: 96, min: 80, max: 160, thClassName: PX3 },
    { key: 'download', label: '다운로드', kind: 'fixed', width: 52, srOnly: true, thClassName: 'px-3 py-2.5' },
    { key: 'delete', label: '삭제', kind: 'fixed', width: 52, srOnly: true, thClassName: 'px-3 py-2.5' },
  ],
}

const isResizable = (s: ColumnSpec): s is ResizableColumn => s.kind === 'resizable'

export function storageKey(table: TableId): string {
  return `dms.colWidths.${table}`
}

export function defaultWidths(specs: readonly ColumnSpec[]): ColumnWidths {
  const out: Record<string, number> = {}
  for (const s of specs) if (isResizable(s)) out[s.key] = s.defaultWidth
  return out
}

export function clampWidth(spec: ResizableColumn, px: number): number {
  if (!Number.isFinite(px)) return spec.defaultWidth
  return Math.min(spec.max, Math.max(spec.min, Math.round(px)))
}

export function parseStoredWidths(raw: string | null, specs: readonly ColumnSpec[]): ColumnWidths {
  const defaults = defaultWidths(specs)
  if (raw === null) return defaults
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return defaults
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return defaults
  const obj = parsed as Record<string, unknown>
  const out: Record<string, number> = {}
  for (const s of specs) {
    if (!isResizable(s)) continue
    const v = obj[s.key]
    out[s.key] = typeof v === 'number' && Number.isFinite(v) ? clampWidth(s, v) : s.defaultWidth
  }
  return out
}

export function serializeWidths(widths: ColumnWidths, specs: readonly ColumnSpec[]): string {
  const out: Record<string, number> = {}
  for (const s of specs) if (isResizable(s)) out[s.key] = widths[s.key] ?? s.defaultWidth
  return JSON.stringify(out)
}

export function keyboardDelta(key: string): number {
  if (key === 'ArrowLeft') return -RESIZE_STEP
  if (key === 'ArrowRight') return RESIZE_STEP
  return 0
}

export type Boundary = { afterKey: string; targetKey: string; sign: 1 | -1 }

// 제목이 남는 폭을 흡수하므로 제목 오른쪽 열은 오른쪽 끝이 아니라 왼쪽 끝이 움직인다.
// 그래서 경계가 제목의 왼쪽이냐 오른쪽이냐에 따라 움직이는 열과 방향이 갈린다.
export function resizeBoundaries(
  specs: readonly ColumnSpec[],
  visibleKeys: readonly string[],
): Boundary[] {
  const visible = specs.filter((s) => visibleKeys.includes(s.key))
  const titleIdx = visible.findIndex((s) => s.kind === 'title')
  const out: Boundary[] = []
  for (let i = 0; i < visible.length - 1; i++) {
    const left = i < titleIdx
    const target = visible[left ? i : i + 1]
    if (target.kind === 'fixed') continue
    out.push({ afterKey: visible[i].key, targetKey: target.key, sign: left ? 1 : -1 })
  }
  return out
}

export function applyBoundaryDelta(
  start: ColumnWidths,
  boundary: Boundary,
  deltaPx: number,
  specs: readonly ColumnSpec[],
  titleRoom: number,
): ColumnWidths {
  const spec = specs.find((s): s is ResizableColumn => isResizable(s) && s.key === boundary.targetKey)
  if (!spec) return { ...start }
  const from = start[spec.key]
  const upper = Math.min(spec.max, from + Math.max(0, titleRoom))
  const next = Math.round(Math.max(spec.min, Math.min(upper, from + deltaPx * boundary.sign)))
  return { ...start, [spec.key]: next }
}

export function fitWidths(
  widths: ColumnWidths,
  specs: readonly ColumnSpec[],
  visibleKeys: readonly string[],
  available: number,
): { widths: ColumnWidths; titleWidth: number | null } {
  if (!Number.isFinite(available) || available <= 0) return { widths, titleWidth: null }

  const visible = specs.filter((s) => visibleKeys.includes(s.key))
  const fixed = visible.reduce((acc, s) => acc + (s.kind === 'fixed' ? s.width : 0), 0)
  const cols = visible.filter(isResizable)
  const sum = cols.reduce((acc, s) => acc + widths[s.key], 0)
  const budget = available - TITLE_MIN_WIDTH - fixed

  const out: Record<string, number> = { ...widths }
  if (sum > budget) {
    const overflow = sum - budget
    const slack = cols.reduce((acc, s) => acc + Math.max(0, widths[s.key] - s.min), 0)
    for (const s of cols) {
      const w = widths[s.key]
      // 내림해야 줄인 뒤 합이 budget 을 넘지 않는다. min 이 정수라 내려도 min 밑으로 안 간다.
      out[s.key] =
        slack <= overflow ? Math.min(w, s.min) : Math.floor(w - (overflow * Math.max(0, w - s.min)) / slack)
    }
  }
  const fitted = cols.reduce((acc, s) => acc + out[s.key], 0)
  return { widths: out, titleWidth: Math.max(0, available - fixed - fitted) }
}
