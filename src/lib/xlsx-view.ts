/**
 * xlsx 셀을 화면에 그리기 위한 순수 변환들.
 *
 * ExcelJS 를 import 하지 않는다 — 여기 있는 함수는 전부 평범한 값만 받는다.
 * 그래야 유닛 테스트가 xlsx 픽스처도 925KB 번들도 없이 돌고, ExcelJS 의
 * 사설 API 가 깨져도 파손 범위가 spreadsheet-preview.tsx 한 곳에 갇힌다.
 */

/** theme 인덱스 순서로 담은 팔레트. 인덱스 의미는 THEME_SLOTS 참고. */
export type ThemePalette = string[]

/**
 * xlsx 의 `theme=` 인덱스 순서. clrScheme XML 의 등장 순서(dk1,lt1,dk2,lt2,…)와
 * 달리 앞의 두 쌍이 뒤집혀 있다 — theme0 이 배경(lt1), theme1 이 글자(dk1)다.
 * 팀 파일 실측으로 확인: theme0 채우기 20셀이 전부 흰 배경, theme1 글꼴 2433셀이 검정.
 */
const THEME_SLOTS = [
  'lt1', 'dk1', 'lt2', 'dk2',
  'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
  'hlink', 'folHlink',
] as const

/**
 * Office 2013+ 기본 팔레트. `workbook._themes` 는 ExcelJS 의 사설 필드라
 * 타입에 없고 버전이 올라가면 조용히 사라질 수 있어서 폴백을 둔다.
 * 팀 파일 10건 중 theme 채우기를 쓰는 5건이 전부 이 팔레트였다 (2026-08-28 실측).
 */
export const DEFAULT_PALETTE: ThemePalette = [
  'FFFFFF', '000000', 'E7E6E6', '44546A',
  '5B9BD5', 'ED7D31', 'A5A5A5', 'FFC000', '4472C4', '70AD47',
  '0563C1', '954F72',
]

/** clrScheme 에서 12색을 뽑아 theme 인덱스 순으로 정렬한다. 못 읽으면 기본 팔레트. */
export function parseThemePalette(themeXml?: string): ThemePalette {
  if (!themeXml) return DEFAULT_PALETTE
  const scheme = themeXml.match(/<a:clrScheme[^>]*>([\s\S]*?)<\/a:clrScheme>/)
  if (!scheme) return DEFAULT_PALETTE

  const found = new Map<string, string>()
  const slot = /<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)>([\s\S]*?)<\/a:\1>/g
  let m: RegExpExecArray | null
  while ((m = slot.exec(scheme[1]))) {
    // dk1·lt1 은 srgbClr 대신 sysClr 로 오는 파일이 있다 (실측 10건 중 5건).
    // 그때 실제 색은 lastClr 속성에 들어 있다.
    const hex =
      m[2].match(/srgbClr\s+val="([0-9A-Fa-f]{6})"/)?.[1] ??
      m[2].match(/sysClr[^>]*lastClr="([0-9A-Fa-f]{6})"/)?.[1]
    if (hex) found.set(m[1], hex.toUpperCase())
  }
  if (found.size === 0) return DEFAULT_PALETTE
  return THEME_SLOTS.map((name, i) => found.get(name) ?? DEFAULT_PALETTE[i])
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.length === 8 ? hex.slice(2) : hex
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

