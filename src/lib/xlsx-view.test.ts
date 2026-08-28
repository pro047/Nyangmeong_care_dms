import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PALETTE,
  applyTint,
  buildMergeLayout,
  columnWidthToPx,
  formatCellValue,
  parseA1,
  parseThemePalette,
  resolveColor,
  rowHeightToPx,
} from '@/lib/xlsx-view'

// 팀 파일에서 실제로 나온 두 팔레트 (2026-08-28 실측). dk1·lt1 이 sysClr 로 오는
// 파일과 srgbClr 로 오는 파일이 섞여 있어서 둘 다 픽스처로 둔다.
const THEME_2013_SYSCLR = `
<a:theme><a:themeElements><a:clrScheme name="Office">
  <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
  <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
  <a:dk2><a:srgbClr val="44546A"/></a:dk2>
  <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
  <a:accent1><a:srgbClr val="5B9BD5"/></a:accent1>
  <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
  <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
  <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
  <a:accent5><a:srgbClr val="4472C4"/></a:accent5>
  <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
  <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
  <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
</a:clrScheme></a:themeElements></a:theme>`

const THEME_2007 = THEME_2013_SYSCLR
  .replace('44546A', '1F497D').replace('E7E6E6', 'EEECE1')
  .replace('5B9BD5', '4F81BD').replace('ED7D31', 'C0504D')
  .replace('A5A5A5', '9BBB59').replace('FFC000', '8064A2')
  .replace('4472C4', '4BACC6').replace('70AD47', 'F79646')

describe('parseThemePalette', () => {
  it('theme 인덱스 순서로 담는다 — XML 순서와 달리 앞 두 쌍이 뒤집힌다', () => {
    const p = parseThemePalette(THEME_2013_SYSCLR)
    // XML 은 dk1 이 먼저 나오지만 theme0 은 lt1(배경)이다
    expect(p[0]).toBe('FFFFFF')
    expect(p[1]).toBe('000000')
    expect(p[2]).toBe('E7E6E6')
    expect(p[3]).toBe('44546A')
    expect(p[4]).toBe('5B9BD5')
    // theme8 = accent5. 팀 파일에서 실제로 쓰이는 유일한 accent 다
    expect(p[8]).toBe('4472C4')
    expect(p[9]).toBe('70AD47')
  })

  it('dk1·lt1 이 sysClr 로 와도 lastClr 에서 색을 건진다', () => {
    // srgbClr 만 찾으면 여기서 undefined 가 되어 글꼴색 2433셀이 전부 날아간다
    expect(parseThemePalette(THEME_2013_SYSCLR)[1]).toBe('000000')
  })

  it('2007 팔레트는 2013 과 다른 색을 준다 — 하드코딩하면 안 되는 이유', () => {
    expect(parseThemePalette(THEME_2007)[8]).toBe('4BACC6')
    expect(parseThemePalette(THEME_2013_SYSCLR)[8]).toBe('4472C4')
  })

  it('_themes 가 없거나 못 읽으면 기본 팔레트로 떨어진다', () => {
    // ExcelJS 의 사설 필드라 버전이 오르면 사라질 수 있다. 그때 화면이 죽으면 안 된다
    expect(parseThemePalette(undefined)).toBe(DEFAULT_PALETTE)
    expect(parseThemePalette('<a:theme/>')).toBe(DEFAULT_PALETTE)
    expect(parseThemePalette('<a:clrScheme></a:clrScheme>')).toBe(DEFAULT_PALETTE)
  })
})

