'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

async function errorMessage(res: Response, fallback: string) {
  const body = await res.json().catch(() => null)
  return body?.error ?? fallback
}

export function DocumentFolderSelect({
  documentId,
  currentFolderId,
  options,
}: {
  documentId: string
  currentFolderId: string | null
  options: { id: string; name: string; depth: number }[]
}) {
  const router = useRouter()
  const [value, setValue] = useState(currentFolderId ?? '')
  const [busy, setBusy] = useState(false)

  const handleChange = async (next: string) => {
    const previous = value
    setValue(next)
    setBusy(true)
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // '' 는 "폴더에서 꺼냄"이다. null 을 보내야 미분류로 저장된다.
        body: JSON.stringify({ folderId: next === '' ? null : next }),
      })
      if (!res.ok) throw new Error(await errorMessage(res, '폴더를 옮기지 못했습니다.'))
      // 폴더 이름은 서버 컴포넌트가 그린다.
      router.refresh()
    } catch (err) {
      // 실패했는데 셀렉트만 바뀐 채로 두면 옮겨진 것으로 오해한다.
      setValue(previous)
      window.alert(err instanceof Error ? err.message : '알 수 없는 오류')
    } finally {
      setBusy(false)
    }
  }

  return (
    <select
      value={value}
      disabled={busy}
      aria-label="문서 폴더"
      onChange={(e) => void handleChange(e.target.value)}
      className="rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-ink outline-none focus:border-accent disabled:opacity-60"
    >
      <option value="">— (미분류)</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {/* 전각 공백으로 깊이를 표시한다 — option 안에서는 CSS 들여쓰기가 먹지 않는다. */}
          {'　'.repeat(option.depth)}
          {option.name}
        </option>
      ))}
    </select>
  )
}