function toHex(rgb: [number, number, number]): string {
  return rgb
    .map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

function hueToChannel(p: number, q: number, t: number): number {
  let x = t
  if (x < 0) x += 1
  if (x > 1) x -= 1
  if (x < 1 / 6) return p + (q - p) * 6 * x
  if (x < 1 / 2) return q
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
  return p
}

/**
 * ECMA-376 의 tint. 명도(L)만 건드린다 — 양수면 흰쪽, 음수면 검은쪽으로 민다.
 * 팀 파일에는 accent5 에 tint≈0.7999 가 56셀 붙어 있다 (연한 파란 헤더).
 */
export function applyTint(hex: string, tint?: number): string {
  if (!tint) return (hex.length === 8 ? hex.slice(2) : hex).toUpperCase()
  const [r, g, b] = hexToRgb(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }

  const l2 = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint
  if (s === 0) return toHex([l2, l2, l2])
  const q = l2 < 0.5 ? l2 * (1 + s) : l2 + s - l2 * s
  const p = 2 * l2 - q
  return toHex([hueToChannel(p, q, h + 1 / 3), hueToChannel(p, q, h), hueToChannel(p, q, h - 1 / 3)])
}

export type ExcelColor = {
  argb?: string
  theme?: number
  tint?: number
  indexed?: number
}

/**
 * 셀 색 하나를 CSS `#rrggbb` 로 바꾼다. 그릴 색이 없으면 undefined.
 *
 * 팀 파일 실측 분포 — 채우기는 argb 1450 : theme 76, 글꼴색은 theme 2433 : argb 1067,
 * 테두리는 argb 6760 : indexed64 6599. 셋 다 다뤄야 해서 한 함수로 모았다.
 */
export function resolveColor(color: ExcelColor | undefined, palette: ThemePalette): string | undefined {
  if (!color) return undefined
  if (color.theme !== undefined) {
    const base = palette[color.theme]
    return base ? `#${applyTint(base, color.tint)}` : undefined
  }
  if (color.argb) {
    // 앞 2자리는 알파다. 완전 투명이면 칠하지 않는다.
    if (color.argb.length === 8 && color.argb.slice(0, 2).toLowerCase() === '00') return undefined
    return `#${applyTint(color.argb, color.tint)}`
  }
  // indexed 는 통합문서 밖의 레거시 팔레트다. 팀 파일에 나오는 값은 64(시스템 기본)
  // 뿐이고 그건 "테마 기본색을 쓰라"는 뜻이라 칠할 색이 없다.
  return undefined
}

/**
 * Excel 열너비(기본 글꼴 '0' 문자 개수)를 px 로. Calibri 11 기준 관례식이다.
 * 팀 파일에 143.7·8.7 같은 값이 들어 있어 반올림 전에 나누지 않는다.
 */
export function columnWidthToPx(width?: number): number {
  if (!width || width <= 0) return 64
  return Math.round(width * 7 + 5)
}

/** 행 높이는 포인트로 온다. 96dpi 기준 4/3 배. */
export function rowHeightToPx(height?: number): number | undefined {
  if (!height || height <= 0) return undefined
  return Math.round((height * 4) / 3)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * ExcelJS 가 준 셀 값을 문자열로.
 *
 * 날짜는 `getUTC*` 로 읽는다 — ExcelJS 는 시리얼을 UTC 자정 Date 로 만들어 주므로
 * 로컬 게터로 읽으면 KST 에서 하루 전으로 밀린다 (DB 시각 때 밟았던 자리와 같다).
 * 서식은 재현하지 않고 전부 `YYYY-MM-DD` 로 통일한다 — 팀 파일의 날짜 서식은
 * yyyy-mm-dd·m/d/yyyy·builtin14 3종뿐이고, 미리보기에서는 표기가 갈리는 것보다
 * 한 가지로 읽히는 편이 낫다.
 */
export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    const date = `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`
    const h = value.getUTCHours()
    const min = value.getUTCMinutes()
    return h === 0 && min === 0 ? date : `${date} ${pad2(h)}:${pad2(min)}`
  }
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    // 수식 셀은 계산식이 아니라 Excel 이 저장해 둔 결과를 보여준다. 브라우저에서
    // 수식을 다시 계산하지 않으므로 result 가 없으면 보여줄 값이 없다.
    if ('result' in v) return formatCellValue(v.result)
    if ('error' in v) return String(v.error)
    if (Array.isArray(v.richText)) {
      return v.richText.map((run) => String((run as { text?: unknown }).text ?? '')).join('')
    }
    if ('text' in v) return formatCellValue(v.text)
    if ('hyperlink' in v) return String(v.hyperlink)
    return ''
  }
  return String(value)
}

/** `"C210"` → 1-기반 {row, col}. */
export function parseA1(ref: string): { row: number; col: number } {
  const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(ref.trim())
  if (!m) return { row: 0, col: 0 }
  let col = 0
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { row: Number(m[2]), col }
}

export type MergeLayout = {
  /** `"행,열"` → 왼쪽 위 셀에 붙일 span. */
  spans: Map<string, { rowSpan: number; colSpan: number }>
  /** 병합에 덮여서 아예 그리면 안 되는 셀들. */
  covered: Set<string>
}

/** `ws.model.merges` 의 `["C210:C211", …]` 를 렌더러가 쓸 수 있는 형태로. */
export function buildMergeLayout(merges: readonly string[] | undefined): MergeLayout {
  const spans = new Map<string, { rowSpan: number; colSpan: number }>()
  const covered = new Set<string>()
  for (const range of merges ?? []) {
    const [fromRef, toRef] = range.split(':')
    if (!toRef) continue
    const from = parseA1(fromRef)
    const to = parseA1(toRef)
    if (!from.row || !to.row) continue
    const rowSpan = to.row - from.row + 1
    const colSpan = to.col - from.col + 1
    if (rowSpan < 1 || colSpan < 1) continue
    spans.set(`${from.row},${from.col}`, { rowSpan, colSpan })
    for (let r = from.row; r <= to.row; r++) {
      for (let c = from.col; c <= to.col; c++) {
        if (r === from.row && c === from.col) continue
        covered.add(`${r},${c}`)
      }
    }
  }
  return { spans, covered }
}
