import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { consistencyProblem, consistencySchema } from '@/lib/consistency'
import { existsOrAlias, findAbbr, pyRepr, splitIds } from './ids'
import { runEngine, toFinding, type EngineDoc } from './index'
import { parseHtml } from './parse-html'
import { parseXlsx, reqVersionFromRevisions } from './parse-xlsx'
import { definedIdCounts, suggestDocKey } from './suggest'

// 골든 대조(golden.test.ts)는 정합성 저장소가 있는 머신에서만 돈다. 여기는 어디서나 도는 규칙 확인이다.

describe('splitIds', () => {
  it('한글에 붙은 ID 는 집지 않는다 — 파이썬 \\b 는 유니코드 단어 경계다', () => {
    expect(splitIds('화면SCR-MAN-001')).toEqual([])
    expect(splitIds('화면 SCR-MAN-001, FN-MAN-001-02')).toEqual(['SCR-MAN-001', 'FN-MAN-001-02'])
  })

  it('4단이 아니면 3단으로 물러선다', () => {
    // 파이썬도 같다(실측) — `001` 과 `-` 사이가 경계라 3단으로 잡힌다
    expect(splitIds('FN-ABC-001-012')).toEqual(['FN-ABC-001'])
    expect(splitIds('FN-ABC-001-')).toEqual(['FN-ABC-001'])
  })

  it('중복은 한 번, 순서는 유지', () => {
    expect(splitIds('SCR-B-001 SCR-AAA-002 SCR-AAA-001 SCR-AAA-002')).toEqual(['SCR-AAA-002', 'SCR-AAA-001'])
  })
})

describe('findAbbr', () => {
  it('축약 표기를 해석하지 않고 그대로 모은다', () => {
    expect(findAbbr('REQ-AIM-003 · 005 와 SCR-AIM-006~010, SCR-MYP-020/030')).toEqual([
      'REQ-AIM-003 · 005',
      'SCR-AIM-006~010',
      'SCR-MYP-020/030',
    ])
  })
})

describe('existsOrAlias', () => {
  const where = new Set(['SCR-PLC-001', 'FN-HLT-002-01'])
  it('정확 · HOS↔PLC 별칭 · 4단의 부모', () => {
    expect(existsOrAlias('SCR-PLC-001', where)).toEqual([true, 'exact'])
    expect(existsOrAlias('SCR-HOS-001', where)).toEqual([true, 'alias:SCR-PLC-001'])
    expect(existsOrAlias('FN-HLT-002', where)).toEqual([true, 'parent-of-4tier'])
    expect(existsOrAlias('FN-HLT-003', where)).toEqual([false, null])
  })
})

describe('pyRepr', () => {
  it('파이썬 repr 의 따옴표 규칙', () => {
    expect(pyRepr('뒤로가기')).toBe("'뒤로가기'")
    expect(pyRepr("it's")).toBe('"it\'s"')
    expect(pyRepr(`a'b"c`)).toBe(`'a\\'b"c'`)
  })
})

const HTML = `<!doctype html><html><head><meta name="base-req" content="REQ v0.6">
<script>var x = "SCR-XXX-001"</script><style>.a{}</style></head><body>
<h2>화면 목록</h2>
<table><tr><th>화면 ID</th><th>이름</th></tr><tr><td>SCR-TST-009</td><td>표로만 정의</td></tr></table>
<section class="frame"><div class="frame-bar">SCR-TST-001 로그인</div>
  <p>REQ-TST-001 SCR-TST-002 참조, SCR-TST-003 · 004</p>
  <table><tr><th>번호</th><th>구성요소</th><th>설명</th></tr>
    <tr><td>1</td><td>로그인 버튼</td><td>여러 줄<br>설명</td></tr></table>
</section>
<section class="frame"><div class="frame-bar">상태 화면</div></section>
<!-- SCR-TST-777 주석은 텍스트가 아니다 -->
<p>프레임 밖 SCR-TST-404</p>
</body></html>`

