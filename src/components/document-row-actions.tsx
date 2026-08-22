'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

async function errorMessage(res: Response, fallback: string) {
  const body = await res.json().catch(() => null)
  return body?.error ?? fallback
}

export function DocumentRowActions({ id, title }: { id: string; title: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const handleDelete = async () => {
    if (!window.confirm(`"${title}" 문서를 휴지통으로 보낼까요?`)) return

    setBusy(true)
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
      // 404는 "이미 휴지통에 있음"과 구분되지 않는다(라우트가 count 0을 둘 다 404로 낸다).
      // 연타하면 두 번째가 404로 오는데, 첫 번째가 성공했으므로 실패로 알리면 거짓말이다.
      if (!res.ok && res.status !== 404) {
        throw new Error(await errorMessage(res, '삭제하지 못했습니다.'))
      }
      // 목록은 서버 컴포넌트라 다시 렌더해야 행이 사라진다.
      router.refresh()
      // 성공 경로에서 busy 를 풀지 않는다. refresh 는 fire-and-forget 이라 여기서
      // 풀면 아직 남아 있는 행의 버튼이 다시 눌린다. 행이 사라지면 언마운트된다.
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '알 수 없는 오류')
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={busy}
      aria-busy={busy}
      aria-label={`${title} 휴지통으로 이동`}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-40"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
