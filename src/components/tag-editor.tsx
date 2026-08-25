'use client'

import Link from 'next/link'
import { useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X } from 'lucide-react'
import { MAX_TAGS_PER_DOCUMENT, MAX_TAG_LENGTH, normalizeTags } from '@/lib/tag'

async function errorMessage(res: Response, fallback: string) {
  const body = await res.json().catch(() => null)
  return body?.error ?? fallback
}

export function TagEditor({ documentId, tags }: { documentId: string; tags: string[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<string[]>(tags)
  const [input, setInput] = useState('')

  const handleEdit = () => {
    // 서버에서 온 값으로 시작한다. 지난번 취소한 초안이 남아 있으면 안 된다.
    setDraft(tags)
    setInput('')
    setError(null)
    setEditing(true)
  }

  const handleCancel = () => {
    setEditing(false)
    setError(null)
  }

  const addTag = (raw: string) => {
    if (raw.trim() === '') return
    if (raw.trim().length > MAX_TAG_LENGTH) {
      setError(`태그는 ${MAX_TAG_LENGTH}자까지 쓸 수 있습니다.`)
      return
    }
    const next = normalizeTags([...draft, raw])
    if (next.length > MAX_TAGS_PER_DOCUMENT) {
      setError(`태그는 최대 ${MAX_TAGS_PER_DOCUMENT}개까지 붙일 수 있습니다.`)
      return
    }
    setDraft(next)
    setInput('')
    setError(null)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 쉼표까지 받는 이유: 태그를 이어 칠 때 엔터로 폼이 제출될까 봐 망설이지 않게 한다.
    if (e.key !== 'Enter' && e.key !== ',') return
    e.preventDefault()
    addTag(input)
  }

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    try {
      // 입력칸에 남은 글자도 붙일 태그로 본다 — 엔터를 안 치고 저장을 누르는 쪽이 흔하다.
      const names = normalizeTags([...draft, input])
      const res = await fetch(`/api/documents/${documentId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: names }),
      })
      if (!res.ok) throw new Error(await errorMessage(res, '태그를 저장하지 못했습니다.'))
      setEditing(false)
      // 칩은 서버 컴포넌트가 그린다. 다시 렌더해야 화면이 따라온다.
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류')
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <div className="mt-3 flex items-start justify-between gap-4">
        {tags.length === 0 ? (
          <p className="text-sm text-ink-subtle">태그 없음</p>
        ) : (
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {tags.map((name) => (
              <Link
                key={name}
                href={`/?tag=${encodeURIComponent(name)}`}
                className="rounded bg-canvas px-2 py-0.5 text-xs text-ink-muted transition-colors hover:bg-accent-soft hover:text-accent"
              >
                {name}
              </Link>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={handleEdit}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
        >
          <Pencil className="h-3 w-3" />
          태그
        </button>
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      {draft.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {draft.map((name) => (
            <span
              key={name}
              className="flex items-center gap-1 rounded bg-canvas px-2 py-0.5 text-xs text-ink-muted"
            >
              {name}
              <button
                type="button"
                disabled={busy}
                onClick={() => setDraft(draft.filter((t) => t !== name))}
                aria-label={`${name} 태그 제거`}
                className="text-ink-subtle transition-colors hover:text-danger disabled:opacity-40"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={input}
        maxLength={MAX_TAG_LENGTH}
        disabled={busy}
        aria-label="태그 입력"
        placeholder="태그를 입력하고 Enter"
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-accent disabled:opacity-60"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          {busy ? '저장 중…' : '저장'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-canvas hover:text-ink disabled:opacity-40"
        >
          취소
        </button>
      </div>
    </div>
  )
}
