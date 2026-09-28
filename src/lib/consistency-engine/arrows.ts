import { ARROW_AXES, ARROW_CHECKS } from '@/lib/consistency-arrow-keys'
import { DOMAIN_ALIAS, existsOrAlias, idFields } from './ids'
import { REQ_DETAIL_COL, REQ_NAME_COL, REQ_SCR_COL } from './parse-xlsx'
import type { Finding, ParsedHtml, ParsedXlsx } from './types'
import type { DocInput } from './verify'

/**
 * 정합성의 세 화살표 (2026-09-28 사람 결정) — **정본 `docs.py` 에 없는 DMS 전용 지표**다.
 *
 *   요구사항 ← 화면설계   화면설계서가 요구사항 ID 를 적는다
 *   요구사항 ← 기능명세   기능명세서 행이 요구사항 ID 를 적는다
 *   화면설계 ← 기능명세   기능명세서 행이 화면 ID 를 적는다
 *
 * 화살표 방향은 "누가 누구의 ID 를 적는가" 다. **화면설계서가 기능 ID 를 적는지는 보지 않는다** — 운영
 * 화면설계서 10개 중 6개가 기능 ID 를 아예 적지 않아(2026-09-28 실측) 그 방향으로 재면 66% 가 가짜 누락이다.
 *
 * `verify.ts`(정본 이식)와 섞지 않는다 — 골든 대조가 이 파일의 산출을 빼고 정본과 비교한다(`ARROW_AXES`·`ARROW_CHECKS`).
 */

export { ARROW_AXES, ARROW_CHECKS }

// 합쳐진 영역(HOS → PLC, `ids.ts`). ID 대조(`existsOrAlias`)와 분모 영역이 같은 별칭을 봐야 어긋나지 않는다
/** ID 든 문서 키(`SCR-ACC`)든 영역을 낸다. ID 는 파서와 같은 `idFields` 로 읽는다 */
const domainOf = (idOrKey: string) => {
  let domain: string
  try {
    domain = idFields(idOrKey).dom
  } catch {
    domain = idOrKey.split('-')[1] ?? ''
  }
  return DOMAIN_ALIAS[domain] ?? domain
}

/** "관련 화면 ID" 칸의 "화면 없음" 표기. 띄어쓰기·기호 차이를 흡수한다 — 섞인 표기("SCR-… (일부 해당 없음)")는 화면 있음 */
const NO_SCREEN = new Set(['해당없음', '없음', '-', 'N/A', 'NA'])

export type ArrowResult = {
  metrics: { axis: string; ok: number; total: number }[]
  errors: Finding[]
  warnings: Finding[]
}

/**
 * 파싱된 문서들에서 세 화살표를 잰다. 분모:
 * - 화면설계 반영률 — "관련 화면 ID = 해당 없음" 이 아닌 요구사항(작성자가 적은 칸을 믿는다). 못 읽은 화면설계서의 영역은 뺀다
 * - 기능명세 반영률 — 기능명세서가 있는 영역의 요구사항(HOS 는 PLC). 영역에 기능명세서가 없으면 영원히 빠짐이 된다
 * REQ 를 못 읽었으면 잴 수 없어 0/0 이다.
 */
