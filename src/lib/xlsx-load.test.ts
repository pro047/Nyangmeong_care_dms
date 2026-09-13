import { describe, expect, it, vi } from 'vitest'
import { loadXlsx, spreadsheetPrefix, stripSpreadsheetPrefix, unprefixXlsx } from '@/lib/xlsx-load'
import { parseXlsx } from '@/lib/mcp/xlsx-text'

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

async function excel() {
  const mod = await import('exceljs')
  return mod.default ?? mod
}

async function sampleXlsx(): Promise<ArrayBuffer> {
  const ExcelJS = await excel()
  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet('기능 목록')
  sheet.getCell('A1').value = '기능 ID'
  sheet.getCell('B1').value = '기능명'
  sheet.getCell('A2').value = 'FN-ACC-002-01'
  sheet.getCell('B2').value = '뒤로가기'
  sheet.mergeCells('A3:B3')
  sheet.getCell('A3').value = '병합'
  wb.addWorksheet('표지').getCell('A1').value = '냥멍케어'
  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf).slice().buffer
}

// 정상 xlsx 에 운영 실패 파일과 같은 모양(`<x:workbook>` · `xmlns:x=`)을 입힌다.
async function prefixXlsx(data: ArrayBuffer): Promise<ArrayBuffer> {
  const mod = await import('jszip')
  const JSZip = mod.default ?? mod
  const zip = await JSZip.loadAsync(data)
  for (const file of Object.values(zip.files)) {
    if (file.dir || !file.name.endsWith('.xml')) continue
    const xml = await file.async('string')
    if (!xml.includes(`xmlns="${MAIN}"`)) continue
    const prefixed = xml
      .replace(/<(\/?)([A-Za-z][\w.-]*)(?=[\s/>])/g, '<$1x:$2')
      .replace(`xmlns="${MAIN}"`, `xmlns:x="${MAIN}"`)
    zip.file(file.name, prefixed)
  }
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('spreadsheetPrefix', () => {
  it('spreadsheetml 네임스페이스에 붙은 루트 접두사를 돌려줘야 한다', () => {
    const xml = `<?xml version="1.0"?><x:workbook xmlns:x="${MAIN}"><x:sheets/></x:workbook>`

    const prefix = spreadsheetPrefix(xml)

    expect(prefix).toBe('x')
  })

  it('접두사가 없거나 다른 네임스페이스의 접두사면 null 이어야 한다', () => {
    const plain = `<workbook xmlns="${MAIN}"><sheets/></workbook>`
    const other = `<y:workbook xmlns:y="urn:other"><y:sheets/></y:workbook>`

    expect(spreadsheetPrefix(plain)).toBeNull()
    expect(spreadsheetPrefix(other)).toBeNull()
  })
})

describe('stripSpreadsheetPrefix', () => {
  it('그 접두사의 태그와 선언만 걷고 다른 접두사(r:id)는 남겨야 한다', () => {
    const xml =
      `<x:workbook xmlns:x="${MAIN}" xmlns:r="urn:r">` +
      `<x:sheets><x:sheet name="표지" r:id="R1"/></x:sheets></x:workbook>`

    const stripped = stripSpreadsheetPrefix(xml, 'x')

    expect(stripped).toBe('<workbook xmlns:r="urn:r"><sheets><sheet name="표지" r:id="R1"/></sheets></workbook>')
  })
})

describe('loadXlsx — 접두사 폴백', () => {
  it('접두사를 쓴 xlsx 는 ExcelJS 가 그대로는 못 읽어야 한다 (재현 전제)', async () => {
    const ExcelJS = await excel()
    const prefixed = await prefixXlsx(await sampleXlsx())

    const loading = new ExcelJS.Workbook().xlsx.load(prefixed)

    await expect(loading).rejects.toThrow()
  })

  it('접두사를 쓴 xlsx 도 폴백으로 시트와 값을 읽어야 한다', async () => {
    const ExcelJS = await excel()
    const prefixed = await prefixXlsx(await sampleXlsx())

    const wb = await loadXlsx(() => new ExcelJS.Workbook(), prefixed)

    expect(wb.worksheets.map((s) => s.name)).toEqual(['기능 목록', '표지'])
    expect(wb.getWorksheet('기능 목록')?.getCell('B2').value).toBe('뒤로가기')
  })

  it('정상 xlsx 는 폴백 없이 워크북을 한 번만 만들어야 한다', async () => {
    const ExcelJS = await excel()
    const create = vi.fn(() => new ExcelJS.Workbook())

    await loadXlsx(create, await sampleXlsx())

    expect(create).toHaveBeenCalledTimes(1)
  })

  it('폴백으로 다시 싣다가도 실패하면 두 번째가 아니라 첫 오류를 던져야 한다', async () => {
    const prefixed = await prefixXlsx(await sampleXlsx())
    const errors = [new Error('첫 오류'), new Error('두 번째 오류')]
    const create = () => ({ xlsx: { load: async () => Promise.reject(errors.shift()) } })

    const loading = loadXlsx(create, prefixed)

    await expect(loading).rejects.toThrow('첫 오류')
  })

  it('zip 이 아니면 폴백도 포기하고 첫 오류를 던져야 한다', async () => {
    const ExcelJS = await excel()
    const notZip = new TextEncoder().encode('not a zip').slice().buffer

    const loading = loadXlsx(() => new ExcelJS.Workbook(), notZip)

    await expect(loading).rejects.toThrow()
    await expect(unprefixXlsx(notZip)).resolves.toBeNull()
  })

  it('MCP parseXlsx 도 접두사 파일을 정상 파일과 같은 행으로 읽어야 한다', async () => {
    const plain = await sampleXlsx()
    const prefixed = await prefixXlsx(plain)

    const fromPrefixed = await parseXlsx(new Uint8Array(prefixed))

    expect(fromPrefixed).toEqual(await parseXlsx(new Uint8Array(plain)))
    expect(fromPrefixed[0].rows).toContainEqual({ number: 2, cells: ['FN-ACC-002-01', '뒤로가기'] })
  })
})
