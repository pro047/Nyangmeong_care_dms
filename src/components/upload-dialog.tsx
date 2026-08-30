'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatBytes } from '@/lib/format'
import { runUploadFlow, type UploadBatch } from '@/lib/upload-flow'
import { putToS3 } from '@/lib/upload-xhr'
import {
  buildFolderTree,
  flattenFolderTree,
  folderNameError,
  type FolderAliasRow,
} from '@/lib/folder'
import { classifyFileName, type ClassifyResult } from '@/lib/classify'
import { titleFromFileName } from '@/lib/title'
import {
  createPlannedFolders,
  defaultDestination,
  emptyCreatedFolders,
  findExistingFolderByName,
  plannedFolderNames,
  resolveDestination,
  type Destination,
  type FolderCreateOutcome,
} from '@/lib/classify-plan'

type ItemStatus = 'pending' | 'uploading' | 'done' | 'error'

type Item = {
  id: string
  file: File
  status: ItemStatus
  progress: number
  error?: string
  /** 자동 분류 모드에서만 채운다. */
  result?: ClassifyResult
  dest?: Destination
  /** 개별 셀렉트로 직접 고른 건은 "만들지 않음" 체크가 덮지 않는다. */
  destTouched?: boolean
}

const MAX_PARALLEL = 3

/** 모드 셀렉트의 값. 폴더 id 와도 미분류('')와도 겹치지 않아야 한다. */
const AUTO = '__auto__'
/** 목적지 셀렉트에서 "새 폴더"를 고른 값. */
const NEW_FOLDER = '__new__'

async function errorMessage(res: Response, fallback: string) {
  const body = await res.json().catch(() => null)
  return body?.error ?? fallback
}