describe('applyTint', () => {
  it('tint 가 없으면 색을 그대로 둔다', () => {
    expect(applyTint('5B9BD5')).toBe('5B9BD5')
    expect(applyTint('5b9bd5', 0)).toBe('5B9BD5')
  })

  it('알파가 붙은 8자리 argb 에서 앞 2자리를 떼어낸다', () => {
    expect(applyTint('FF5B9BD5')).toBe('5B9BD5')
  })

  it('양수 tint 는 흰쪽으로, 음수는 검은쪽으로 민다', () => {
    const base = '4472C4'
    const lighter = applyTint(base, 0.8)
    const darker = applyTint(base, -0.5)
    const lum = (h: string) => parseInt(h.slice(0, 2), 16) + parseInt(h.slice(2, 4), 16) + parseInt(h.slice(4, 6), 16)
    expect(lum(lighter)).toBeGreaterThan(lum(base))
    expect(lum(darker)).toBeLessThan(lum(base))
  })

  it('무채색도 색이 튀지 않는다 — 채도 0 분기', () => {
    // s === 0 일 때 hue 를 계산하면 NaN 이 나와 색이 통째로 깨진다
    expect(applyTint('808080', 0.5)).toMatch(/^[0-9A-F]{6}$/)
    expect(applyTint('000000', 0.5)).toBe('808080')
    expect(applyTint('FFFFFF', -0.5)).toBe('808080')
  })

  it('팀 파일의 실제 값 — accent5 + tint 0.7999 는 연한 파랑이 된다', () => {
    const out = applyTint('4472C4', 0.7999816888943144)
    expect(out).toMatch(/^[0-9A-F]{6}$/)
    // 원색보다 훨씬 밝고, 파란기는 남아 있어야 한다
    expect(parseInt(out.slice(4, 6), 16)).toBeGreaterThan(parseInt(out.slice(0, 2), 16))
    expect(parseInt(out.slice(0, 2), 16)).toBeGreaterThan(0x99)
  })
})

describe('resolveColor', () => {
  const palette = parseThemePalette(THEME_2013_SYSCLR)

  it('argb 를 CSS 색으로 — 채우기의 95% 가 이 경로다', () => {
    expect(resolveColor({ argb: 'FFD9E1F2' }, palette)).toBe('#D9E1F2')
  })

  it('theme 은 팔레트를 거친다', () => {
    expect(resolveColor({ theme: 1 }, palette)).toBe('#000000')
    expect(resolveColor({ theme: 0 }, palette)).toBe('#FFFFFF')
  })

  it('theme + tint 를 함께 적용한다', () => {
    expect(resolveColor({ theme: 8, tint: 0.8 }, palette)).toBe(`#${applyTint('4472C4', 0.8)}`)
  })

  it('indexed 는 칠하지 않는다 — 64 는 "시스템 기본"이라 그릴 색이 없다', () => {
    // 테두리 6599개가 여기로 온다. 검정으로 넘기면 표가 온통 검은 격자가 된다
    expect(resolveColor({ indexed: 64 }, palette)).toBeUndefined()
  })

  it('완전 투명(alpha 00)은 칠하지 않는다', () => {
    expect(resolveColor({ argb: '00FFFFFF' }, palette)).toBeUndefined()
  })

  it('색이 아예 없으면 undefined', () => {
    expect(resolveColor(undefined, palette)).toBeUndefined()
    expect(resolveColor({}, palette)).toBeUndefined()
  })

  it('팔레트 범위를 벗어난 theme 인덱스에 죽지 않는다', () => {
    expect(resolveColor({ theme: 99 }, palette)).toBeUndefined()
  })
})

describe('columnWidthToPx / rowHeightToPx', () => {
  it('Excel 열너비를 px 로 환산한다', () => {
    expect(columnWidthToPx(8.7)).toBe(66)
    expect(columnWidthToPx(143.7)).toBe(1011)
  })

  it('너비가 없으면 기본값을 준다 — 0px 열이 되면 표가 무너진다', () => {
    expect(columnWidthToPx(undefined)).toBe(64)
    expect(columnWidthToPx(0)).toBe(64)
  })

  it('행 높이는 포인트라 96dpi 로 환산하고, 없으면 브라우저에 맡긴다', () => {
    expect(rowHeightToPx(15)).toBe(20)
    expect(rowHeightToPx(undefined)).toBeUndefined()
  })
})

