/**
 * xlsx → 시트별 행 텍스트. `workbookToSheetRows`·`sheetsToText` 는 ExcelJS 를 import 하지
 * 않는다 — spreadsheet-preview.tsx 의 순회(숨김 시트 제외·includeEmpty:false·병합 건너뜀)와
 * 같은 규칙을 평범한 값에 대해서만 적용해, 유닛 테스트가 exceljs 없이 돈다.
 * ExcelJS 로딩은 `parseXlsx` 안의 동적 import 하나로 가둔다.
 */
import { formatCellValue, buildMergeLayout } from '@/lib/xlsx-view'

export type SheetRows = {
  name: string
  rows: { number: number; cells: string[] }[]
}

function cellToText(value: unknown): string {
  return formatCellValue(value)
    .replace(/\t/g, ' ')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** 순수(ExcelJS 를 import 하지 않는다 — 평범한 객체 모양만 본다). spreadsheet-preview.tsx:132-168 과 같은 순회. */
export function workbookToSheetRows(workbook: unknown): SheetRows[] {
  const wb = workbook as { worksheets: unknown[] }
  const sheets: SheetRows[] = []

  for (const raw of wb.worksheets) {
    const ws = raw as {
      name: string
      state?: string
      model?: { merges?: string[] }
      eachRow: (opts: { includeEmpty: boolean }, cb: (row: unknown, n: number) => void) => void
    }
    // 작성자가 숨긴 시트(계산·룩업용)는 본문에 내지 않는다 — 미리보기와 같은 규칙.
    if (ws.state === 'hidden' || ws.state === 'veryHidden') continue

    const { covered } = buildMergeLayout(ws.model?.merges)
    const rows: SheetRows['rows'] = []

    ws.eachRow({ includeEmpty: false }, (rawRow, n) => {
      const row = rawRow as {
        eachCell: (o: { includeEmpty: boolean }, cb: (c: unknown, n: number) => void) => void
      }
      const cellMap = new Map<number, string>()
      let maxCol = 0
      row.eachCell({ includeEmpty: false }, (rawCell, c) => {
        // 병합에 덮인 셀은 빈 칸 처리 — 주인 셀 값이 비춰져도(ExcelJS MergeValue) 중복을 안 낸다.
        if (covered.has(`${n},${c}`)) return
        const cell = rawCell as { value: unknown }
        cellMap.set(c, cellToText(cell.value))
        if (c > maxCol) maxCol = c
      })
      if (maxCol === 0) return

      const cells: string[] = []
      for (let c = 1; c <= maxCol; c++) cells.push(cellMap.get(c) ?? '')
      while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()
      if (cells.length === 0) return // 모든 셀이 빈 행은 내지 않는다

      rows.push({ number: n, cells })
    })

    sheets.push({ name: ws.name, rows })
  }

  return sheets
}

/** 순수. §3-6 출력 형식 — 시트마다 `## 시트: 이름` + `행번호\t셀…` 줄, 시트 사이 빈 줄. */
export function sheetsToText(sheets: SheetRows[]): string {
  return sheets
    .map((sheet) => {
      const lines = [`## 시트: ${sheet.name}`]
      if (sheet.rows.length === 0) {
        lines.push('(빈 시트)')
      } else {
        for (const row of sheet.rows) lines.push(`${row.number}\t${row.cells.join('\t')}`)
      }
      return lines.join('\n')
    })
    .join('\n\n')
}

/** 부작용 경계. await import('exceljs') → new Workbook() → xlsx.load(Buffer.from(bytes)) → workbookToSheetRows. 실패는 throw 그대로. */
export async function parseXlsx(bytes: Uint8Array): Promise<SheetRows[]> {
  const mod = await import('exceljs')
  const ExcelJS = mod.default ?? mod
  const workbook = new ExcelJS.Workbook()
  // exceljs 의 `Buffer` 타입은 자기 모듈 안에서 새로 선언한 것이라(ArrayBuffer 구조),
  // @types/node 의 제네릭 Buffer 와 이름만 같고 안 맞는다 — 런타임은 실제 Buffer 를 받는다.
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0])
  return workbookToSheetRows(workbook)
}