export function arrows(inputs: DocInput[]): ArrowResult {
  const parsed = inputs.flatMap((input) => (input.result.parsed ? [{ key: input.key, doc: input.result.doc }] : []))
  const req = parsed.find((p) => p.key === 'REQ')?.doc
  // 요구사항정의서를 못 읽었어도 축은 0/0 으로 낸다 — 축이 빠지면 메인 안전망이 "옛 엔진 스냅샷" 으로 보고
  // 10분마다 다시 잰다. 못 읽은 사유는 `파싱` error 로 남고 패널이 그것을 보인다
  if (!req || req.type !== 'xlsx') {
    return { metrics: Object.values(ARROW_AXES).map((axis) => ({ axis, ok: 0, total: 0 })), errors: [], warnings: [] }
  }
  const scr = parsed.filter((p): p is { key: string; doc: ParsedHtml } => p.key.startsWith('SCR-') && p.doc.type === 'html')
  const fn = parsed.filter((p): p is { key: string; doc: ParsedXlsx } => p.key.startsWith('FN-') && p.doc.type === 'xlsx')

  const fnDomains = new Set(fn.map((p) => domainOf(p.key)))
  // 못 읽은 화면설계서의 영역 — 그 영역은 이번에 잴 수 없다. 분모에 두면 요구사항이 전부 "미반영", 기능명세 행이 전부
  // "없는 화면" 으로 잡혀 가짜 누락이 된다(리뷰 2026-09-28). 패널이 "측정 제외 문서" 로 따로 보인다
  const unreadableScr = new Set(
    inputs.filter((input) => input.key.startsWith('SCR-') && !input.result.parsed).map((input) => domainOf(input.key)),
  )

  const writtenInSCR = new Set<string>()
  for (const { doc } of scr) {
    for (const block of doc.blocks) block.refs.forEach((ref) => writtenInSCR.add(ref))
    Object.values(doc.refs).flat().forEach((ref) => writtenInSCR.add(ref))
  }
  const fnRows = fn.flatMap(({ key, doc }) =>
    [...doc.entries.entries()].filter(([id]) => id.startsWith('FN-')).map(([id, entry]) => ({ docKey: key, id, entry })),
  )
  const writtenInFN = new Set(fnRows.flatMap((row) => row.entry.reqRefs))
  // HOS↔PLC 표기 차이를 누락으로 세지 않는다 — 화면 ID 대조와 같은 규칙(`existsOrAlias`)
  const isIn = (written: Set<string>, id: string) => existsOrAlias(id, written)[0]

  const reqIds = [...req.entries.keys()].filter((id) => id.startsWith('REQ-'))
  const cell = (id: string, col: string) => String(req.entries.get(id)?.cells[col] ?? '').trim()
  // 작성자가 "관련 화면 ID = 해당 없음" 이라고 적은 요구사항은 화면이 없다 — 영역 이름으로 추측하지 않고 이 칸을 믿는다
  // (2026-09-28 사람 결정. 운영 19건: REQ-COM-001 · ADM 13 · NFR 5). 화면설계 반영률과 미반영 요구사항에서만 뺀다
  const needsScreen = (id: string) => !NO_SCREEN.has(cell(id, REQ_SCR_COL).replace(/\s/g, ''))
  const scrScope = reqIds.filter((id) => needsScreen(id) && !unreadableScr.has(domainOf(id)))
  const fnScope = reqIds.filter((id) => fnDomains.has(domainOf(id)))
  const notInSCR = new Set(scrScope.filter((id) => !isIn(writtenInSCR, id)))
  const notInFN = new Set(fnScope.filter((id) => !isIn(writtenInFN, id)))
  // "둘 다에 없음" = 두 화살표 목록의 교집합 — 판정을 한 곳에 둬야 히어로와 두 목록이 어긋나지 않는다
  const nowhere = [...notInSCR].filter((id) => notInFN.has(id))
  // 메시지 = 요구사항명 + 줄바꿈 + 세부내용 — 패널이 첫 줄을 목록에, 나머지를 툴팁에 쓴다. 이름 안의 줄바꿈(엑셀 Alt+Enter)은
  // 공백으로 — 안 그러면 이름이 잘려 툴팁으로 넘어간다
  const describe = (id: string) =>
    [cell(id, REQ_NAME_COL).replace(/\s*\n\s*/g, ' ') || '(이름 없음)', cell(id, REQ_DETAIL_COL)].filter(Boolean).join('\n')

  // 화면 ID 가 실제로 정의돼 있나 — 화면설계서가 정의한 ID 전부(블록·항목)
  const definedScreens = new Set(scr.flatMap(({ doc }) => [...doc.entries.keys()]))
  // 못 읽은 화면설계서만 가리키는 행은 이번에 판정할 수 없어 분모에서 뺀다
  const screenRows = fnRows.filter(
    (row) => !(row.entry.scrRefs.length > 0 && row.entry.scrRefs.every((ref) => unreadableScr.has(domainOf(ref)))),
  )
  const badRows = screenRows.flatMap((row) => {
    const refs = row.entry.scrRefs
    if (refs.length === 0) return [{ ...row, msg: '화면 ID 가 없음' }]
    const unknown = refs.filter((ref) => !existsOrAlias(ref, definedScreens)[0])
    return unknown.length ? [{ ...row, msg: `없는 화면을 가리킴: ${unknown.join(', ')}` }] : []
  })

  return {
    metrics: [
      { axis: ARROW_AXES.reqBySCR, ok: scrScope.length - notInSCR.size, total: scrScope.length },
      { axis: ARROW_AXES.reqByFN, ok: fnScope.length - notInFN.size, total: fnScope.length },
      { axis: ARROW_AXES.fnToSCR, ok: screenRows.length - badRows.length, total: screenRows.length },
    ],
    errors: nowhere.map((id) => ({
      check: ARROW_CHECKS.missingEverywhere,
      doc: 'REQ',
      id,
      msg: describe(id),
    })),
    warnings: [
      ...[...notInSCR].map((id) => ({ check: ARROW_CHECKS.notInSCR, doc: 'REQ', id, msg: describe(id) })),
      ...[...notInFN].map((id) => ({ check: ARROW_CHECKS.notInFN, doc: 'REQ', id, msg: describe(id) })),
      ...badRows.map((row) => ({
        check: ARROW_CHECKS.fnNoScreen,
        doc: row.docKey,
        id: row.id,
        where: `행 ${row.entry.row}`,
        msg: row.msg,
      })),
    ],
  }
}
