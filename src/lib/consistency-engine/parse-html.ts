import { DomUtils, parseDocument } from 'htmlparser2'
import type { AnyNode, Document, Element } from 'domhandler'
import { collapseWs, findAbbr, pyStrip, splitIds } from './ids'
import type { HtmlBlock, HtmlEntry, ParsedHtml, Unresolved } from './types'

/**
 * 화면설계서 html 을 **태그 트리로만** 읽는다. 렌더도 스크립트 실행도 없다 —
 * 결과는 ID 문자열과 숫자뿐이다(CLAUDE.md "정합성 측정도 읽는다").
 *
 * 텍스트 추출은 BeautifulSoup `get_text` 를 흉내 낸다: `script`·`style`·`template` 안과
 * 주석은 텍스트가 아니다(bs4 4.13 실측).
 */

// 프레임 안 "기능 정의" 표의 열 이름. 이름 열이 `구성요소` 인지 `기능명` 인지 문서마다 갈린다.
const FUNC_NAME_COLS = ['구성요소', '기능명']
const FUNC_ID_COL = '기능 ID'
const SCREEN_LIST_TITLE = '화면 목록'
const SCREEN_LIST_ID_COL = '화면 ID'
const NON_TEXT = new Set(['script', 'style', 'template'])

type Node = AnyNode | Document

function isElement(node: Node): node is Element {
  return DomUtils.isTag(node as AnyNode)
}

function allStrings(node: Node, out: string[] = []): string[] {
  if (node.type === 'text') {
    out.push((node as { data: string }).data)
    return out
  }
  if (isElement(node) && NON_TEXT.has(node.name)) return out
  if ('children' in node) for (const child of node.children) allStrings(child, out)
  return out
}

function getText(node: Node, sep = '', strip = false): string {
  let strings = allStrings(node)
  if (strip) strings = strings.map(pyStrip).filter((s) => s !== '')
  return strings.join(sep)
}

function findAll(node: Node, names: string[]): Element[] {
  return DomUtils.findAll((el) => names.includes(el.name), 'children' in node ? node.children : [])
}

function hasClass(el: Element, cls: string): boolean {
  return (el.attribs.class ?? '').split(/[\t\n\f\r ]+/).includes(cls)
}

function cellTexts(tr: Element): string[] {
  return findAll(tr, ['th', 'td']).map((c) => getText(c, ' ', true))
}

/** 프레임 안 기능 정의 표를 (기능명, 기능ID|null) 목록으로. 평탄화 텍스트가 아니라 `<table>` 을 읽는다 */
function parseFuncTable(sec: Node): [string, string | null][] {
  const out: [string, string | null][] = []
  for (const t of findAll(sec, ['table'])) {
    const rows = findAll(t, ['tr'])
    if (!rows.length) continue
    const head = cellTexts(rows[0])
    const nameAt = head.findIndex((h) => FUNC_NAME_COLS.includes(h))
    if (nameAt < 0) continue
    const idAt = head.indexOf(FUNC_ID_COL)
    for (const tr of rows.slice(1)) {
      const cells = cellTexts(tr)
      if (cells.length <= nameAt) continue
      const name = pyStrip(cells[nameAt])
      if (!name) continue
      const fid = idAt >= 0 && cells.length > idAt ? pyStrip(cells[idAt]) : null
      out.push([name, fid || null])
    }
  }
  return out
}

/** `화면 목록` 제목 바로 다음 표의 `화면 ID` 첫 열. 본문 언급까지 정의로 치면 죽은 참조 검사가 무력해진다 */
function parseScreenList(doc: Document): string[] {
  const out: string[] = []
  const order = DomUtils.findAll(() => true, doc.children) // 문서 순서(전위)
  order.forEach((h, index) => {
    if (h.name !== 'h2' && h.name !== 'h3') return
    if (!getText(h).includes(SCREEN_LIST_TITLE)) return
    const t = order.slice(index + 1).find((el) => el.name === 'table')
    const rows = t ? findAll(t, ['tr']) : []
    if (!rows.length) return
    const head = cellTexts(rows[0])
    if (!head.length || head[0] !== SCREEN_LIST_ID_COL) return
    for (const tr of rows.slice(1)) {
      const cells = findAll(tr, ['th', 'td'])
      if (!cells.length) continue
      for (const x of splitIds(getText(cells[0], ' ', true))) if (!out.includes(x)) out.push(x)
    }
  })
  return out
}

function sectionOf(bar: Element): Node {
  for (let p = bar.parent; p; p = p.parent) {
    if (isElement(p) && p.name === 'section') return p
  }
  return (bar.parent ?? bar) as Node
}

export function parseHtml(html: string): ParsedHtml {
  const doc = parseDocument(html)
  const entries = new Map<string, HtmlEntry>()
  const blocks: HtmlBlock[] = []
  const refs: Record<string, string[]> = {}
  const unresolved: Unresolved[] = []
  const barsWithoutId: string[] = []

  const meta = DomUtils.findOne((el) => el.name === 'meta' && el.attribs.name === 'base-req', doc.children)
  const baseReqMeta = meta?.attribs.content ?? null

  const bars = DomUtils.findAll((el) => hasClass(el, 'frame-bar'), doc.children)
  bars.forEach((bar, bi) => {
    const barText = getText(bar, ' ', true)
    const sec = sectionOf(bar)
    const blockText = getText(sec, '\n', true).replace(/[ \t]+/g, ' ')
    const idsInBar = splitIds(barText)
    const own = idsInBar[0] ?? null
    for (const a of findAbbr(blockText)) unresolved.push({ block: bi + 1, text: a })
    blocks.push({
      n: bi + 1,
      bar: barText,
      id: own,
      refs: splitIds(blockText).filter((x) => x !== own),
      text: blockText,
      funcs: parseFuncTable(sec),
    })
    if (own === null) {
      barsWithoutId.push(barText)
      return
    }
    const entry = entries.get(own) ?? { blocks: [] }
    entry.blocks.push(bi + 1)
    entries.set(own, entry)
  })

  // 화면 목록 표의 첫 열도 정의로 친다 — 프레임 없이 표로만 정의된 화면이 있다(SCR-PLC v0.4)
  for (const sid of parseScreenList(doc)) if (!entries.has(sid)) entries.set(sid, { blocks: [] })

  // 문서 전체 참조(프레임 밖 포함) + 프레임 밖 축약 표기
  const full = getText(doc, ' ')
  const inBlocks = unresolved.map((u) => collapseWs(u.text))
  for (const a of findAbbr(collapseWs(full))) {
    const at = inBlocks.indexOf(a)
    if (at >= 0) inBlocks.splice(at, 1)
    else unresolved.push({ block: '프레임 밖', text: a })
  }
  for (const x of splitIds(full)) {
    if (entries.has(x)) continue
    ;(refs[x.split('-')[0]] ??= []).push(x)
  }
  for (const k of Object.keys(refs)) refs[k] = [...new Set(refs[k])].sort()

  return { type: 'html', entries, blocks, refs, unresolved, barsWithoutId, baseReqMeta }
}
