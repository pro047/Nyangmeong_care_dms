/** 한 문서를 파싱한 결과. `docs.py` 의 `doc` dict 와 같은 모양이다(쓰는 필드만). */

export type XlsxEntry = {
  row: number
  cells: Record<string, unknown>
  reqRefs: string[]
  scrRefs: string[]
  dupRows?: number[]
}

export type HtmlBlock = {
  n: number
  bar: string
  id: string | null
  refs: string[]
  text: string
  funcs: [name: string, fid: string | null][]
}

export type HtmlEntry = { blocks: number[] }

export type Unresolved = { row?: number; block?: number | '프레임 밖'; text: string }

export type ParsedXlsx = {
  type: 'xlsx'
  entries: Map<string, XlsxEntry>
  refs: Record<string, string[]>
  unresolved: Unresolved[]
  baseReqCell: string | null
}

export type ParsedHtml = {
  type: 'html'
  entries: Map<string, HtmlEntry>
  blocks: HtmlBlock[]
  refs: Record<string, string[]>
  unresolved: Unresolved[]
  barsWithoutId: string[]
  baseReqMeta: string | null
}

export type ParsedDoc = ParsedXlsx | ParsedHtml

/** 파싱 실패는 사유와 함께 남고 검사에서 빠진다 */
export type DocResult = { parsed: true; doc: ParsedDoc } | { parsed: false; error: string }

export type Finding = {
  check?: string
  doc: string
  id?: string
  where?: string
  msg?: string
  // 미해석 항목
  row?: number
  block?: number | '프레임 밖'
  text?: string
}
