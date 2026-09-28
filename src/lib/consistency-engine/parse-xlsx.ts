import ExcelJS from 'exceljs'
import { loadXlsx } from '@/lib/xlsx-load'
import { parseA1 } from '@/lib/xlsx-view'
import { DOMAIN_ALIAS, findAbbr, idFields, splitIds } from './ids'
import type { ParsedXlsx, Unresolved, XlsxEntry } from './types'

export const FN_SHEET = '기능 목록'
export const REQ_SHEET = '요구사항'
export const REV_SHEET = '제.개정내역'
// 요구사항정의서 v0.6(2026-09-13)에 생긴 열. 이전 판에는 없다 — 없으면 그냥 안 읽는다.
export const REQ_SCR_COL = '관련 화면 ID'
export const REQ_NAME_COL = '요구사항명'
export const REQ_DETAIL_COL = '세부내용'

type Grid = unknown[][]

/**
 * openpyxl `data_only=True` 가 주는 값으로 맞춘다. 수식은 저장된 결과, 서식 있는
 * 텍스트는 이어 붙인 문자열이다. 날짜는 Date 그대로 둔다(ID 가 들어 있을 수 없다).
 */
function cellValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    if ('result' in v || 'formula' in v || 'sharedFormula' in v) return cellValue(v.result)
    if (Array.isArray(v.richText)) {
      return v.richText.map((run) => String((run as { text?: unknown }).text ?? '')).join('')
    }
    if ('text' in v) return cellValue(v.text)
    if ('error' in v) return String(v.error)
    return null
  }
  return value
}

/** 병합 셀 forward-fill 된 2차원 값 배열. 행·열 번호는 0-기반 (`ws_grid`) */
export function wsGrid(ws: ExcelJS.Worksheet): Grid {
  const merges = ((ws.model as { merges?: string[] }).merges ?? []).map((range) => {
    const [from, to = from] = range.split(':')
    return { from: parseA1(from), to: parseA1(to) }
  })
  let maxRow = ws.rowCount
  let maxCol = 0
  ws.eachRow({ includeEmpty: true }, (row) => {
    maxCol = Math.max(maxCol, row.cellCount)
  })
  for (const m of merges) {
    maxRow = Math.max(maxRow, m.to.row)
    maxCol = Math.max(maxCol, m.to.col)
  }
  const grid: Grid = []
  for (let r = 1; r <= maxRow; r++) {
    const row = ws.getRow(r)
    const cells: unknown[] = []
    for (let c = 1; c <= maxCol; c++) cells.push(cellValue(row.getCell(c).value))
    grid.push(cells)
  }
  for (const m of merges) {
    const v = grid[m.from.row - 1]?.[m.from.col - 1] ?? null
    for (let r = m.from.row; r <= m.to.row; r++) {
      for (let c = m.from.col; c <= m.to.col; c++) grid[r - 1][c - 1] = v
    }
  }
  return grid
}

const headerText = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())

/** 위 10행 안에서 필수 열 이름이 **정확히 일치**하는 첫 행 */
export function findHeader(grid: Grid, must: string[]): { index: number; headers: string[] } | null {
  for (let i = 0; i < Math.min(10, grid.length); i++) {
    const cells = grid[i].map(headerText)
    if (must.every((m) => cells.includes(m))) return { index: i, headers: cells }
  }
  return null
}

function sheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const ws = wb.getWorksheet(name)
  if (!ws) throw new Error(`시트 '${name}' 없음`)
  return ws
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort()
}

export async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return loadXlsx(() => new ExcelJS.Workbook(), data)
}

