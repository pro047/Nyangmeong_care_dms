'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { emptyTrashMessage } from '@/lib/trash'

async function errorMessage(res: Response, fallback: string) {
  const body = await res.json().catch(() => null)
  return body?.error ?? fallback
}

export function TrashEmptyButton({
  count,
  before,
  includesOthers,
}: {
  count: number
  before: string
  includesOthers: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleEmpty = async () => {
    if (busy || isPending) return
    setBusy(true)
    try {
      const res = await fetch('/api/documents/trash?before=' + encodeURIComponent(before), {
        method: 'DELETE',
      })
      if (!res.ok) {
        throw new Error(await errorMessage(res, '휴지통을 비우지 못했습니다.'))
      }
      const body: { count: number } = await res.json()
      toast.success(emptyTrashMessage(body.count))
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '알 수 없는 오류')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={busy || isPending}
          aria-busy={busy || isPending}
          className="shrink-0 rounded-lg px-2.5 py-1 text-sm whitespace-nowrap text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-40"
        >
          <Trash2 className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
          휴지통 비우기
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>휴지통을 비울까요?</AlertDialogTitle>
          <AlertDialogDescription>
            {includesOthers
              ? `팀 전원의 휴지통 문서 ${count}개를 영구삭제합니다. 다른 사람이 올린 문서도 포함됩니다. 파일까지 지워지며 되돌릴 수 없습니다.`
              : `휴지통의 문서 ${count}개를 영구삭제합니다. 파일까지 지워지며 되돌릴 수 없습니다.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleEmpty}
            disabled={busy || isPending}
            aria-busy={busy || isPending}
            className="bg-danger text-white hover:bg-danger/90"
          >
            휴지통 비우기
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
