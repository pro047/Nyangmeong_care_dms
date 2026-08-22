'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'

async function errorMessage(res: Response, fallback: string) {
  const body = await res.json().catch(() => null)
  return body?.error ?? fallback
}

export function TrashRowActions({ id, title }: { id: string; title: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const handleRestore = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/documents/${id}/restore`, { method: 'POST' })
      // 404는 "이미 복구됨"과 구분되지 않는다(라우트가 count 0을 둘 다 404로 낸다).
      // 연타하면 두 번째가 404로 오는데, 첫 번째가 성공했으므로 실패로 알리면 거짓말이다.
      if (!res.ok && res.status !== 404) {
        throw new Error(await errorMessage(res, '복구하지 못했습니다.'))
      }
      router.refresh()
      // 성공 경로에서 busy 를 풀지 않는다. router.refresh()는 fire-and-forget이라
      // 여기서 풀면 아직 사라지지 않은 행의 버튼이 다시 눌린다. 행이 사라지면
      // 컴포넌트도 언마운트되므로 되돌릴 필요가 없다.
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '알 수 없는 오류')
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleRestore}
      disabled={busy}
      aria-busy={busy}
      aria-label={`${title} 복구`}
      className="rounded-lg px-2.5 py-1 text-sm text-ink-muted transition-colors hover:bg-accent-soft hover:text-accent disabled:opacity-40"
    >
      <RotateCcw className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
      복구
    </button>
  )
}