describe('parseHtml', () => {
  const doc = parseHtml(HTML)

  it('프레임바의 첫 ID 가 정의, 나머지는 그 블록의 참조', () => {
    expect([...doc.entries.keys()]).toEqual(['SCR-TST-001', 'SCR-TST-009'])
    expect(doc.blocks[0].refs).toEqual(['REQ-TST-001', 'SCR-TST-002', 'SCR-TST-003'])
    expect(doc.barsWithoutId).toEqual(['상태 화면'])
  })

  it('기능 정의 표를 표로 읽는다', () => {
    expect(doc.blocks[0].funcs).toEqual([['로그인 버튼', null]])
  })

  it('script·style·주석 안의 ID 는 안 집고 프레임 밖 참조는 문서 참조로 모은다', () => {
    expect(doc.refs.SCR).toEqual(['SCR-TST-002', 'SCR-TST-003', 'SCR-TST-404'])
    expect(JSON.stringify(doc)).not.toContain('SCR-XXX-001')
    expect(JSON.stringify(doc)).not.toContain('SCR-TST-777')
  })

  it('축약은 블록 것과 프레임 밖 것을 가른다', () => {
    expect(doc.unresolved).toEqual([{ block: 1, text: 'SCR-TST-003 · 004' }])
    expect(doc.baseReqMeta).toBe('REQ v0.6')
  })
})

function fnWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  const rev = wb.addWorksheet('제.개정내역')
  rev.getCell('B1').value = 'REQ v0.5'
  const ws = wb.addWorksheet('기능 목록')
  ws.addRow(['제목'])
  ws.addRow(['기능 ID', '기능명', '요구사항 ID', '화면 ID'])
  ws.addRow(['FN-TST-001-01', '로그인 버튼', 'REQ-TST-001', 'SCR-TST-001'])
  ws.addRow(['FN-TST-001-02', { richText: [{ text: '비밀번호 ' }, { text: '찾기' }] }, 'REQ-TST-001', null])
  ws.addRow(['FN-TST-001-04', '결번 뒤', null, 'SCR-TST-001'])
  ws.addRow(['FN-XYZ-001-01', '다른 도메인', null, null])
  // 병합: 요구사항 ID 가 아래 행으로 이어진다
  ws.mergeCells('C3:C4')
  return wb
}

describe('parseXlsx', () => {
  it('헤더를 찾고 병합 셀을 채우고 다른 도메인 행을 뺀다', () => {
    const doc = parseXlsx(fnWorkbook(), 'FN-TST')
    expect([...doc.entries.keys()]).toEqual(['FN-TST-001-01', 'FN-TST-001-02', 'FN-TST-001-04'])
    expect(doc.entries.get('FN-TST-001-02')?.reqRefs).toEqual(['REQ-TST-001'])
    expect(doc.entries.get('FN-TST-001-02')?.cells['기능명']).toBe('비밀번호 찾기')
    expect(doc.baseReqCell).toBe('REQ v0.5')
  })

  it('REQ 현재 판은 제.개정내역 버전 열의 가장 큰 값이다', () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('제.개정내역')
    ws.addRow([])
    ws.addRow([null, '버전', '일자'])
    ws.addRow([null, '0.9', null])
    ws.addRow([null, '0.10', null])
    ws.addRow([null, 0.2, null])
    expect(reqVersionFromRevisions(wb)).toBe('0.10')
    expect(reqVersionFromRevisions(new ExcelJS.Workbook())).toBeNull()
  })

  it('날짜 셀과 메모가 섞인 칸은 판 번호로 치지 않아야 한다 — 가장 큰 판으로 이기면 안 된다', () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('제.개정내역')
    ws.addRow([null, '버전'])
    ws.addRow([null, 'v0.8.3'])
    ws.addRow([null, new Date('2026-01-02T00:00:00Z')])
    ws.addRow([null, 'v0.3 (2026.09.13)'])
    ws.addRow([null, '0.7'])

    expect(reqVersionFromRevisions(wb)).toBe('0.8.3')
  })
})

async function xlsxBytes(wb: ExcelJS.Workbook): Promise<Uint8Array> {
  return new Uint8Array(await wb.xlsx.writeBuffer())
}

