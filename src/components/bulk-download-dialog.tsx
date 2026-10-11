'use client'

import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  bulkCategories,
  bulkTotalBytes,
  bulkZipName,
  exceedsBulkLimit,
  selectBulkDocuments,
  type BulkDocument,
} from '@/lib/bulk-download'
import {
  createJsZipWriter,
  runBulkDownload,
  type BulkBatch,
  type BulkProgress,
} from '@/lib/bulk-download-run'
import { bulkDownloadMessage, BULK_TOO_LARGE_MESSAGE } from '@/lib/bulk-download-message'
import { formatBytes } from '@/lib/format'
import type { FolderRow } from '@/lib/folder'

function saveZip(data: ArrayBuffer, fileName: string) {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/zip' }))
  const anchor = document.createElement('a')
  try {
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    // 브라우저가 다운로드를 시작하기 전에 URL이 해제되지 않게 다음 작업으로 미룬다.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

export function BulkDownloadDialog({
  folders,
  documents,
}: {
  folders: FolderRow[]
  documents: BulkDocument[]
}) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<(string | null)[]>([])
  const [progress, setProgress] = useState<BulkProgress | null>(null)
  const batchRef = useRef<BulkBatch | null>(null)

  useEffect(() => () => {
    if (batchRef.current) batchRef.current.cancelled = true
  }, [])

  const categories = bulkCategories(folders, documents)
  const selectable = categories.filter((category) => category.documentCount > 0)
  const allSelected = selectable.length > 0 && selectable.every((category) => selected.includes(category.folderId))
  const targets = selectBulkDocuments(folders, documents, selected)
  const totalBytes = bulkTotalBytes(targets)
  const tooLarge = exceedsBulkLimit(totalBytes)
  const busy = progress !== null

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      if (batchRef.current) batchRef.current.cancelled = true
      batchRef.current = null
      setProgress(null)
    }
    setOpen(nextOpen)
  }

  async function handleDownload() {
    if (batchRef.current || targets.length === 0 || tooLarge) return
    const batch: BulkBatch = { cancelled: false }
    batchRef.current = batch
    setProgress({ phase: 'fetching', done: 0, total: targets.length })

    const result = await runBulkDownload(
      { folders, documents, selected, zipName: bulkZipName(new Date()) },
      {
        fetchFile: (url) => fetch(url),
        createZip: createJsZipWriter,
        save: saveZip,
        onProgress: (nextProgress) => {
          if (batchRef.current === batch && !batch.cancelled) setProgress(nextProgress)
        },
      },
      batch,
    )

    // 닫았다 다시 연 창을 이전 작업의 결과가 바꾸면 안 된다.
    if (batchRef.current !== batch || batch.cancelled) return
    batchRef.current = null
    setProgress(null)
    const notice = bulkDownloadMessage(result)
    if (notice) toast[notice.tone](notice.message)
    if (result.kind === 'done') setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-border bg-surface text-ink-muted hover:text-ink">
          <Download aria-hidden />
          일괄 다운로드
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto bg-surface text-ink">
        <DialogHeader>
          <DialogTitle>일괄 다운로드</DialogTitle>
          <DialogDescription className="text-ink-muted">
            하위 폴더를 포함해 고른 종류의 최신 버전을 zip 하나로 받습니다.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={busy || selectable.length === 0}
            onChange={(event) => setSelected(event.target.checked ? selectable.map((category) => category.folderId) : [])}
            className="accent-accent disabled:opacity-50"
          />
          전체 선택/해제
        </label>
        <div className="divide-y divide-border rounded-lg border border-border">
          {categories.map((category) => (
            <label
              key={category.folderId === null ? 'uncategorized' : `folder-${category.folderId}`}
              className="flex items-center gap-2 px-3 py-2 text-sm has-disabled:opacity-50"
            >
              <input
                type="checkbox"
                checked={category.documentCount > 0 && selected.includes(category.folderId)}
                disabled={busy || category.documentCount === 0}
                onChange={(event) => setSelected((current) => event.target.checked
                  ? [...current, category.folderId]
                  : current.filter((id) => id !== category.folderId))}
                className="shrink-0 accent-accent"
              />
              <span className="min-w-0 flex-1 break-words text-ink">{category.name}</span>
              <span className="shrink-0 whitespace-nowrap text-ink-muted">
                {category.documentCount}개 · {formatBytes(category.totalBytes)}
              </span>
            </label>
          ))}
        </div>

        <div className="space-y-2" aria-live="polite">
          <p className="text-sm text-ink">고른 문서 {targets.length}개 · {formatBytes(totalBytes)}</p>
          {tooLarge && <p className="text-sm text-danger">{BULK_TOO_LARGE_MESSAGE}</p>}
          {progress && (
            <p role="status" className="text-sm text-ink-muted">
              {progress.phase === 'fetching' ? `받는 중 ${progress.done}/${progress.total}` : '묶는 중'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>닫기</Button>
          <Button onClick={handleDownload} disabled={busy || targets.length === 0 || tooLarge}>
            받기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
