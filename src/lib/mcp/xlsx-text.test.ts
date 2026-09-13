import { describe, expect, it } from 'vitest'
import { parseXlsx, sheetsToText, workbookToSheetRows, type SheetRows } from '@/lib/mcp/xlsx-text'

// ExcelJS 없이 workbookToSheetRows 가 보는 모양(worksheets·eachRow·eachCell)만 흉내 낸다.
type FakeCells = Record<number, unknown>
function fakeSheet(
  name: string,
  rows: Record<number, FakeCells>,
  opts: { state?: string; merges?: string[] } = {},
) {
  return {
    name,
    state: opts.state ?? 'visible',
    model: { merges: opts.merges ?? [] },
    eachRow: (_o: { includeEmpty: boolean }, cb: (row: unknown, n: number) => void) => {
      for (const n of Object.keys(rows).map(Number).sort((a, b) => a - b)) {
        const cells = rows[n]
        cb(
          {
            eachCell: (_c: { includeEmpty: boolean }, cellCb: (cell: unknown, col: number) => void) => {
              for (const c of Object.keys(cells).map(Number).sort((a, b) => a - b)) {
                cellCb({ value: cells[c] }, c)
              }
            },
          },
          n,
        )
      }
    },
  }
}

describe('sheetsToText', () => {
  it('시트가 2개면 시트마다 "## 시트:" 줄과 "행번호\\t셀" 줄을 내고 시트 사이에 빈 줄을 둬야 한다 (X1)', () => {
    const sheets: SheetRows[] = [
      {
        name: '요구사항',
        rows: [
          { number: 1, cells: ['ID', '내용'] },
          { number: 3, cells: ['R-1', '', '비고'] },
        ],
      },
      { name: '이력', rows: [{ number: 2, cells: ['v1'] }] },
    ]

    expect(sheetsToText(sheets)).toBe('## 시트: 요구사항\n1\tID\t내용\n3\tR-1\t\t비고\n\n## 시트: 이력\n2\tv1')
  })

  it('행이 없는 시트면 "(빈 시트)" 를 내야 한다 (X2)', () => {
    expect(sheetsToText([{ name: '빈', rows: [] }])).toBe('## 시트: 빈\n(빈 시트)')
  })
})

describe('workbookToSheetRows — 가짜 워크북', () => {
  it('hidden·veryHidden 시트는 결과에서 빠져야 한다 (X3)', () => {
    const workbook = {
      worksheets: [
        fakeSheet('보임', { 1: { 1: 'a' } }),
        fakeSheet('숨김', { 1: { 1: 'b' } }, { state: 'hidden' }),
        fakeSheet('아주숨김', { 1: { 1: 'c' } }, { state: 'veryHidden' }),
      ],
    }

    expect(workbookToSheetRows(workbook).map((s) => s.name)).toEqual(['보임'])
  })

  it('A1:B2 병합이면 주인 값이 비춰진 B1·A2·B2 는 빈 칸이고 A1 에만 값이 있어야 한다 (X4)', () => {
    const workbook = {
      worksheets: [
        fakeSheet(
          '병합',
          {
            1: { 1: '주인', 2: '주인', 3: 'x' },
            2: { 1: '주인', 2: '주인', 3: 'y' },
          },
          { merges: ['A1:B2'] },
        ),
      ],
    }

    expect(workbookToSheetRows(workbook)).toEqual([
      {
        name: '병합',
        rows: [
          { number: 1, cells: ['주인', '', 'x'] },
          { number: 2, cells: ['', '', 'y'] },
        ],
      },
    ])
  })

  it('날짜·수식·richText 셀은 미리보기와 같은 문자열이어야 한다 (X5 formatCellValue 재사용)', () => {
    const workbook = {
      worksheets: [
        fakeSheet('값', {
          1: {
            1: new Date(Date.UTC(2026, 8, 14)),
            2: { formula: '1+2', result: 3 },
            3: { richText: [{ text: '가' }, { text: '나' }] },
          },
        }),
      ],
    }

    expect(workbookToSheetRows(workbook)[0].rows[0].cells).toEqual(['2026-09-14', '3', '가나'])
  })

  it('셀 안 탭은 공백, 줄바꿈(\\r\\n·\\r·\\n)은 두 글자 \\n 이어야 한다 (X6)', () => {
    const workbook = {
      worksheets: [fakeSheet('줄', { 1: { 1: 'a\tb', 2: '줄1\r\n줄2', 3: '가\n나\r다' } })],
    }

    expect(workbookToSheetRows(workbook)[0].rows[0].cells).toEqual(['a b', '줄1\\n줄2', '가\\n나\\n다'])
  })

  it('끝의 빈 셀은 자르고 중간 빈 열은 자리를 지키며 전부 빈 행은 내지 않아야 한다 (X7)', () => {
    const workbook = {
      worksheets: [
        fakeSheet('빈칸', {
          1: { 1: 'a', 3: 'c', 5: '' },
          2: { 1: '', 2: null },
          4: { 2: 'b' },
        }),
      ],
    }

    expect(workbookToSheetRows(workbook)[0].rows).toEqual([
      { number: 1, cells: ['a', '', 'c'] },
      { number: 4, cells: ['', 'b'] },
    ])
  })
})

describe('parseXlsx — 실제 exceljs 왕복 (X8)', () => {
  it('exceljs 로 쓴 xlsx 를 읽으면 숨김 시트를 빼고 병합 덮인 칸을 비운 SheetRows 여야 한다', async () => {
    const mod = await import('exceljs')
    const ExcelJS = mod.default ?? mod
    const wb = new ExcelJS.Workbook()

    const req = wb.addWorksheet('요구사항')
    req.getCell('A1').value = '번호'
    req.getCell('B1').value = '내용'
    req.getCell('A2').value = 1
    req.getCell('B2').value = '로그인'
    req.mergeCells('A3:B3')
    req.getCell('A3').value = '병합 값'
    req.getCell('A5').value = 'x'

    const lookup = wb.addWorksheet('lookup', { state: 'hidden' })
    lookup.getCell('A1').value = '숨김'

    const history = wb.addWorksheet('이력')
    history.getCell('A1').value = 'v1'

    const buf = await wb.xlsx.writeBuffer()

    const sheets = await parseXlsx(new Uint8Array(buf))

    expect(sheets).toEqual([
      {
        name: '요구사항',
        rows: [
          { number: 1, cells: ['번호', '내용'] },
          { number: 2, cells: ['1', '로그인'] },
          { number: 3, cells: ['병합 값'] },
          { number: 5, cells: ['x'] },
        ],
      },
      { name: '이력', rows: [{ number: 1, cells: ['v1'] }] },
    ])
  })

  it('xlsx 가 아닌 바이트면 throw 해야 한다 (readDocumentContent 가 READ_PARSE_FAILED 로 바꾸는 전제)', async () => {
    await expect(parseXlsx(new TextEncoder().encode('not a zip'))).rejects.toThrow()
  })
})