describe('runEngine', () => {
  it('저장 계약(consistencySchema)을 그대로 통과하는 페이로드를 낸다', async () => {
    const req = new ExcelJS.Workbook()
    const rev = req.addWorksheet('제.개정내역')
    rev.addRow([null, '버전'])
    rev.addRow([null, '0.6'])
    const ws = req.addWorksheet('요구사항')
    ws.addRow(['요구사항번호', '관련 화면 ID'])
    ws.addRow(['REQ-TST-001', 'SCR-TST-001'])
    ws.addRow(['REQ-TST-002', '해당 없음'])

    const docs: EngineDoc[] = [
      { key: 'REQ', fileName: 'req.xlsx', bytes: await xlsxBytes(req), dmsId: 'r', dmsVersion: 1, ver: '0.6' },
      { key: 'SCR-TST', fileName: 'scr.html', bytes: new TextEncoder().encode(HTML), dmsId: 's', dmsVersion: 2, ver: '0.1' },
      { key: 'FN-TST', fileName: 'fn.xlsx', bytes: await xlsxBytes(fnWorkbook()), dmsId: 'f', dmsVersion: 1, ver: '0.1' },
    ]
    const payload = await runEngine(docs, [{ key: 'FN-ACC', error: '휴지통에 있음' }], new Date('2026-09-27T00:00:00Z'))

    const parsed = consistencySchema.safeParse(payload)
    expect(parsed.success).toBe(true)
    expect(consistencyProblem(parsed.data!)).toBeNull()
    expect(payload.reqVer).toBe('0.6')
    expect(payload.findings).toContainEqual(
      expect.objectContaining({ level: 'error', check: '파싱', doc: 'FN-ACC', message: '휴지통에 있음' }),
    )
    // 기준 REQ 불일치 — FN 은 v0.5 를 밝혔고 REQ 는 0.6 이다
    expect(payload.findings).toContainEqual(
      expect.objectContaining({ check: '기준REQ', doc: 'FN-TST', message: '문서 기준 0.5 ≠ REQ 현재 판 0.6' }),
    )
    expect(payload.findings).toContainEqual(expect.objectContaining({ check: '결번', doc: 'FN-TST', refId: 'FN-TST-001' }))
    expect(payload.docs.map((d) => d.key)).toEqual(['REQ', 'SCR-TST', 'FN-TST'])
  })

  it('못 읽는 파일은 파싱 error 로 남기고 나머지는 잰다', async () => {
    const payload = await runEngine(
      [{ key: 'FN-TST', fileName: 'broken.xlsx', bytes: new Uint8Array([1, 2, 3]), dmsId: 'f', dmsVersion: 1, ver: '?' }],
      [],
      new Date(),
    )
    expect(payload.counts.errors).toBe(1)
    expect(payload.findings[0]).toMatchObject({ check: '파싱', doc: 'FN-TST' })
    expect(payload.reqVer).toBe('미상')
    expect(consistencySchema.safeParse(payload).success).toBe(true)
  })
})

describe('형식 검사', () => {
  it('docKey 종류와 파일 형식이 다르면 파싱 error 여야 한다 — html 로 읽혀 ID 0개가 되면 안 된다', async () => {
    const payload = await runEngine(
      [
        { key: 'REQ', fileName: '요구사항정의서.pdf', bytes: new Uint8Array([37, 80, 68, 70]), dmsId: 'r', dmsVersion: 1, ver: '?' },
        { key: 'SCR-TST', fileName: 'scr.xlsx', bytes: new Uint8Array([1]), dmsId: 's', dmsVersion: 1, ver: '?' },
      ],
      [],
      new Date(),
    )

    const parse = payload.findings.filter((f) => f.check === '파싱')
    expect(parse.map((f) => f.doc).sort()).toEqual(['REQ', 'SCR-TST'])
    expect(parse.find((f) => f.doc === 'REQ')?.message).toContain('파일 형식이 맞지 않습니다 (.xlsx 필요')
  })
})

describe('toFinding', () => {
  it('저장 상한을 넘는 메시지는 자른다 — 한 건 때문에 측정 전체가 거절되면 안 된다', () => {
    const f = toFinding({ check: '삼각불일치', doc: 'FN-X', msg: 'x'.repeat(900) }, 'warning')
    expect(f.message).toHaveLength(500)
  })
})

describe('definedIdCounts · suggestDocKey', () => {
  it('화면설계서는 프레임바·화면 목록 표에 정의된 ID 로 센다 (참조는 안 센다)', async () => {
    const counts = await definedIdCounts({ fileName: 'scr.html', bytes: new TextEncoder().encode(HTML) })
    expect(counts).toEqual([{ key: 'SCR-TST', count: 2 }])
  })

  it('기능명세서는 기능 ID 열만 센다 — 요구사항 ID 열 때문에 REQ 로 보이면 안 된다', async () => {
    const counts = await definedIdCounts({ fileName: 'fn.xlsx', bytes: await xlsxBytes(fnWorkbook()) })
    expect(counts).toEqual([
      { key: 'FN-TST', count: 3 },
      { key: 'FN-XYZ', count: 1 },
    ])
  })

  it('등록된 키일 때만 제안한다', () => {
    const counts = [{ key: 'SCR-LAN', count: 1 }]
    expect(suggestDocKey(counts, new Set(['SCR-LAN']))).toBe('SCR-LAN')
    expect(suggestDocKey(counts, new Set(['SCR-ACC']))).toBeNull()
    expect(suggestDocKey([], new Set(['SCR-ACC']))).toBeNull()
  })
})
