'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { formatBytes } from '@/lib/format'
import { runUploadFlow, type UploadBatch } from '@/lib/upload-flow'
import { putToS3 } from '@/lib/upload-xhr'

type Status = 'idle' | 'uploading' | 'done' | 'error'

async function errorMessage(res: Response, fallback: string) {
  const body = await res.json().catch(() => null)
  return body?.error ?? fallback
}

/**
 * 재업로드 모달. 1문서 = 1파일이므로 여러 개를 받지 않는다.
 * 업로드 순서·취소 지점은 lib/upload-flow 가 쥐고, 여기는 네트워크·XHR·화면만 붙인다.
 */
export function VersionUploadDialog({
  documentId,
  title,
  latestVersionNo,
}: {
  documentId: string
  title: string
  latestVersionNo: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [changeNote, setChangeNote] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const inFlight = useRef(new Set<XMLHttpRequest>())
  const batches = useRef(new Set<UploadBatch>())

  const uploading = status === 'uploading'

  const close = useCallback(() => {
    if (uploading && !window.confirm('업로드가 진행 중입니다. 취소하고 닫을까요?')) return

    // 순서가 중요하다. 먼저 배치를 접어야 abort 로 깨어난 흐름이 다음 단계로 넘어가지 않는다.
    batches.current.forEach((b) => (b.cancelled = true))
    batches.current.clear()
    inFlight.current.forEach((xhr) => xhr.abort())
    inFlight.current.clear()

    setOpen(false)
    setFile(null)
    setChangeNote('')
    setStatus('idle')
    setProgress(0)
    setError(null)
    // 취소했더라도 그 전에 새 버전이 들어갔으면 타임라인에 반영해야 한다.
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

  const handleUpload = async () => {
    if (!file) return
    const contentType = file.type || 'application/octet-stream'
    setStatus('uploading')
    setProgress(0)
    setError(null)

    const batch: UploadBatch = { cancelled: false }
    batches.current.add(batch)

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
          (pct) => setProgress(pct),
          (xhr) => inFlight.current.add(xhr),
          () => batch.cancelled,
        ),
      create: async ({ key, keyToken }) => {
        const res = await fetch(`/api/documents/${documentId}/versions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            s3Key: key,
            keyToken,
            fileName: file.name,
            mimeType: contentType,
            changeNote,
          }),
        })
        // 404(그 사이 삭제)·409(동시 재업로드) 는 서버 문구를 그대로 보여준다.
        if (!res.ok) throw new Error(await errorMessage(res, '새 버전을 저장하지 못했습니다.'))
      },
      // 버전이 되지 못한 객체를 서버가 지운다. 지울지 말지는 서버가 참조 수로 정한다.
      discard: async ({ key, keyToken }) => {
        await fetch('/api/uploads/discard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ s3Key: key, keyToken }),
          // 이 요청은 기다려지지 않는다(upload-flow 의 fireDiscard). 취소 직후 탭을
          // 닫거나 화면을 옮기면 브라우저가 끊어 객체가 그대로 남는다.
          // 본문이 수백 바이트라 keepalive 상한(64KB)에 한참 못 미친다.
          keepalive: true,
        }).catch(() => null)
      },
    })

    batches.current.delete(batch)

    // cancelled 면 아무것도 하지 않는다 — close() 가 이미 상태를 비웠다.
    if (outcome.kind === 'done') {
      setStatus('done')
      setProgress(100)
      // 닫지 않고 한 번 더 올릴 수 있다. 갱신하지 않으면 서버 prop 인 latestVersionNo 가
      // 낡아서 버튼이 "v2 로 올리기" 인 채로 v3 를 만든다.
      router.refresh()
    }
    if (outcome.kind === 'error') {
      setStatus('error')
      setError(outcome.message)
    }
  }

  const handlePick = (fileList: FileList | null) => {
    const picked = fileList?.[0]
    if (!picked) return
    setFile(picked)
    setStatus('idle')
    setError(null)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        <Upload className="h-4 w-4" />
        새 버전 올리기
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
            aria-labelledby="version-upload-title"
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-surface shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 id="version-upload-title" className="truncate-cell text-sm font-semibold text-ink">
                새 버전 올리기 — {title}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={uploading ? '업로드 취소하고 닫기' : '닫기'}
                className="ml-3 shrink-0 rounded-lg p-1 text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
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
                  handlePick(e.dataTransfer.files)
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
                  한 문서에는 파일 하나만 붙습니다 · 최대 100MB
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    handlePick(e.target.files)
                    e.target.value = ''
                  }}
                />
              </div>

              {file && (
                <div className="mt-4 rounded-lg border border-border px-3.5 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="shrink-0">
                      {status === 'done' && <CheckCircle2 className="h-4 w-4 text-success" />}
                      {status === 'error' && <AlertCircle className="h-4 w-4 text-danger" />}
                      {status === 'uploading' && (
                        <Loader2 className="h-4 w-4 animate-spin text-ink-subtle" />
                      )}
                      {status === 'idle' && <Upload className="h-4 w-4 text-ink-subtle" />}
                    </span>
                    <span className="truncate-cell min-w-0 flex-1 text-sm text-ink">
                      {file.name}
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {formatBytes(file.size)}
                    </span>
                  </div>
                  {status === 'uploading' && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-canvas">
                      <div
                        className="h-full bg-accent transition-[width] duration-150"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                  {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
                </div>
              )}

              <label className="mt-4 block">
                <span className="text-xs font-medium text-ink-muted">변경 메모 (선택)</span>
                <textarea
                  value={changeNote}
                  maxLength={500}
                  rows={2}
                  disabled={uploading}
                  placeholder="무엇을 바꿨는지 적어 두면 타임라인에서 보입니다."
                  onChange={(e) => setChangeNote(e.target.value)}
                  className="mt-1 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent disabled:opacity-60"
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3.5">
              <p className="text-xs text-ink-muted">
                {status === 'done' ? '새 버전을 올렸습니다.' : ' '}
              </p>
              <div className="flex items-center gap-2">
                {status !== 'done' && (
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={!file || uploading}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                  >
                    {/* 표시용이다. 실제 번호는 서버가 정한다 — 그 사이 남이 올리면 달라진다. */}
                    {uploading ? '업로드 중…' : `v${latestVersionNo + 1} 로 올리기`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg px-3.5 py-2 text-sm text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
                >
                  {uploading ? '취소' : status === 'done' ? '완료' : '닫기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
