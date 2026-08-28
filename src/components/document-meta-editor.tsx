'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'

async function errorMessage(res: Response, fallback: string) {
  const body = await res.json().catch(() => null)
  return body?.error ?? fallback
}

export function DocumentMetaEditor({
  id,
  title,
  description,
}: {
  id: string
  title: string
  description: string | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState(title)
  const [draftDescription, setDraftDescription] = useState(description ?? '')

  const handleEdit = () => {
    // 서버에서 온 값으로 시작한다. 지난번 취소한 초안이 남아 있으면 안 된다.
    setDraftTitle(title)
    setDraftDescription(description ?? '')
    setError(null)
    setEditing(true)
  }

  const handleCancel = () => {
    setEditing(false)
    setError(null)
  }

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: draftTitle, description: draftDescription }),
      })
      if (!res.ok) throw new Error(await errorMessage(res, '저장하지 못했습니다.'))
      setEditing(false)
      // 제목·설명은 서버 컴포넌트가 그린다. 다시 렌더해야 화면이 따라온다.
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류')
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          <p className={`mt-1 text-sm ${description ? 'text-ink-muted' : 'text-ink-subtle'}`}>
            {description ?? '설명 없음'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleEdit}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
        >
          <Pencil className="h-3.5 w-3.5" />
          수정
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <input
        type="text"
        value={draftTitle}
        maxLength={200}
        disabled={busy}
        aria-label="문서 제목"
        onChange={(e) => setDraftTitle(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-ink outline-none focus:border-accent disabled:opacity-60"
      />
      <textarea
        value={draftDescription}
        maxLength={2000}
        rows={3}
        disabled={busy}
        aria-label="문서 설명"
        placeholder="설명 (선택)"
        onChange={(e) => setDraftDescription(e.target.value)}
        className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent disabled:opacity-60"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          // 서버도 400 으로 막지만, 저장을 눌러 보고 실패를 읽게 할 이유가 없다.
          disabled={busy || draftTitle.trim().length === 0}
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
