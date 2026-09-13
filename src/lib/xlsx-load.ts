/**
 * xlsx 를 ExcelJS 로 연다 — 실패하면 네임스페이스 접두사를 걷고 한 번 더.
 *
 * .NET OpenXML SDK 계열 도구가 쓴 파일은 `<x:workbook><x:sheets>` 처럼 접두사를 단다.
 * XML 로는 `<workbook>` 과 같은 뜻인데 ExcelJS 4.4.0 은 태그 이름을 글자 그대로 비교해서
 * 시트 목록을 못 찾고 `reading 'sheets'` 로 죽는다(`exceljs/lib/xlsx/xlsx.js:323`).
 * 2026-09-14 운영 xlsx 19건 중 3건이 이 모양이었다(전부 같은 작성자).
 *
 * 정상 파일은 첫 시도에서 끝나므로 zip 을 다시 풀지 않는다 — 폴백은 실패한 파일에만 돈다.
 * JSZip 도 그때만 불러온다: 화면 미리보기가 이 모듈을 쓰는데 첫 번들을 늘리지 않으려고.
 * MCP(`mcp/xlsx-text.ts`)와 화면(`spreadsheet-preview.tsx`)이 같이 쓴다 — 한쪽만 고치면
 * "MCP 로는 읽히는데 화면으로는 안 열린다"가 된다.
 */

const SPREADSHEET_MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

type XlsxLoadable = { xlsx: { load(data: ArrayBuffer): Promise<unknown> } }

/** `xl/workbook.xml` 루트가 spreadsheetml 네임스페이스에 붙인 접두사. 없으면 null. */
export function spreadsheetPrefix(workbookXml: string): string | null {
  const root = workbookXml.match(/<([A-Za-z_][\w.-]*):workbook\b([^>]*)>/)
  if (!root) return null
  const [, prefix, attrs] = root
  const declared = attrs.match(new RegExp(`\\sxmlns:${escapeRegExp(prefix)}=["']([^"']*)["']`))
  return declared?.[1] === SPREADSHEET_MAIN_NS ? prefix : null
}

/**
 * 그 접두사 하나만 걷는다. `r:id` 같은 다른 접두사는 건드리지 않는다.
 * 선언(`xmlns:x="…"`)은 지운다 — 기본 네임스페이스로 바꾸면 이미 `xmlns="…"` 가 있는
 * 파트에서 속성이 겹친다. ExcelJS 는 네임스페이스를 보지 않고 태그 이름만 본다.
 */
export function stripSpreadsheetPrefix(xml: string, prefix: string): string {
  const p = escapeRegExp(prefix)
  return xml
    .replace(new RegExp(`<(/?)${p}:`, 'g'), '<$1')
    .replace(new RegExp(`\\sxmlns:${p}=(?:"[^"]*"|'[^']*')`, 'g'), '')
}

/** 접두사를 쓰는 xlsx 면 걷어서 다시 묶은 바이트, 아니면(또는 zip 이 아니면) null. */
export async function unprefixXlsx(data: ArrayBuffer): Promise<ArrayBuffer | null> {
  const mod = await import('jszip')
  const JSZip = mod.default ?? mod
  let zip: InstanceType<typeof JSZip>
  try {
    zip = await JSZip.loadAsync(data)
  } catch {
    return null
  }

  const workbook = zip.file('xl/workbook.xml')
  if (!workbook) return null
  const prefix = spreadsheetPrefix(await workbook.async('string'))
  if (!prefix) return null

  const parts = Object.values(zip.files).filter((f) => !f.dir && f.name.endsWith('.xml'))
  for (const part of parts) {
    const xml = await part.async('string')
    if (xml.includes(`<${prefix}:`)) zip.file(part.name, stripSpreadsheetPrefix(xml, prefix))
  }
  return zip.generateAsync({ type: 'arraybuffer' })
}

/**
 * `createWorkbook` 으로 만든 워크북에 싣는다. 폴백은 새 워크북에 싣는다 — 실패한
 * 워크북은 반쯤 채워져 있을 수 있다. 폴백도 못 고치는 파일이면 **첫 오류**를 던진다.
 */
export async function loadXlsx<W extends XlsxLoadable>(createWorkbook: () => W, data: ArrayBuffer): Promise<W> {
  const first = createWorkbook()
  try {
    await first.xlsx.load(data)
    return first
  } catch (error) {
    const fixed = await unprefixXlsx(data)
    if (!fixed) throw error
    const second = createWorkbook()
    try {
      await second.xlsx.load(fixed)
    } catch {
      // 원인은 원본 파일에 있다 — 되묶은 사본의 오류는 사용자에게 엉뚱한 이유를 보인다.
      throw error
    }
    return second
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
