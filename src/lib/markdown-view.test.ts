import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { decodeMarkdown, renderMarkdown } from '@/lib/markdown-view'

function render(source: string): string {
  return renderToStaticMarkup(renderMarkdown(source))
}

// "없다"만 단언하면 아무것도 안 그리는 구현도 통과한다. 표식 문단이 같이 그려졌는지 본다.
const MARKER = '표식문단'
function withMarker(payload: string): string {
  return `${MARKER}\n\n${payload}`
}

// 원시 HTML 은 글자로 남을 수 있으므로(&lt;script&gt;) 낱말이 아니라 `<` 로 시작하는 실제 태그만 본다.
const SCRIPT_TAG = /<script/i
const RAW_ELEMENT_TAG = /<(img|svg|iframe|style)\b/i
const EVENT_ATTRIBUTE = /<[^>]*\son\w+\s*=/i
const JAVASCRIPT_URL = /(href|src)\s*=\s*"\s*javascript:/i
const UNSAFE_URL = /(href|src)\s*=\s*"[^"]*(javascript|vbscript|data):/i

describe('renderMarkdown — 렌더', () => {
  // AC-6 — 완료 조건 1
  it('AC-6 제목·목록·표·코드블록이 든 문서를 렌더하면 해당 태그가 전부 나와야 한다', () => {
    const source = [
      '# 큰제목',
      '',
      '- 글머리 항목',
      '',
      '1. 번호 항목',
      '',
      '| 머리1 | 머리2 |',
      '|---|---|',
      '| 칸1 | 칸2 |',
      '',
      '```',
      'const code = 1',
      '```',
    ].join('\n')

    const out = render(source)

    for (const tag of ['<h1', '<ul', '<ol', '<li', '<table', '<th', '<td', '<pre', '<code']) {
      expect(out).toContain(tag)
    }
    for (const text of ['큰제목', '글머리 항목', '번호 항목', '머리1', '칸2', 'const code = 1']) {
      expect(out).toContain(text)
    }
  })

  // AC-6 — remark-gfm 이 빠지면 표는 `| 머리1 |` 글자가 든 문단으로 떨어진다
  it('AC-6 GFM 표를 렌더하면 세로줄 문법이 글자로 남지 않아야 한다', () => {
    const source = ['| 머리1 | 머리2 |', '|---|---|', '| 칸1 | 칸2 |'].join('\n')

    const out = render(source)

    expect(out).toContain('<table')
    expect(out).not.toContain('|---|')
    expect(out).not.toContain('| 머리1')
  })

  // AC-6 — 표 밖의 GFM 문법(체크리스트·취소선)
  it('AC-6 체크리스트와 취소선을 렌더하면 체크박스와 del 태그가 나와야 한다', () => {
    const source = ['- [x] 끝난 일', '- [ ] 남은 일', '', '~~지운 글~~'].join('\n')

    const out = render(source)

    expect(out.match(/<input\b/g)).toHaveLength(2)
    expect(out).toContain('type="checkbox"')
    expect(out).toContain('<del>지운 글</del>')
    expect(out).not.toContain('[x]')
  })

  // AC-12
  it('AC-12 빈 문자열을 렌더하면 던지지 않고 빈 문자열을 돌려줘야 한다', () => {
    const source = ''

    const out = render(source)

    expect(out).toBe('')
  })

  // AC-12 — 공백뿐인 본문도 같은 길이다
  it('AC-12 공백과 줄바꿈뿐인 문자열을 렌더하면 던지지 않고 빈 문자열을 돌려줘야 한다', () => {
    const source = '  \n\n\t\n'

    const out = render(source)

    expect(out).toBe('')
  })
})

