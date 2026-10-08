import { createElement } from 'react'
import type { ComponentPropsWithoutRef, ReactElement } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// 앱 오리진에서 그려지므로 원시 HTML 을 살리지 않는다. rehypePlugins·urlTransform·skipHtml 을
// 일부러 넘기지 않는다 — 기본값이 원시 HTML 을 글자로 남기고 javascript: 를 지운다.
// 어느 하나라도 넘기는 순간 XSS 방어선이 바뀐다(markdown-view.test.ts 가 고정).
type AnchorProps = ComponentPropsWithoutRef<'a'> & { node?: unknown }

function ExternalLink({ node, ...rest }: AnchorProps) {
  // node 는 react-markdown 이 components 에 붙여 주는 hast 노드다. DOM 으로 흘리면 속성이 된다.
  void node
  // 문서 안 이동(#…)은 제자리에서 움직여야 한다. 새 탭으로 열면 같은 상세 페이지가 하나 더 뜬다.
  if (rest.href?.startsWith('#')) return createElement('a', rest)
  return createElement('a', { ...rest, target: '_blank', rel: 'noopener noreferrer' })
}

/**
 * 항상 UTF-8 로 읽는다(사람 결정 2026-10-08 — 다른 인코딩을 추측해 풀지 않는다). UTF-8 이 아니면
 * 대체 문자로 풀고 replaced 로 알린다 — 안내 없이 깨진 글자만 보이면 미리보기 고장으로 읽힌다.
 * MCP 읽기(`read-tools.ts` 의 decodeUtf8)와 같은 규칙인데, 거기서 가져오면 서버 코드가 번들에 딸려 온다.
 */
export function decodeMarkdown(bytes: Uint8Array): { text: string; replaced: boolean } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), replaced: false }
  } catch {
    return { text: new TextDecoder('utf-8').decode(bytes), replaced: true }
  }
}

export function renderMarkdown(source: string): ReactElement {
  // 문자열은 props.children 이 아니라 셋째 인자로 넘긴다 (react/no-children-prop).
  return createElement(
    Markdown,
    { remarkPlugins: [remarkGfm], components: { a: ExternalLink } },
    source,
  )
}
