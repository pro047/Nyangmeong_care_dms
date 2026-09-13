import { describe, expect, it } from 'vitest'
import { htmlToText } from '@/lib/mcp/html-text'

describe('htmlToText — 구조 태그', () => {
  it('블록 태그로 나뉜 문단이면 사이에 개행 1~2개를 두고 앞뒤 공백이 없어야 한다 (H1)', () => {
    const text = htmlToText('<p>가</p><p>나</p>')

    expect(text).toMatch(/^가\n{1,2}나$/)
  })

  it('소스의 개행·들여쓰기는 공백 하나로 접혀야 한다 (H3)', () => {
    expect(htmlToText('<p>첫\n   둘</p>')).toBe('첫 둘')
  })

  it('표는 행마다 한 줄, 셀은 탭으로 나뉘고 줄 끝에 탭이 남지 않아야 한다 (H4)', () => {
    const text = htmlToText('<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>')

    const lines = text.split('\n')
    expect(lines).toContain('a\tb')
    expect(lines).toContain('c\td')
    for (const line of lines) expect(line).not.toMatch(/\t$/)
  })

  it('제목은 # 로, 목록 항목은 "- " 로 줄을 시작해야 한다 (H5)', () => {
    expect(htmlToText('<h2>제목</h2>').split('\n')).toContain('## 제목')

    const lines = htmlToText('<ul><li>하나</li><li>둘</li></ul>').split('\n')
    expect(lines).toContain('- 하나')
    expect(lines).toContain('- 둘')
  })

  it('<br> 과 대문자 <BR/> 은 개행이 되어야 한다 (H6)', () => {
    expect(htmlToText('a<br>b<BR/>c')).toBe('a\nb\nc')
  })

  it('속성이 붙은 <br> 도 개행이 되어야 한다', () => {
    const html = 'line1<br class="x">line2<br style="a" />line3'

    const text = htmlToText(html)

    expect(text).toBe('line1\nline2\nline3')
  })

  it('닫는 </td> 를 생략한 표도 셀이 탭으로 나뉘어야 한다', () => {
    const html = '<table><tr><td>a<td>b<tr><th>c<td>d</table>'

    const lines = htmlToText(html).split('\n')

    expect(lines).toEqual(['a\tb', 'c\td'])
  })

  it('첫 셀이 비어 있으면 행 앞 탭 하나로 자리를 지켜야 한다', () => {
    const html = '<table><tr><td>a</td><td>b</td></tr><tr><td></td><td>d</td></tr></table>'

    const lines = htmlToText(html).split('\n')

    expect(lines).toContain('a\tb')
    expect(lines).toContain('\td')
  })

  it('빈 줄이 3개 이상 이어지면 2개로 줄여야 한다 (H11)', () => {
    const text = htmlToText('<p>a</p><br><br><br><br><p>b</p>')

    expect(text).not.toContain('\n\n\n')
    expect(text).toBe('a\n\nb')
  })
})

describe('htmlToText — 제거', () => {
  it('script·style·주석은 내용까지 지워야 한다 (H2)', () => {
    expect(htmlToText('<script>alert(1)</script><style>p{}</style><!-- 비밀 -->본문')).toBe('본문')
  })

  it('여러 줄에 걸친 대문자 SCRIPT 도 지워야 한다', () => {
    expect(htmlToText('<SCRIPT type="x">\nvar a = "<p>";\n</SCRIPT><p>본문</p>')).toBe('본문')
  })
})

describe('htmlToText — 엔티티', () => {
  it('이름·10진·16진 엔티티와 &nbsp; 를 풀어야 한다 (H7)', () => {
    expect(htmlToText('&lt;div&gt; &amp; &quot;x&quot; &#44032; &#xAC00;&nbsp;끝')).toBe('<div> & "x" 가 가 끝')
  })

  it('&amp;lt; 는 한 번만 풀려 &lt; 로 남아야 한다 (H8 이중 해제 금지)', () => {
    expect(htmlToText('&amp;lt;')).toBe('&lt;')
  })

  it('풀린 꺾쇠가 태그로 오인돼 지워지지 않아야 한다 (H9)', () => {
    expect(htmlToText('&lt;script&gt;x')).toBe('<script>x')
  })

  it('모르는 이름·범위 밖 코드포인트면 원문 그대로 둬야 한다 (H10)', () => {
    expect(htmlToText('a &foo; b')).toBe('a &foo; b')
    expect(htmlToText('&#x110000;')).toBe('&#x110000;')
  })

  it('Object.prototype 멤버 이름의 엔티티면 원문 그대로 둬야 한다 (F1)', () => {
    const html = 'a &constructor; &toString; &hasOwnProperty; &__proto__; b'

    const text = htmlToText(html)

    expect(text).toBe(html)
  })
})