describe('renderMarkdown — 원시 HTML 은 엘리먼트가 되지 않는다', () => {
  // AC-7 — 완료 조건 2
  it('AC-7 script 가 블록으로 들어 있으면 script 태그가 나오지 않아야 한다', () => {
    const source = withMarker('<script>alert(1)</script>')

    const out = render(source)

    expect(out).toContain(MARKER)
    expect(out).not.toMatch(SCRIPT_TAG)
  })

  // AC-7 — 완료 조건 2
  it('AC-7 script 가 문장 중간에 인라인으로 들어 있으면 script 태그가 나오지 않아야 한다', () => {
    const source = withMarker('앞글자 <script>alert(1)</script> 뒷글자')

    const out = render(source)

    expect(out).toContain(MARKER)
    expect(out).toContain('앞글자')
    expect(out).toContain('뒷글자')
    expect(out).not.toMatch(SCRIPT_TAG)
  })

  // AC-7 — 대소문자를 섞어도 같다
  it('AC-7 대소문자를 섞은 ScRiPt 가 들어 있으면 script 태그가 나오지 않아야 한다', () => {
    const source = withMarker('<ScRiPt>alert(1)</sCrIpT>')

    const out = render(source)

    expect(out).toContain(MARKER)
    expect(out).not.toMatch(SCRIPT_TAG)
  })

  // AC-8 — 완료 조건 2
  it.each([
    ['img onerror', '<img src=x onerror=alert(1)>'],
    ['svg onload', '<svg onload=alert(1)>'],
    ['iframe javascript', '<iframe src="javascript:alert(1)"></iframe>'],
    ['a javascript', '<a href="javascript:alert(1)">x</a>'],
    ['style', '<style>body{display:none}</style>'],
    // 문장 중간에 끼워도 같다
    ['인라인 img', '앞글자 <img src=x onerror=alert(1)> 뒷글자'],
    ['인라인 a onclick', '앞글자 <a href="https://example.com" onclick="alert(1)">x</a> 뒷글자'],
  ])('AC-8 원시 HTML(%s)을 렌더하면 실행 가능한 태그·속성이 나오지 않아야 한다', (_label, payload) => {
    const source = withMarker(payload)

    const out = render(source)

    expect(out).toContain(MARKER)
    expect(out).not.toMatch(RAW_ELEMENT_TAG)
    expect(out).not.toMatch(EVENT_ATTRIBUTE)
    expect(out).not.toMatch(JAVASCRIPT_URL)
  })

  // AC-8 — 원시 HTML 로 쓴 링크는 링크가 되지 않는다(글자로 남거나 지워진다)
  it('AC-8 원시 HTML 로 쓴 a 태그를 렌더하면 a 엘리먼트가 나오지 않아야 한다', () => {
    const source = withMarker('<a href="javascript:alert(1)">x</a>')

    const out = render(source)

    expect(out).toContain(MARKER)
    expect(out).not.toMatch(/<a\b/i)
  })

  // AC-11
  it('AC-11 코드블록 안에 script 를 넣으면 코드 글자로 남아야 한다', () => {
    const source = withMarker(['```html', '<script>alert(1)</script>', '```'].join('\n'))

    const out = render(source)

    expect(out).toContain('<pre')
    expect(out).not.toMatch(SCRIPT_TAG)
    expect(out).toContain('&lt;script&gt;')
  })

  // AC-11 — 인라인 코드도 같다
  it('AC-11 인라인 코드 안에 script 를 넣으면 코드 글자로 남아야 한다', () => {
    const source = withMarker('본문 `<script>alert(1)</script>` 끝')

    const out = render(source)

    expect(out).toContain('<code')
    expect(out).not.toMatch(SCRIPT_TAG)
    expect(out).toContain('&lt;script&gt;')
  })
})

