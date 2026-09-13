/**
 * html → 읽을 텍스트. 정규식 기반이라 브라우저 수준 정확도는 목표가 아니다
 * (§8 하지 않는 것 — `<pre>` 공백 보존·CSS 숨김 요소 제외 등은 안 한다).
 */

const COMMENT_OR_SCRIPT_RE =
  /<!--[\s\S]*?-->|<script[^>]*>[\s\S]*?<\/script>|<style[^>]*>[\s\S]*?<\/style>|<noscript[^>]*>[\s\S]*?<\/noscript>/gi

// li 는 별도 규칙(줄 시작에 "- ")이 있어 이 목록에서 뺀다.
const BLOCK_TAGS = [
  'p', 'div', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'main',
  'ul', 'ol', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'blockquote', 'pre', 'hr',
  'dl', 'dt', 'dd', 'figure', 'figcaption', 'form', 'fieldset', 'details', 'summary', 'caption', 'title',
]
const BLOCK_TAG_RE = new RegExp(`<\\/?(?:${BLOCK_TAGS.join('|')})\\b[^>]*>`, 'gi')

// &#39; 는 표에 없어도 된다 — 숫자 참조 경로(아래)가 같은 결과를 낸다.
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** 태그를 걷고 읽을 텍스트만 남긴다. 아래 순서를 바꾸지 않는다. */
export function htmlToText(html: string): string {
  let out = html

  // 1. 주석·script·style·noscript 제거
  out = out.replace(COMMENT_OR_SCRIPT_RE, '')

  // 2. 원문 공백 접기 — 브라우저가 소스 개행을 공백으로 그리는 것과 같게.
  //    구조 구분자(3)는 이 뒤에 넣으므로 여기서 지워지지 않는다.
  out = out.replace(/\s+/g, ' ')

  // 3. 구조 태그 → 구분자
  out = out.replace(/<br\b[^>]*>/gi, '\n')
  out = out.replace(/<h([1-6])\b[^>]*>/gi, (_m, n: string) => `\n${'#'.repeat(Number(n))} `)
  out = out.replace(/<\/h[1-6]>/gi, '\n')
  out = out.replace(/<li\b[^>]*>/gi, '\n- ')
  // 닫는 </td> 는 생략해도 유효한 HTML 이라 여는 태그에 구분자를 붙인다.
  // 행 첫 셀 앞에 생기는 탭은 6단계에서 하나만 걷는다.
  out = out.replace(/<(?:td|th)\b[^>]*>/gi, '\t')
  out = out.replace(BLOCK_TAG_RE, '\n')

  // 4. 남은 태그 전부 제거
  out = out.replace(/<[^>]*>/g, '')

  // 5. 엔티티 해제 — 태그 제거 뒤에 해야 한다(먼저 하면 `&lt;script&gt;`가 태그가 되어 지워진다).
  //    String.replace 는 원문을 한 번만 훑으므로 `&amp;lt;` 가 `&lt;` 로 바뀐 뒤 다시
  //    풀리는 이중 해제가 저절로 일어나지 않는다.
  out = out.replace(/&(#x[0-9a-f]+|#\d+|[a-zA-Z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X'
      const codePoint = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match
      try {
        return String.fromCodePoint(codePoint)
      } catch {
        return match
      }
    }
    // 일반 객체라 `constructor` 같은 Object.prototype 이름이 함수로 걸린다 — 자기 키만 본다.
    return Object.hasOwn(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : match
  })

  // 6. 줄 정리 — "공백"(스페이스)과 "탭"은 여기서 다른 것이다: 탭은 표 셀 구분자(3)라
  //    살려 두고, 줄 끝에서만 공백·탭 둘 다 지운다.
  out = out
    .split('\n')
    .map((line) =>
      line
        .replace(/ +/g, ' ')
        .replace(/ *\t */g, '\t')
        .replace(/^ +/, '')
        .replace(/^\t/, '')
        .replace(/[ \t]+$/, ''),
    )
    .join('\n')
  out = out.replace(/\n{3,}/g, '\n\n')

  return out.trim()
}