export function parseXlsx(wb: ExcelJS.Workbook, key: string): ParsedXlsx {
  const entries = new Map<string, XlsxEntry>()
  const refs: Record<string, string[]> = {}
  const unresolved: Unresolved[] = []
  const pushRef = (kind: string, id: string) => (refs[kind] ??= []).push(id)

  // 기준 REQ 표기(D-041): 제.개정내역!B1
  let baseReqCell: string | null = null
  const rev = wb.getWorksheet(REV_SHEET)
  if (rev) {
    const v = cellValue(rev.getCell('B1').value)
    baseReqCell = v === null ? null : String(v)
  }

  if (key === 'REQ') {
    const grid = wsGrid(sheet(wb, REQ_SHEET))
    const header = findHeader(grid, ['요구사항번호'])
    if (!header) throw new Error('요구사항 시트 헤더(요구사항번호) 없음')
    const idc = header.headers.indexOf('요구사항번호')
    const cScr = header.headers.indexOf(REQ_SCR_COL)
    // 패널이 이름·세부내용을 보이고, 세 화살표가 "관련 화면 ID = 해당 없음" 을 분모에서 뺀다(`arrows.ts`).
    // **`요구사항명` 머리글이 두 번 있다** — 앞은 대분류("공통"), 뒤가 실제 이름이라 마지막 것을 쓴다
    const cName = header.headers.lastIndexOf('요구사항명')
    const cDetail = header.headers.indexOf('세부내용')
    for (let r = header.index + 1; r < grid.length; r++) {
      const row = grid[r]
      const ids = splitIds(row[idc])
      if (!ids.length) continue
      const scrIds = cScr >= 0 ? splitIds(row[cScr]) : []
      for (const i of ids) {
        const existing = entries.get(i)
        if (existing) {
          ;(existing.dupRows ??= []).push(r + 1)
        } else {
          const cells: Record<string, unknown> = {}
          if (cName >= 0) cells[REQ_NAME_COL] = row[cName]
          if (cDetail >= 0) cells[REQ_DETAIL_COL] = row[cDetail]
          if (cScr >= 0) cells[REQ_SCR_COL] = row[cScr]
          entries.set(i, { row: r + 1, cells, reqRefs: [], scrRefs: scrIds })
          for (const x of scrIds) pushRef('SCR', x)
        }
      }
    }
  } else {
    const grid = wsGrid(sheet(wb, FN_SHEET))
    const header = findHeader(grid, ['기능 ID'])
    if (!header) throw new Error('기능 목록 시트 헤더(기능 ID) 없음')
    const { headers } = header
    const cFn = headers.indexOf('기능 ID')
    const cReq = headers.indexOf('요구사항 ID')
    const cScr = headers.indexOf('화면 ID')
    const wantDom = key.split('-')[1]
    for (let r = header.index + 1; r < grid.length; r++) {
      const row = grid[r]
      const fnIds = splitIds(row[cFn])
      if (!fnIds.length) continue
      const reqRaw = cReq >= 0 ? row[cReq] : null
      const scrRaw = cScr >= 0 ? row[cScr] : null
      const reqIds = splitIds(reqRaw)
      const scrIds = splitIds(scrRaw)
      for (const raw of [reqRaw, scrRaw]) {
        for (const a of findAbbr(raw ? String(raw) : '')) unresolved.push({ row: r + 1, text: a })
      }
      for (const i of fnIds) {
        const dom = idFields(i).dom
        if ((DOMAIN_ALIAS[dom] ?? dom) !== wantDom) continue
        // 같은 이름의 열이 둘이면 뒤의 것이 이긴다 — 파이썬 dict 컴프리헨션과 같다
        const cells: Record<string, unknown> = {}
        headers.forEach((h, j) => {
          if (h && row[j] !== null && row[j] !== undefined) cells[h] = row[j]
          else if (h && h in cells) delete cells[h]
        })
        const existing = entries.get(i)
        if (existing) {
          ;(existing.dupRows ??= []).push(r + 1)
        } else {
          entries.set(i, { row: r + 1, cells, reqRefs: reqIds, scrRefs: scrIds })
        }
        for (const x of reqIds) pushRef('REQ', x)
        for (const x of scrIds) pushRef('SCR', x)
      }
    }
  }

  for (const k of Object.keys(refs)) refs[k] = sortedUnique(refs[k])
  return { type: 'xlsx', entries, refs, unresolved, baseReqCell }
}

/**
 * REQ 의 현재 판 라벨. **파일명에서 읽지 않는다** — SCR-PLC 파일명이 `v0.5` 인데 내용은
 * v0.2 였던 일이 있다(인계문 §5-5). `제.개정내역` 시트 `버전` 열의 가장 큰 값이다.
 * 표가 최신 행을 위에 두지만 순서에 기대지 않는다. 못 읽으면 null.
 */
export function reqVersionFromRevisions(wb: ExcelJS.Workbook): string | null {
  const ws = wb.getWorksheet(REV_SHEET)
  if (!ws) return null
  const grid = wsGrid(ws)
  const header = findHeader(grid, ['버전'])
  if (!header) return null
  const col = header.headers.indexOf('버전')
  let best: { label: string; parts: number[] } | null = null
  for (let r = header.index + 1; r < grid.length; r++) {
    const label = versionLabel(grid[r][col])
    if (!label) continue
    const parts = label.split('.').map(Number)
    if (!best || compareParts(parts, best.parts) > 0) best = { label, parts }
  }
  return best?.label ?? null
}

/**
 * 판 번호 모양(`0.6` · `v0.8.3` · 숫자 0.6)만 받는다. 글자를 지우고 남은 숫자를 쓰면 날짜 셀
 * (`Fri Jan 02 2026 …` → `0220260000…`)이나 메모(`v0.3 (2026.09.13)` → `0.32026.09.13`)가 가장 큰 판으로
 * 이기고, 20자를 넘으면 저장 스키마에 걸려 스냅샷이 통째로 버려진다(코드 리뷰 2026-09-27).
 */
function versionLabel(v: unknown): string | null {
  if (typeof v === 'number') v = String(v)
  if (typeof v !== 'string') return null
  const m = /^v?(\d{1,3}(?:\.\d{1,3}){0,3})$/i.exec(v.trim())
  return m ? m[1] : null
}

function compareParts(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}