describe('renderMarkdown — 링크', () => {
  // AC-9 — 완료 조건 2
  it.each([
    ['인라인 링크', '[링크글자](javascript:alert(1))'],
    ['대소문자 섞음', '[링크글자](JaVaScRiPt:alert(1))'],
    ['참조 링크', '[링크글자][r]\n\n[r]: javascript:alert(1)'],
    ['자동 링크', '링크글자 <javascript:alert(1)>'],
    ['이미지', '링크글자 ![그림](javascript:alert(1))'],
    ['vbscript', '[링크글자](vbscript:msgbox(1))'],
    ['data', '[링크글자](data:text/html,hi)'],
  ])('AC-9 위험한 프로토콜이 마크다운 문법(%s)으로 들어오면 속성에 남지 않아야 한다', (_label, payload) => {
    const source = withMarker(payload)

    const out = render(source)

    expect(out).toContain(MARKER)
    expect(out).toContain('링크글자')
    expect(out).not.toMatch(UNSAFE_URL)
  })

  // AC-10
  it('AC-10 정상 링크를 렌더하면 href 가 보존되고 새 탭으로 열려야 한다', () => {
    const source = '[링크글자](https://example.com/a?b=1)'

    const out = render(source)

    expect(out).toContain('href="https://example.com/a?b=1"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
    expect(out).toContain('>링크글자</a>')
    expect(out).not.toContain(' node=')
  })

  // AC-10 — 링크가 여럿이어도 전부 새 탭이다 (GFM 자동 링크 포함)
  it('AC-10 링크가 둘이면 둘 다 새 탭 속성을 가져야 한다', () => {
    const source = '[하나](https://example.com/one) 그리고 https://example.com/two'

    const out = render(source)

    expect(out.match(/<a\b/g)).toHaveLength(2)
    expect(out.match(/target="_blank"/g)).toHaveLength(2)
    expect(out.match(/rel="noopener noreferrer"/g)).toHaveLength(2)
    expect(out).toContain('href="https://example.com/one"')
    expect(out).toContain('href="https://example.com/two"')
    expect(out).not.toContain(' node=')
  })

  // AC-10 — 허용 프로토콜과 상대 경로는 손대지 않는다
  it.each([
    ['[링크글자](mailto:a@example.com)', 'href="mailto:a@example.com"'],
    ['[링크글자](./other.md)', 'href="./other.md"'],
    ['[링크글자](#section)', 'href="#section"'],
  ])('AC-10 %s 를 렌더하면 %s 가 그대로 있어야 한다', (source, expected) => {
    const out = render(source)

    expect(out).toContain(expected)
  })
})

describe('renderMarkdown — 문서 안 이동 링크', () => {
  it('# 로 시작하는 링크는 새 탭 속성이 없어야 한다', () => {
    const out = render('[목차](#section)')

    expect(out).toContain('<a href="#section">목차</a>')
    expect(out).not.toContain(' node=')
  })

  it('# 링크와 외부 링크가 섞이면 외부 링크만 새 탭 속성을 가져야 한다', () => {
    const out = render('[목차](#section) 그리고 [밖](https://example.com/out)')

    expect(out.match(/<a\b/g)).toHaveLength(2)
    expect(out.match(/target="_blank"/g)).toHaveLength(1)
    expect(out).toContain('<a href="https://example.com/out" target="_blank" rel="noopener noreferrer">밖</a>')
  })
})

describe('decodeMarkdown', () => {
  it('UTF-8 바이트는 그대로 풀고 replaced 가 false 여야 한다', () => {
    const bytes = new TextEncoder().encode('# 한글 제목')

    expect(decodeMarkdown(bytes)).toEqual({ text: '# 한글 제목', replaced: false })
  })

  it('CP949 바이트는 다른 인코딩으로 풀지 않고 대체 문자와 replaced true 를 돌려줘야 한다', () => {
    // '한글' 의 CP949 바이트. UTF-8 로는 유효하지 않다.
    const bytes = new Uint8Array([0x23, 0x20, 0xc7, 0xd1, 0xb1, 0xdb])

    const { text, replaced } = decodeMarkdown(bytes)

    expect(replaced).toBe(true)
    expect(text.startsWith('# ')).toBe(true)
    expect(text).toContain('\uFFFD')
    expect(text).not.toContain('한글')
  })

  it('빈 바이트는 빈 문자열이고 replaced 가 false 여야 한다', () => {
    expect(decodeMarkdown(new Uint8Array())).toEqual({ text: '', replaced: false })
  })
})
