import { DOMAIN_ALIAS, splitIds } from './ids'
import { parseHtml } from './parse-html'
import { FN_SHEET, REQ_SHEET, findHeader, loadWorkbook, wsGrid } from './parse-xlsx'

/**
 * 문서 본문에 **정의된** ID 를 docKey 별로 센다 — 관리자에게 "이 문서는 무슨 키인가" 를
 * 제안하는 근거다. 파일명은 안 본다(2026-09-10 에 파일명으로 세 번 틀렸다).
 *
 * 정의만 센다. 참조까지 세면 기능명세서는 `요구사항 ID` 열 때문에 전부 REQ 로 보인다.
 * 여러 도메인을 한 파일에 모은 통합본(`04_기능명세서_v0.1` — FN-AIM 91 · FN-COM 60 …)은
 * 다수결이 틀리므로 **개수를 같이 보여 사람이 알아보게** 한다. 판정은 사람이 한다.
 */

export type DocKeyCount = { key: string; count: number }

const keyOf = (id: string) => {
  const [kind, dom] = id.split('-')
  return kind === 'REQ' ? 'REQ' : `${kind}-${DOMAIN_ALIAS[dom] ?? dom}`
}

function tally(ids: string[]): DocKeyCount[] {
  const count = new Map<string, number>()
  for (const id of ids) count.set(keyOf(id), (count.get(keyOf(id)) ?? 0) + 1)
  return [...count].map(([key, n]) => ({ key, count: n })).sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1))
}

export async function definedIdCounts(doc: { fileName: string; bytes: Uint8Array }): Promise<DocKeyCount[]> {
  if (!doc.fileName.toLowerCase().endsWith('.xlsx')) {
    return tally([...parseHtml(new TextDecoder('utf-8').decode(doc.bytes)).entries.keys()])
  }
  const wb = await loadWorkbook(doc.bytes)
  const ids: string[] = []
  for (const [sheet, column] of [
    [REQ_SHEET, '요구사항번호'],
    [FN_SHEET, '기능 ID'],
  ]) {
    const ws = wb.getWorksheet(sheet)
    if (!ws) continue
    const grid = wsGrid(ws)
    const header = findHeader(grid, [column])
    if (!header) continue
    const col = header.headers.indexOf(column)
    for (const row of grid.slice(header.index + 1)) ids.push(...splitIds(row[col]))
  }
  return tally(ids)
}

/** 가장 많이 정의된 키. 등록된 키가 아니거나 셀 게 없으면 제안하지 않는다 */
export function suggestDocKey(counts: DocKeyCount[], registered: ReadonlySet<string>): string | null {
  const top = counts[0]
  return top && registered.has(top.key) ? top.key : null
}