describe('formatCellValue', () => {
  it('빈 셀은 빈 문자열', () => {
    expect(formatCellValue(null)).toBe('')
    expect(formatCellValue(undefined)).toBe('')
  })

  it('날짜는 UTC 로 읽는다 — 로컬 게터면 KST 에서 하루 밀린다', () => {
    // ExcelJS 는 시리얼을 UTC 자정 Date 로 준다. getDate() 로 읽으면 08-17 이 08-16 이 된다
    expect(formatCellValue(new Date(Date.UTC(2026, 7, 17)))).toBe('2026-08-17')
    expect(formatCellValue(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01-01')
  })

  it('자정이 아니면 시각도 붙인다', () => {
    expect(formatCellValue(new Date(Date.UTC(2026, 7, 17, 14, 30)))).toBe('2026-08-17 14:30')
  })

  it('수식 셀은 저장된 결과를 보여준다 — 브라우저는 재계산하지 않는다', () => {
    expect(formatCellValue({ formula: 'SUM(A1:A3)', result: 42 })).toBe('42')
    expect(formatCellValue({ formula: 'A1/0', error: '#DIV/0!' })).toBe('#DIV/0!')
    // 결과가 안 담긴 파일이면 보여줄 값이 없다
    expect(formatCellValue({ formula: 'SUM(A1:A3)', result: undefined })).toBe('')
  })

  it('서식 있는 글자는 조각을 이어붙인다', () => {
    expect(formatCellValue({ richText: [{ text: '요구' }, { text: '사항' }] })).toBe('요구사항')
  })

  it('하이퍼링크는 보이는 글자를 쓴다', () => {
    expect(formatCellValue({ text: '명세서', hyperlink: 'https://example.com' })).toBe('명세서')
  })

  it('숫자·문자는 그대로', () => {
    expect(formatCellValue(0)).toBe('0')
    expect(formatCellValue('REQ-001')).toBe('REQ-001')
    expect(formatCellValue(true)).toBe('true')
  })
})

describe('parseA1', () => {
  it('A1 표기를 1-기반 좌표로', () => {
    expect(parseA1('A1')).toEqual({ row: 1, col: 1 })
    expect(parseA1('C210')).toEqual({ row: 210, col: 3 })
    expect(parseA1('Z1')).toEqual({ row: 1, col: 26 })
    // 두 글자로 넘어가는 자리 — 26진수가 아니라 bijective base-26 이다
    expect(parseA1('AA1')).toEqual({ row: 1, col: 27 })
    expect(parseA1('AB1')).toEqual({ row: 1, col: 28 })
  })

  it('$ 고정 표기와 소문자도 받는다', () => {
    expect(parseA1('$C$210')).toEqual({ row: 210, col: 3 })
    expect(parseA1('c210')).toEqual({ row: 210, col: 3 })
  })

  it('못 읽는 표기는 0,0 — 호출부가 걸러낸다', () => {
    expect(parseA1('')).toEqual({ row: 0, col: 0 })
    expect(parseA1('C')).toEqual({ row: 0, col: 0 })
  })
})

describe('buildMergeLayout', () => {
  it('세로 병합의 왼쪽 위에 rowSpan 을 주고 나머지는 덮는다', () => {
    const { spans, covered } = buildMergeLayout(['C210:C211'])
    expect(spans.get('210,3')).toEqual({ rowSpan: 2, colSpan: 1 })
    expect(covered.has('211,3')).toBe(true)
    // 왼쪽 위 자신은 덮이면 안 된다 — 덮이면 병합 셀이 통째로 사라진다
    expect(covered.has('210,3')).toBe(false)
  })

  it('직사각형 병합은 안쪽을 전부 덮는다', () => {
    const { spans, covered } = buildMergeLayout(['A1:B2'])
    expect(spans.get('1,1')).toEqual({ rowSpan: 2, colSpan: 2 })
    expect(covered.size).toBe(3)
    expect([...covered].sort()).toEqual(['1,2', '2,1', '2,2'])
  })

  it('병합이 여러 개여도 서로 섞이지 않는다', () => {
    const { spans } = buildMergeLayout(['A1:A2', 'C1:D1'])
    expect(spans.get('1,1')).toEqual({ rowSpan: 2, colSpan: 1 })
    expect(spans.get('1,3')).toEqual({ rowSpan: 1, colSpan: 2 })
  })

  it('없거나 망가진 항목에 죽지 않는다', () => {
    expect(buildMergeLayout(undefined).spans.size).toBe(0)
    expect(buildMergeLayout(['A1']).spans.size).toBe(0)
    expect(buildMergeLayout(['??:!!']).spans.size).toBe(0)
  })
})
