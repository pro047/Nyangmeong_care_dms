'use client'

import { Component, useEffect, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Download, Loader2 } from 'lucide-react'

// 상수를 markdown-view.ts 에 두면 이 상수 하나 때문에 파서가 정적으로 딸려 와 지연 로딩이 무너진다.
// MCP 읽기 상한(MAX_READ_BYTES)과 같은 값이다.
const MAX_BYTES = 1024 * 1024

const FAILED = '이 파일은 미리보기를 만들지 못했습니다. 내려받아서 여세요.'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; body: ReactElement | null; garbled: boolean }

function ErrorBox({ message, downloadHref }: { message: string; downloadHref: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-5">
      <p className="min-w-0 text-sm text-ink-muted">{message}</p>
      <a
        href={downloadHref}
        className="ml-auto flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm text-ink transition-colors hover:bg-canvas"
      >
        <Download className="h-4 w-4" />
        다운로드
      </a>
    </div>
  )
}

// renderMarkdown 은 엘리먼트만 만들고 파싱은 React 가 그릴 때 돈다. fetch 의 .catch 로는
// 그때 나는 예외를 못 잡으므로 경계가 따로 필요하다.
class RenderBoundary extends Component<
  { downloadHref: string; children: ReactNode },
  { failed: string | null }
> {
  state = { failed: null as string | null }

  static getDerivedStateFromError(e: unknown) {
    return { failed: e instanceof Error ? e.message : '알 수 없는 오류' }
  }

  render() {
    if (this.state.failed !== null) {
      return <ErrorBox message={`${FAILED} (${this.state.failed})`} downloadHref={this.props.downloadHref} />
    }
    return this.props.children
  }
}

export function MarkdownPreview({
  src,
  fileName,
  sizeBytes,
  downloadHref,
}: {
  src: string
  fileName: string
  sizeBytes: number
  downloadHref: string
}) {
  const tooLarge = sizeBytes > MAX_BYTES
  const [state, setState] = useState<State>(() =>
    tooLarge
      ? { status: 'error', message: '파일이 너무 커서 미리보기를 만들지 않습니다. 내려받아서 여세요.' }
      : { status: 'loading' },
  )

  // src 가 바뀌면 부모가 key 로 이 컴포넌트를 갈아끼운다. 그래서 여기서 상태를 되돌리지 않는다.
  useEffect(() => {
    if (tooLarge) return
    let cancelled = false

    // 파서는 md 문서를 열 때만 받는다. 파일을 받는 동안 같이 온다.
    Promise.all([import('@/lib/markdown-view'), fetch(src)])
      .then(async ([mod, res]) => {
        if (!res.ok) throw new Error(`파일을 받지 못했습니다 (${res.status})`)
        const { text, replaced } = mod.decodeMarkdown(new Uint8Array(await res.arrayBuffer()))
        if (cancelled) return
        setState({
          status: 'ready',
          body: text.trim() === '' ? null : mod.renderMarkdown(text),
          garbled: replaced,
        })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const why = e instanceof Error ? e.message : '알 수 없는 오류'
        setState({ status: 'error', message: `${FAILED} (${why})` })
      })

    return () => {
      cancelled = true
    }
  }, [src, tooLarge])

  if (state.status === 'loading') {
    return (
      <div className="flex h-40 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        문서를 여는 중…
      </div>
    )
  }

  if (state.status === 'error') {
    return <ErrorBox message={state.message} downloadHref={downloadHref} />
  }

  if (state.body === null) {
    return (
      <div className="rounded-xl border border-border bg-surface">
        <p className="p-5 text-sm text-ink-muted">{fileName} 에 표시할 내용이 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {state.garbled && (
        <p className="border-b border-border px-5 py-2.5 text-sm text-ink-muted">
          UTF-8 이 아닌 파일이라 글자가 깨져 보일 수 있습니다. UTF-8 로 저장해 다시 올려 주세요.
        </p>
      )}
      <div className="max-h-[70vh] overflow-auto">
        <RenderBoundary downloadHref={downloadHref}>
          <div className="markdown-body">{state.body}</div>
        </RenderBoundary>
      </div>
    </div>
  )
}
