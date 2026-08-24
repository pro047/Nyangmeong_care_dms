'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { formatBytes } from '@/lib/format'
import { runUploadFlow, type UploadBatch } from '@/lib/upload-flow'
import { putToS3 } from '@/lib/upload-xhr'

type ItemStatus = 'pending' | 'uploading' | 'done' | 'error'

type Item = {
  id: string
  file: File
  status: ItemStatus
  progress: number
  error?: string
}

const MAX_PARALLEL = 3

function titleFromFileName(fileName: string) {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

async function errorMessage(res: Response, fallback: string) {
  const body = await res.json().catch(() => null)
  return body?.error ?? fallback
}

export function UploadDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // 진행 중인 PUT. 모달을 닫을 때 전부 abort 한다.
  const inFlight = useRef(new Set<XMLHttpRequest>())
  // 진행 중인 배치. abort 만으로는 부족하다 — 이미 전송이 끝난 건의 문서 생성과
  // 아직 시작도 안 한 대기 파일을 못 막는다. 배치 단위로 "그만둔다"를 표시한다.
  const batches = useRef(new Set<UploadBatch>())

  const uploading = items.some((i) => i.status === 'uploading' || i.status === 'pending')
  const finished = items.length > 0 && !uploading

  const update = useCallback((id: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }, [])

  const uploadOne = useCallback(
    async (item: Item, batch: UploadBatch) => {
      const { file } = item
      const contentType = file.type || 'application/octet-stream'
      update(item.id, { status: 'uploading', progress: 0 })

      // 순서와 취소 지점은 lib/upload-flow 가 쥔다. 여기는 네트워크·XHR·화면 갱신만 붙인다.
      const outcome = await runUploadFlow(batch, {
        presign: async () => {
          const res = await fetch('/api/documents/presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, contentType, size: file.size }),
          })
          if (!res.ok) throw new Error(await errorMessage(res, '업로드 준비 실패'))
          return res.json()
        },
        put: ({ url }) =>
          putToS3(
            url,
            file,
            contentType,
            (pct) => update(item.id, { progress: pct }),
            (xhr) => inFlight.current.add(xhr),
            () => batch.cancelled,
          ),
        create: async ({ key, keyToken }) => {
          const res = await fetch('/api/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: titleFromFileName(file.name),
              s3Key: key,
              keyToken,
              fileName: file.name,
              mimeType: contentType,
            }),
          })
          if (!res.ok) throw new Error(await errorMessage(res, '문서 저장 실패'))
        },
      })

      // cancelled 면 아무것도 하지 않는다 — close() 가 목록을 비운다.
      if (outcome.kind === 'done') update(item.id, { status: 'done', progress: 100 })
      if (outcome.kind === 'error') update(item.id, { status: 'error', error: outcome.message })
    },
    [update],
  )

  const addFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return
      const added: Item[] = Array.from(fileList).map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: 'pending',
        progress: 0,
      }))
      setItems((prev) => [...prev, ...added])

      // 동시 업로드 수를 제한해 브라우저 커넥션과 S3 요청이 몰리지 않게 한다.
      const batch = { cancelled: false }
      batches.current.add(batch)

      let cursor = 0
      const worker = async () => {
        // 취소되면 남은 파일은 시작조차 하지 않는다. 예전엔 모달을 닫아도
        // 대기 중이던 파일들이 계속 올라갔다.
        while (!batch.cancelled && cursor < added.length) {
          await uploadOne(added[cursor++], batch)
        }
      }
      void Promise.all(Array.from({ length: MAX_PARALLEL }, worker)).finally(() => {
        batches.current.delete(batch)
      })
    },
    [uploadOne],
  )

  const close = useCallback(() => {
    // 예전엔 uploading 이면 그냥 return 해서 탈출구가 없었다. PUT 이 응답 없이 멈추면
    // onload 도 onerror 도 안 와서 영영 uploading 이고, 새로고침 말고는 방법이 없었다.
    if (uploading && !window.confirm('업로드가 진행 중입니다. 취소하고 닫을까요?')) return

    // 순서가 중요하다. 먼저 배치를 접어야 abort 로 깨어난 흐름이 다음 단계로
    // 넘어가지 않는다.
    batches.current.forEach((b) => (b.cancelled = true))
    batches.current.clear()
    inFlight.current.forEach((xhr) => xhr.abort())
    inFlight.current.clear()

    setOpen(false)
    setItems([])
    // 취소했더라도 그 전에 끝난 것이 있으면 목록에 반영해야 한다.
    router.refresh()
  }, [uploading, router])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const doneCount = items.filter((i) => i.status === 'done').length
  const errorCount = items.filter((i) => i.status === 'error').length

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        <Upload className="h-4 w-4" />
        업로드
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-title"
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-surface shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 id="upload-title" className="text-sm font-bold text-ink">
                문서 업로드
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={uploading ? '업로드 취소하고 닫기' : '닫기'}
                className="rounded-lg p-1 text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  addFiles(e.dataTransfer.files)
                }}
                onClick={() => inputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
                  dragging
                    ? 'border-accent bg-accent-soft'
                    : 'border-border-strong hover:border-accent hover:bg-canvas'
                }`}
              >
                <Upload className="mx-auto mb-2 h-6 w-6 text-ink-subtle" aria-hidden />
                <p className="text-sm font-medium text-ink">파일을 끌어다 놓거나 클릭해서 선택</p>
                <p className="mt-1 text-xs text-ink-muted">
                  여러 개를 한 번에 올릴 수 있습니다 · 파일당 최대 100MB
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </div>

              {items.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {items.map((item) => (
                    <li key={item.id} className="rounded-lg border border-border px-3.5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="shrink-0">
                          {item.status === 'done' && (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          )}
                          {item.status === 'error' && (
                            <AlertCircle className="h-4 w-4 text-danger" />
                          )}
                          {(item.status === 'uploading' || item.status === 'pending') && (
                            <Loader2 className="h-4 w-4 animate-spin text-ink-subtle" />
                          )}
                        </span>
                        <span className="truncate-cell min-w-0 flex-1 text-sm text-ink">
                          {item.file.name}
                        </span>
                        <span className="shrink-0 text-xs text-ink-muted">
                          {formatBytes(item.file.size)}
                        </span>
                      </div>

                      {item.status === 'uploading' && (
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-canvas">
                          <div
                            className="h-full bg-accent transition-[width] duration-150"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      )}
                      {item.error && <p className="mt-1.5 text-xs text-danger">{item.error}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3.5">
              <p className="text-xs text-ink-muted">
                {items.length === 0
                  ? ' '
                  : uploading
                    ? `업로드 중… ${doneCount}/${items.length}`
                    : `완료 ${doneCount}건${errorCount > 0 ? ` · 실패 ${errorCount}건` : ''}`}
              </p>
              <button
                type="button"
                onClick={close}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                {uploading ? '취소' : finished ? '완료' : '닫기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