export function UploadDialog({
  defaultFolderId,
  folders,
}: {
  defaultFolderId: string | null
  folders: FolderAliasRow[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  // AUTO 는 자동 분류, '' 는 미분류. 지금 열어 둔 폴더가 있으면 그것이 기본값이다.
  const [mode, setMode] = useState(defaultFolderId ?? AUTO)
  // 미리보기에서 "새 폴더 생성"을 통째로 끈 상태.
  const [skipNew, setSkipNew] = useState(false)
  // 자동 모드에서 업로드 시작 버튼을 눌렀는지. 누르기 전까지는 아무것도 만들지 않는다.
  const [started, setStarted] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // 진행 중인 PUT. 모달을 닫을 때 전부 abort 한다.
  const inFlight = useRef(new Set<XMLHttpRequest>())
  // 진행 중인 배치. abort 만으로는 부족하다 — 이미 전송이 끝난 건의 문서 생성과
  // 아직 시작도 안 한 대기 파일을 못 막는다. 배치 단위로 "그만둔다"를 표시한다.
  const batches = useRef(new Set<UploadBatch>())

  const folderOptions = useMemo(() => flattenFolderTree(buildFolderTree(folders)), [folders])
  const folderNameById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder.name])),
    [folders],
  )

  // 폴더가 하나도 없으면 자동 모드는 조용히 미분류 업로드로 동작한다 (사양).
  const autoPreview = mode === AUTO && folders.length > 0
  const previewing = autoPreview && !started && items.length > 0

  const uploading =
    !previewing && items.some((i) => i.status === 'uploading' || i.status === 'pending')
  const finished = !previewing && items.length > 0 && !uploading

  const update = useCallback((id: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }, [])

  const uploadOne = useCallback(
    async (item: Item, batch: UploadBatch, folderId: string | null) => {
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
              // 서버 스키마는 처음부터 folderId 를 받았다. 미분류는 키 자체를 뺀다.
              ...(folderId ? { folderId } : {}),
              s3Key: key,
              keyToken,
              fileName: file.name,
              mimeType: contentType,
            }),
          })
          if (!res.ok) throw new Error(await errorMessage(res, '문서 저장 실패'))
        },
        // 문서가 되지 못한 객체를 서버가 지운다. 결과는 보지 않는다 — 지울지 말지는
        // 서버가 참조 수로 정하고, 실패해도 사용자에게 알릴 것이 없다.
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

      // cancelled 면 아무것도 하지 않는다 — close() 가 목록을 비운다.
      if (outcome.kind === 'done') update(item.id, { status: 'done', progress: 100 })
      if (outcome.kind === 'error') update(item.id, { status: 'error', error: outcome.message })

      return outcome
    },
    [update],
  )

  /** 문서가 하나도 안 들어간 자동 생성 폴더를 지운다. 취소도 전건 실패도 이 규칙 하나로 덮인다. */
  const cleanupCreatedFolders = useCallback(
    async (createdIds: string[], usedFolderIds: string[]) => {
      for (const id of emptyCreatedFolders(createdIds, usedFolderIds)) {
        await fetch(`/api/folders/${id}`, { method: 'DELETE' }).catch(() => null)
      }
      router.refresh()
    },
    [router],
  )

  const runBatch = useCallback(
    (batch: UploadBatch, jobs: { item: Item; folderId: string | null }[], createdIds: string[]) => {
      // 문서가 실제로 들어간 폴더. React state 가 아니라 이 클로저에 둬야 한다 —
      // close() 가 items 를 비운 뒤에도 settle 시점에 정확한 수가 필요하다.
      const usedFolderIds: string[] = []

      let cursor = 0
      const worker = async () => {
        // 취소되면 남은 파일은 시작조차 하지 않는다. 예전엔 모달을 닫아도
        // 대기 중이던 파일들이 계속 올라갔다.
        while (!batch.cancelled && cursor < jobs.length) {
          const job = jobs[cursor++]
          const outcome = await uploadOne(job.item, batch, job.folderId)
          if (outcome.kind === 'done' && job.folderId) usedFolderIds.push(job.folderId)
        }
      }
      void Promise.all(Array.from({ length: MAX_PARALLEL }, worker)).finally(() => {
        batches.current.delete(batch)
        if (createdIds.length > 0) void cleanupCreatedFolders(createdIds, usedFolderIds)
      })
    },
    [uploadOne, cleanupCreatedFolders],
  )

  const addFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return

      const added: Item[] = Array.from(fileList).map((file) => {
        const result = autoPreview ? classifyFileName(file.name, folders) : undefined
        return {
          id: crypto.randomUUID(),
          file,
          status: 'pending' as const,
          progress: 0,
          result,
          dest: result ? defaultDestination(result) : undefined,
        }
      })
      setItems((prev) => [...prev, ...added])

      // 자동 모드는 여기서 올리지 않는다. 조용히 배정하지 않는 것이 이 기능의 전제라
      // 사람이 미리보기를 확인하고 시작 버튼을 눌러야 시작한다.
      if (autoPreview) return

      // 동시 업로드 수를 제한해 브라우저 커넥션과 S3 요청이 몰리지 않게 한다.
      const batch: UploadBatch = { cancelled: false }
      batches.current.add(batch)
      const folderId = mode === AUTO || mode === '' ? null : mode
      runBatch(
        batch,
        added.map((item) => ({ item, folderId })),
        [],
      )
    },
    [autoPreview, folders, mode, runBatch],
  )

  /** 화면에 보이는 목적지. "만들지 않음"은 직접 고르지 않은 제안 건에만 걸린다. */
  const effectiveDest = useCallback(
    (item: Item): Destination => {
      if (!item.dest) return { kind: 'none' }
      if (skipNew && item.dest.kind === 'new' && !item.destTouched) return { kind: 'none' }
      return item.dest
    },
    [skipNew],
  )

  const createFolder = useCallback(async (name: string): Promise<FolderCreateOutcome> => {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 파일명에 상위 폴더를 추론할 신호가 없다. 자동 생성은 전부 루트이고 별칭도 없다.
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const body = (await res.json()) as { id: string }
      return { ok: true, id: body.id }
    }
    return { ok: false, conflict: res.status === 409 }
  }, [])

  const startAuto = useCallback(async () => {
    // 확정 시점의 목록을 붙잡아 둔다. 시작 뒤 화면이 바뀌어도 보낼 것은 이것이다.
    const jobItems = items
    // 사람이 고친 이름이 기존 폴더와 같으면 새로 만들지 않고 그리로 보낸다. trim 은
    // 여기서 해야 한다 — 서버 스키마가 trim 하므로 안 하면 plannedFolderNames 의 표기와
    // 실제로 생긴 폴더 이름이 어긋난다.
    const dests = jobItems.map(effectiveDest).map((dest): Destination => {
      if (dest.kind !== 'new') return dest
      const existingId = findExistingFolderByName(dest.name, folders)
      return existingId !== null
        ? { kind: 'folder', folderId: existingId }
        : { kind: 'new', name: dest.name.trim() }
    })

    setStarted(true)
    setPreparing(true)

    // 폴더 생성 중에 닫힐 수 있으므로 배치를 먼저 등록한다.
    const batch: UploadBatch = { cancelled: false }
    batches.current.add(batch)

    const names = plannedFolderNames(dests)
    const created = await createPlannedFolders(names, createFolder)
    const createdIds = Array.from(created.values()).filter((id): id is string => id !== null)
    setPreparing(false)

    if (batch.cancelled) {
      batches.current.delete(batch)
      // 방금 만든 폴더에는 아직 아무것도 안 들어갔다.
      if (createdIds.length > 0) void cleanupCreatedFolders(createdIds, [])
      return
    }

    const missing = names.length - createdIds.length
    if (missing > 0) {
      toast.error(`새 폴더 ${missing}개를 만들지 못했습니다. 해당 문서는 미분류로 올립니다.`)
    }

    runBatch(
      batch,
      jobItems.map((item, i) => ({ item, folderId: resolveDestination(dests[i], created) })),
      createdIds,
    )
  }, [items, effectiveDest, folders, createFolder, cleanupCreatedFolders, runBatch])

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
    setStarted(false)
    setSkipNew(false)
    setPreparing(false)
    // 다음에 열 때는 지금 보고 있는 폴더가 다시 기본값이어야 한다.
    setMode(defaultFolderId ?? AUTO)
    // 취소했더라도 그 전에 끝난 것이 있으면 목록에 반영해야 한다.
    router.refresh()
  }, [uploading, router, defaultFolderId])

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

  const rows = previewing ? items.map((item) => ({ item, dest: effectiveDest(item) })) : []
  const toFolder = rows.filter((r) => r.dest.kind === 'folder')
  const toNew = rows.filter((r) => r.dest.kind === 'new')
  const toNone = rows.filter((r) => r.dest.kind === 'none')
  const hasProposal = items.some((i) => i.result?.kind === 'propose')
  const invalidNameCount = toNew.filter(
    (r) => r.dest.kind === 'new' && folderNameError(r.dest.name) !== null,
  ).length

  const changeDest = (item: Item, value: string) => {
    const proposed = item.result?.kind === 'propose' ? item.result.proposedName : null
    const dest: Destination =
      value === NEW_FOLDER && proposed !== null
        ? { kind: 'new', name: proposed }
        : value === ''
          ? { kind: 'none' }
          : { kind: 'folder', folderId: value }
    update(item.id, { dest, destTouched: true })
  }

  const destValue = (dest: Destination) =>
    dest.kind === 'new' ? NEW_FOLDER : dest.kind === 'folder' ? dest.folderId : ''

  /**
   * 새 폴더 이름 편집칸. 제안 이름은 카테고리가 아니라 문서 제목으로 나오는 일이 잦은데
   * 파일명만으로는 그 둘을 가릴 신호가 없다 — 사람이 여기서 고치는 것이 유일한 해법이다.
   * 고친 행은 destTouched 로 표시해 "만들지 않음" 체크가 덮지 않게 한다(셀렉트와 같은 의미론).
   */
  const renderNameEditor = (item: Item, name: string) => {
    const error = folderNameError(name)
    const existingId = error === null ? findExistingFolderByName(name, folders) : null
    const existingName = existingId === null ? undefined : folderNameById.get(existingId)

    return (
      <div className="mt-2">
        <input
          type="text"
          value={name}
          maxLength={100}
          aria-label={`${item.file.name} 새 폴더 이름`}
          onChange={(e) =>
            update(item.id, { dest: { kind: 'new', name: e.target.value }, destTouched: true })
          }
          className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent"
        />
        {error !== null && <p className="mt-1 text-xs text-danger">{error}</p>}
        {/* 힌트만 보여주고 행을 "기존 폴더" 그룹으로 옮기지는 않는다 — 타이핑 중에 행이
            그룹 사이를 움직이면 입력칸이 unmount 되어 포커스를 잃는다. */}
        {existingName !== undefined && (
          <p className="mt-1 text-xs text-ink-muted">
            기존 폴더 &lsquo;{existingName}&rsquo;와 같아 그 폴더로 들어갑니다
          </p>
        )}
      </div>
    )
  }

  const renderPreviewGroup = (
    title: string,
    group: { item: Item; dest: Destination }[],
    extra?: React.ReactNode,
  ) => (
    <section className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-ink">
          {title} <span className="text-ink-muted">{group.length}건</span>
        </h3>
        {extra}
      </div>
      {group.length > 0 && (
        <ul className="mt-2 space-y-2">
          {group.map(({ item, dest }) => (
            <li key={item.id} className="rounded-lg border border-border px-3.5 py-2.5">
              <p className="truncate-cell text-sm text-ink">{item.file.name}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{item.result?.reason}</p>
              <select
                value={destValue(dest)}
                aria-label={`${item.file.name} 저장할 폴더`}
                onChange={(e) => changeDest(item, e.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-surface py-1.5 pr-8 pl-2.5 text-xs text-ink outline-none focus:border-accent"
              >
                {item.result?.kind === 'propose' && (
                  // proposedName 은 담는 순간 고정된다. 편집칸이 dest.name 을 바꾸므로
                  // 그걸 그대로 쓰면 라벨만 옛 제안에 남아 같은 행이 두 이름을 말한다.
                  <option value={NEW_FOLDER}>
                    새 폴더 &lsquo;{dest.kind === 'new' ? dest.name : item.result.proposedName}
                    &rsquo;
                  </option>
                )}
                <option value="">— (미분류)</option>
                {folderOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {'　'.repeat(option.depth)}
                    {option.name}
                  </option>
                ))}
              </select>
              {dest.kind === 'new' && renderNameEditor(item, dest.name)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )

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
              <h2 id="upload-title" className="text-sm font-semibold text-ink">
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

            {/* 스크롤 영역 **바깥**에 둔다. CSS sticky 가 아니라 구조라 깨질 방법이 없다 —
                이 화면의 결정은 "이 배분이 이래도 되는가"이고 그 답이 이 건수다. */}
            {previewing && (
              <div className="border-b border-border bg-canvas px-5 py-2 text-xs text-ink-muted">
                기존 {toFolder.length} · 새 폴더 {toNew.length} · 미분류 {toNone.length}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {/* 조용히 배정하면 "왜 여기 올라갔지"가 된다. 자동 분류에서는 미리보기가 그
                  역할을 이어받는다. 파일을 담은 뒤에 잠그는 이유는 바뀌었다 — 이제
                  "한 배치 한 폴더" 보호가 아니라, 배치의 분류 방식이 담는 순간 정해지기
                  때문이다. 바꾸려면 닫고 다시 연다. */}
              {previewing ? (
                // 어차피 disabled 라 조작할 수 없는 66px 이다. 그 세로를 판단 대상(행)에 넘긴다.
                <p className="mb-3 text-xs text-ink-muted">저장할 폴더: 자동 분류</p>
              ) : (
              <div className="mb-3">
                <label htmlFor="upload-folder" className="text-xs font-medium text-ink">
                  저장할 폴더
                </label>
                <select
                  id="upload-folder"
                  value={mode}
                  disabled={items.length > 0}
                  onChange={(e) => setMode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface py-2 pr-8 pl-3 text-sm text-ink outline-none focus:border-accent disabled:opacity-60"
                >
                  <option value={AUTO}>자동 분류 (파일명으로 정함)</option>
                  <option value="">— (미분류)</option>
                  {folderOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {/* 전각 공백으로 깊이를 표시한다 — option 안에서는 CSS 들여쓰기가 먹지 않는다. */}
                      {'　'.repeat(option.depth)}
                      {option.name}
                    </option>
                  ))}
                </select>
                {mode === AUTO && folders.length === 0 && (
                  <p className="mt-1.5 text-xs text-ink-muted">
                    폴더가 없어 전부 미분류로 올라갑니다.
                  </p>
                )}
              </div>
              )}

              {/* 드롭존 밖에 둔다 — 미리보기에서는 한 줄 버튼이 이 input 을 대신 연다. */}
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

              {/* 자동 모드는 배치가 하나뿐이어야 취소 정리가 단순해진다. 시작 뒤에는 못 담는다. */}
              {!(autoPreview && started) &&
                (previewing ? (
                  // 미리보기에서는 판단 대상인 행이 세로를 가져가야 한다. 140px 드롭존을
                  // 한 줄로 접되 파일 추가 자체는 남긴다 — 시작 전에 더 담을 수 있어야 한다(사양).
                  <button
                    type="button"
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
                    className={`w-full rounded-lg border border-dashed py-1.5 text-center text-xs transition-colors ${
                      dragging
                        ? 'border-accent bg-accent-soft text-ink'
                        : 'border-border-strong text-ink-muted hover:border-accent hover:bg-canvas hover:text-ink'
                    }`}
                  >
                    + 파일 더 담기 (끌어다 놓아도 됩니다)
                  </button>
                ) : (
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
                    <p className="text-sm font-medium text-ink">
                      파일을 끌어다 놓거나 클릭해서 선택
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      여러 개를 한 번에 올릴 수 있습니다 · 파일당 최대 100MB
                    </p>
                  </div>
                ))}

              {previewing && (
                <>
                  {renderPreviewGroup('기존 폴더로 이동', toFolder)}
                  {renderPreviewGroup(
                    '새 폴더 생성 후 이동',
                    toNew,
                    hasProposal ? (
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
                        <input
                          type="checkbox"
                          checked={skipNew}
                          onChange={(e) => setSkipNew(e.target.checked)}
                          className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                        />
                        만들지 않음
                      </label>
                    ) : undefined,
                  )}
                  {renderPreviewGroup('미분류', toNone)}
                </>
              )}

              {!previewing && items.length > 0 && (
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
              <p className={`text-xs ${invalidNameCount > 0 ? 'text-danger' : 'text-ink-muted'}`}>
                {previewing
                  ? invalidNameCount > 0
                    ? `새 폴더 이름 ${invalidNameCount}건을 고쳐야 시작할 수 있습니다`
                    : `${items.length}건 · 올리기 전에 확인하세요`
                  : items.length === 0
                    ? ' '
                    : uploading
                      ? `업로드 중… ${doneCount}/${items.length}`
                      : `완료 ${doneCount}건${errorCount > 0 ? ` · 실패 ${errorCount}건` : ''}`}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={close}
                  className={
                    previewing
                      ? 'rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas'
                      : 'rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover'
                  }
                >
                  {previewing ? '취소' : uploading ? '취소' : finished ? '완료' : '닫기'}
                </button>
                {previewing && (
                  <button
                    type="button"
                    disabled={preparing || invalidNameCount > 0}
                    onClick={() => void startAuto()}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
                  >
                    업로드 시작
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
