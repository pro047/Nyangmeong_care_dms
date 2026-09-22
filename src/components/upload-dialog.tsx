'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, X, CheckCircle2, AlertCircle, Loader2, GitBranch } from 'lucide-react'
import { toast } from 'sonner'
import { formatBytes } from '@/lib/format'
import { runUploadFlow, type UploadBatch } from '@/lib/upload-flow'
import { putToS3 } from '@/lib/upload-xhr'
import {
  buildFolderTree,
  flattenFolderTree,
  folderNameError,
  folderPath,
  type FolderAliasRow,
} from '@/lib/folder'
import { classifyFileName, type ClassifyResult } from '@/lib/classify'
import { titleFromFileName } from '@/lib/title'
import {
  attachDefault,
  attachVersionWarning,
  uploadTarget,
  type AttachDefault,
  type UploadTarget,
} from '@/lib/attach-plan'
import { findSimilarDocuments, type SimilarCandidate } from '@/lib/similar-document'
import type { DeletePermission } from '@/lib/ownership'
import {
  createPlannedFolders,
  defaultDestination,
  emptyCreatedFolders,
  findExistingFolderByName,
  plannedFolders,
  resolveDestination,
  type Destination,
  type FolderCreateOutcome,
} from '@/lib/classify-plan'

// 'waiting' 는 후보가 잡혀 사람의 선택을 기다리는 상태다. 'pending' 과 나누는 이유는
// 화면 문구와 close() 의 확인 프롬프트가 "올라가는 중"과 "아직 안 올라감"을 갈라야 해서다.
type ItemStatus = 'waiting' | 'pending' | 'uploading' | 'done' | 'error'

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
  /**
   * 새 판으로 붙일 문서 선택. **`undefined` 는 "아직 안 골랐다"이지 "새 문서로
   * 올리기"가 아니다** (2026-09-20) — 기본값을 여기 저장하지 않고 `decisionFor` +
   * `resolveAttachTo` 로 그때그때 파생시킨다. 목적지 폴더가 바뀌면 후보도 기본값도
   * 같이 바뀌기 때문이다. 사람이 명시적으로 고르면 후보 id 또는 `NEW_DOCUMENT`
   * (새 문서로 올리기)가 들어간다 — 붙이기는 되돌릴 수 없으니 그 뒤로는 파생값에
   * 밀리지 않는다.
   */
  attachTo?: string
  /** 수동 모드에서 attachDefault 가 'none'·'auto' 로 판정해 기다리지 않고 곧장 올릴 때만
      addFiles 가 채운다. 실제 업로드 대상은 이 값 하나로 고정된다. */
  initialTarget?: UploadTarget
  /** initialTarget 이 'attach' 였던 건의 안내 문구. 어디에 붙었는지 올린 뒤에도 보이게 한다. */
  attachedLabel?: string
}

const MAX_PARALLEL = 3

/** 모드 셀렉트의 값. 폴더 id 와도 미분류('')와도 겹치지 않아야 한다. */
const AUTO = '__auto__'
/** 목적지 셀렉트에서 "새 폴더"를 고른 값. */
const NEW_FOLDER = '__new__'
/** 붙이기 셀렉트에서 "새 문서로 올리기"를 명시적으로 고른 값. 후보 id(cuid)와 겹치지
    않는다. 빈 문자열('')은 여기 쓰지 않는다 — ask 미선택(placeholder)과 구분해야 한다. */
const NEW_DOCUMENT = '__new_document__'

async function errorMessage(res: Response, fallback: string) {
  const body = await res.json().catch(() => null)
  return body?.error ?? fallback
}

export function UploadDialog({
  defaultFolderId,
  folders,
  candidates,
  permission,
}: {
  defaultFolderId: string | null
  folders: FolderAliasRow[]
  /** 활성 문서 전량의 최소 정보. 판정은 findSimilarDocuments 가 폴더·키·소유자로 좁힌다. */
  candidates: SimilarCandidate[]
  permission: DeletePermission
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

  // 선택을 기다리는 건은 "업로드 중"이 아니다 — 아직 아무것도 안 나갔다.
  const waitingCount = items.filter((i) => i.status === 'waiting').length
  const uploading =
    !previewing && items.some((i) => i.status === 'uploading' || i.status === 'pending')
  const finished = !previewing && items.length > 0 && !uploading && waitingCount === 0

  const update = useCallback((id: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }, [])

  // 아직 아무것도 안 나간 건(미리보기·선택 대기)에만 버튼을 단다. 목록에서 빼는 것으로
  // 끝난다 — 예전엔 하나만 잘못 담아도 전부 취소하고 다시 담아야 했다.
  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const renderRemoveButton = (item: Item) => (
    <button
      type="button"
      onClick={() => removeItem(item.id)}
      aria-label={`${item.file.name} 목록에서 빼기`}
      className="shrink-0 rounded-lg p-1 text-ink-subtle transition-colors hover:bg-danger-soft hover:text-danger"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  )

  /**
   * 이 파일을 새 판으로 붙일 만한 기존 문서들. 목적지 폴더가 정해져야 판정할 수 있다 —
   * 미분류(null)와 아직 없는 새 폴더는 원리상 후보가 없다(findSimilarDocuments 가 거른다).
   */
  const candidatesFor = useCallback(
    (fileName: string, folderId: string | null) =>
      findSimilarDocuments(fileName, folderId, candidates, permission),
    [candidates, permission],
  )

  /** 이 모달에 함께 담긴 다른 항목들의 파일명. 병렬 업로드(MAX_PARALLEL) 중 도착
      순서가 뒤집히는 사고를 막으려면 폴더·목적지와 무관하게 전부 본다
      (attach-plan.ts 의 attachDefault 참고). **끝난(done) 항목도 남긴다** — `candidates`
      는 모달을 닫을 때까지 갱신되지 않아서(router.refresh 는 close 에 있다), v0.8 을
      올린 뒤 같은 모달에 v0.7 을 담으면 옛 후보(v0.6)와 비교해 자동으로 붙고 v0.7 이
      최신이 된다. 실패(error)한 항목은 붙은 적이 없으니 뺀다. */
  const batchSiblingNames = useCallback(
    (selfId: string) =>
      items.filter((i) => i.id !== selfId && i.status !== 'error').map((i) => i.file.name),
    [items],
  )

  /** 이 항목의 기본 판정(none/auto/ask). 목적지 폴더가 바뀌면 후보도 판정도 같이 바뀐다. */
  const decisionFor = useCallback(
    (item: Item, folderId: string | null): AttachDefault =>
      attachDefault(item.file.name, candidatesFor(item.file.name, folderId), batchSiblingNames(item.id)),
    [candidatesFor, batchSiblingNames],
  )

  /** 사람이 아직 건드리지 않은 항목의 실효 선택. auto 면 그 후보로, 그 외(none·ask)는
      미선택('')으로 파생시킨다 — 기본값을 state 에 저장하지 않는 이유가 이것이다. */
  const resolveAttachTo = useCallback(
    (item: Item, decision: AttachDefault): string =>
      item.attachTo ?? (decision.kind === 'auto' ? decision.documentId : ''),
    [],
  )

  const uploadOne = useCallback(
    async (item: Item, batch: UploadBatch, target: UploadTarget) => {
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
        // 여기서만 두 갈래다. 앞 단계(presign·PUT)는 대상과 무관하게 같은 객체를 올리므로
        // 갈래를 create 로 미룬다 — presign 이 문서 id 를 알 필요가 없다.
        create: async ({ key, keyToken }) => {
          const res =
            target.kind === 'attach'
              ? await fetch(`/api/documents/${target.documentId}/versions`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  // 폴더·제목을 안 보낸다. 붙이는 쪽의 folderId 는 그 문서 것이고,
                  // 제목은 서버의 retitleOnReupload 가 정한다 (사람이 고친 제목은 안 덮는다).
                  body: JSON.stringify({
                    s3Key: key,
                    keyToken,
                    fileName: file.name,
                    mimeType: contentType,
                  }),
                })
              : await fetch('/api/documents', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    title: titleFromFileName(file.name),
                    // 서버 스키마는 처음부터 folderId 를 받았다. 미분류는 키 자체를 뺀다.
                    ...(target.folderId ? { folderId: target.folderId } : {}),
                    s3Key: key,
                    keyToken,
                    fileName: file.name,
                    mimeType: contentType,
                  }),
                })
          if (!res.ok) {
            throw new Error(
              await errorMessage(
                res,
                target.kind === 'attach' ? '새 버전을 저장하지 못했습니다.' : '문서 저장 실패',
              ),
            )
          }
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
    (batch: UploadBatch, jobs: { item: Item; target: UploadTarget }[], createdIds: string[]) => {
      // 문서가 실제로 들어간 폴더. React state 가 아니라 이 클로저에 둬야 한다 —
      // close() 가 items 를 비운 뒤에도 settle 시점에 정확한 수가 필요하다.
      const usedFolderIds: string[] = []

      let cursor = 0
      const worker = async () => {
        // 취소되면 남은 파일은 시작조차 하지 않는다. 예전엔 모달을 닫아도
        // 대기 중이던 파일들이 계속 올라갔다.
        while (!batch.cancelled && cursor < jobs.length) {
          const job = jobs[cursor++]
          const outcome = await uploadOne(job.item, batch, job.target)
          // 붙이기는 폴더를 새로 쓰지 않는다 — 그 문서가 이미 들어 있는 폴더다.
          if (outcome.kind === 'done' && job.target.kind === 'new' && job.target.folderId) {
            usedFolderIds.push(job.target.folderId)
          }
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

      const folderId = mode === AUTO || mode === '' ? null : mode
      const incoming = Array.from(fileList)
      const incomingNames = incoming.map((file) => file.name)
      // 이미 담겨 있는 항목의 파일명(끝난 것 포함 — batchSiblingNames 와 같은 이유).
      // 지금 담는 파일들은 아직 items state 에 없어 그 헬퍼를 그대로 쓸 수 없다.
      const inFlightNames = items.filter((i) => i.status !== 'error').map((i) => i.file.name)

      const added: Item[] = incoming.map((file, idx) => {
        // 자동 모드는 목적지가 미리보기에서 정해지므로 여기서는 후보를 판정하지 않는다 —
        // 시작 버튼을 눌러야 폴더가 확정되고, 그때(startAuto) 다시 판정한다.
        if (autoPreview) {
          const result = classifyFileName(file.name, folders)
          return {
            id: crypto.randomUUID(),
            file,
            status: 'pending' as const,
            progress: 0,
            result,
            dest: result ? defaultDestination(result) : undefined,
          }
        }

        const found = candidatesFor(file.name, folderId)
        const others = [...inFlightNames, ...incomingNames.filter((_, i2) => i2 !== idx)]
        const decision = attachDefault(file.name, found, others)

        // ask 는 지금처럼 사람의 선택을 기다린다.
        if (decision.kind === 'ask') {
          return { id: crypto.randomUUID(), file, status: 'waiting' as const, progress: 0 }
        }

        // none · auto 는 기다리지 않고 곧장 올린다 — auto 는 후보 1건 + 버전이 엄격히
        // 높을 때만이라 사람에게 물을 것이 없다(attach-plan.ts).
        if (decision.kind === 'none') {
          return {
            id: crypto.randomUUID(),
            file,
            status: 'pending' as const,
            progress: 0,
            initialTarget: { kind: 'new', folderId },
          }
        }

        const target = found.find((c) => c.id === decision.documentId)
        return {
          id: crypto.randomUUID(),
          file,
          status: 'pending' as const,
          progress: 0,
          initialTarget: { kind: 'attach', documentId: decision.documentId },
          attachedLabel: target
            ? `‘${target.latestFileName}’ 의 새 버전으로 올렸습니다`
            : undefined,
        }
      })
      setItems((prev) => [...prev, ...added])

      // 자동 모드는 여기서 올리지 않는다. 조용히 배정하지 않는 것이 이 기능의 전제라
      // 사람이 미리보기를 확인하고 시작 버튼을 눌러야 시작한다.
      if (autoPreview) return

      // initialTarget 이 있는 건(none·auto)만 붙잡는다. 나머지(ask → waiting)는 사람의
      // 선택을 기다린다 — 후보 없는 평범한 업로드에까지 클릭을 하나 더 붙이지 않는 것이
      // 이 화면의 전제다.
      const jobs = added.filter(
        (item): item is Item & { initialTarget: UploadTarget } => item.initialTarget !== undefined,
      )
      if (jobs.length === 0) return

      // 동시 업로드 수를 제한해 브라우저 커넥션과 S3 요청이 몰리지 않게 한다.
      const batch: UploadBatch = { cancelled: false }
      batches.current.add(batch)
      runBatch(
        batch,
        jobs.map((item) => ({ item, target: item.initialTarget })),
        [],
      )
    },
    [autoPreview, candidatesFor, folders, items, mode, runBatch],
  )

  /** 붙잡아 둔 건을 사람이 고른 대로 올린다. 수동 모드에만 있다(자동은 startAuto 가 겸한다). */
  const handleStartWaiting = useCallback(() => {
    const folderId = mode === AUTO || mode === '' ? null : mode
    const jobs = items.filter((item) => item.status === 'waiting')
    if (jobs.length === 0) return

    // 버튼이 비활성일 때만 막지 않는다(2026-09-20) — 미선택 ask 가 섞여 들어오면
    // uploadTarget('', ...) 이 어떤 후보 id 와도 안 겹쳐 조용히 새 문서로 떨어진다.
    const unresolved = jobs.some((item) => {
      const decision = decisionFor(item, folderId)
      return decision.kind === 'ask' && resolveAttachTo(item, decision) === ''
    })
    if (unresolved) return

    const batch: UploadBatch = { cancelled: false }
    batches.current.add(batch)
    // 선택 UI 를 먼저 걷는다. MAX_PARALLEL 때문에 뒤쪽 건은 실제 시작이 늦는데,
    // 그 사이에 셀렉트가 살아 있으면 이미 확정된 선택을 바꿀 수 있는 것처럼 보인다.
    setItems((prev) =>
      prev.map((item) => (item.status === 'waiting' ? { ...item, status: 'pending' } : item)),
    )
    runBatch(
      batch,
      jobs.map((item) => {
        const attachTo = resolveAttachTo(item, decisionFor(item, folderId))
        return {
          item,
          target: uploadTarget(attachTo, folderId, candidatesFor(item.file.name, folderId)),
        }
      }),
      [],
    )
  }, [items, mode, candidatesFor, decisionFor, resolveAttachTo, runBatch])

  /** 화면에 보이는 목적지. "만들지 않음"은 직접 고르지 않은 제안 건에만 걸린다. */
  const effectiveDest = useCallback(
    (item: Item): Destination => {
      if (!item.dest) return { kind: 'none' }
      if (skipNew && item.dest.kind === 'new' && !item.destTouched) return { kind: 'none' }
      return item.dest
    },
    [skipNew],
  )

  const createFolder = useCallback(
    async (parentId: string | null, name: string): Promise<FolderCreateOutcome> => {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // parentId 는 카테고리로 매칭된 **기존** 루트 폴더뿐이다. 별칭은 자동으로 안 붙인다.
        body: JSON.stringify(parentId === null ? { name } : { name, parentId }),
      })
      if (res.ok) {
        const body = (await res.json()) as { id: string }
        return { ok: true, id: body.id }
      }
      return { ok: false, conflict: res.status === 409 }
    },
    [],
  )

  /** 새 폴더 행의 라벨. 2뎁스면 경로로 보여야 어느 카테고리 밑인지 알 수 있다. */
  const newFolderLabel = useCallback(
    (parentId: string | null, name: string) => {
      if (parentId === null) return name
      const parent = folderPath(parentId, folders)
      return parent === '' ? name : `${parent} > ${name}`
    },
    [folders],
  )

  /**
   * 붙이기 후보를 찾을 폴더. **새 폴더 이름이 기존 폴더와 같으면 그 폴더다** — startAuto 가
   * 그 폴더로 흡수하기 때문이다. 미리보기와 startAuto 가 이 함수 하나를 봐야 한다: 미리보기만
   * `dest.kind === 'folder'` 로 판정하면 화면은 후보 없음(셀렉트 없음)인데 시작 시점엔 후보가
   * 생겨, ask 면 버튼이 아무 말 없이 멈추고 auto 면 사람이 본 적 없는 선택으로 붙는다
   * (2026-09-22 코드 리뷰).
   */
  const attachFolderId = useCallback(
    (dest: Destination): string | null => {
      if (dest.kind === 'folder') return dest.folderId
      if (dest.kind === 'new') return findExistingFolderByName(dest.name, dest.parentId, folders)
      return null
    },
    [folders],
  )

  const startAuto = useCallback(async () => {
    // 확정 시점의 목록을 붙잡아 둔다. 시작 뒤 화면이 바뀌어도 보낼 것은 이것이다.
    const jobItems = items
    // 사람이 고친 이름이 기존 폴더와 같으면 새로 만들지 않고 그리로 보낸다. trim 은
    // 여기서 해야 한다 — 서버 스키마가 trim 하므로 안 하면 plannedFolderNames 의 표기와
    // 실제로 생긴 폴더 이름이 어긋난다.
    const dests = jobItems.map(effectiveDest).map((dest): Destination => {
      if (dest.kind !== 'new') return dest
      const existingId = attachFolderId(dest)
      return existingId !== null
        ? { kind: 'folder', folderId: existingId }
        : { kind: 'new', parentId: dest.parentId, name: dest.name.trim() }
    })

    // 버튼이 비활성일 때만 막지 않는다(2026-09-20) — handleStartWaiting 과 같은 이유.
    const unresolved = jobItems.some((item, i) => {
      const folderId = attachFolderId(dests[i])
      const decision = decisionFor(item, folderId)
      return decision.kind === 'ask' && resolveAttachTo(item, decision) === ''
    })
    if (unresolved) return

    setStarted(true)
    setPreparing(true)

    // 폴더 생성 중에 닫힐 수 있으므로 배치를 먼저 등록한다.
    const batch: UploadBatch = { cancelled: false }
    batches.current.add(batch)

    const plans = plannedFolders(dests)
    const created = await createPlannedFolders(plans, createFolder)
    const createdIds = Array.from(created.values()).filter((id): id is string => id !== null)
    setPreparing(false)

    if (batch.cancelled) {
      batches.current.delete(batch)
      // 방금 만든 폴더에는 아직 아무것도 안 들어갔다.
      if (createdIds.length > 0) void cleanupCreatedFolders(createdIds, [])
      return
    }

    const missing = plans.length - createdIds.length
    if (missing > 0) {
      toast.error(`새 폴더 ${missing}개를 만들지 못했습니다. 해당 문서는 미분류로 올립니다.`)
    }

    runBatch(
      batch,
      jobItems.map((item, i) => {
        const folderId = resolveDestination(dests[i], created)
        // 확정된 목적지로 후보를 다시 판정한다 — 선택한 뒤에 폴더를 바꿨으면 그 선택은
        // 여기서 버려진다(uploadTarget). 화면의 선택을 그대로 믿으면 다른 폴더의 문서에 붙는다.
        const attachTo = resolveAttachTo(item, decisionFor(item, folderId))
        return {
          item,
          target: uploadTarget(attachTo, folderId, candidatesFor(item.file.name, folderId)),
        }
      }),
      createdIds,
    )
  }, [
    items,
    effectiveDest,
    createFolder,
    cleanupCreatedFolders,
    runBatch,
    candidatesFor,
    decisionFor,
    resolveAttachTo,
    attachFolderId,
  ])

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

  // 미선택 ask 건수(2026-09-20). previewing 이면 미리보기의 전건을, 아니면 waiting 상태만
  // 본다 — 후보가 없거나(none) auto 로 이미 채워진 행은 고를 게 없다. 0건이어야 "선택
  // 확정하고 올리기"·"업로드 시작" 버튼이 눌린다.
  const unresolvedCount = previewing
    ? rows.filter((r) => {
        const decision = decisionFor(r.item, attachFolderId(r.dest))
        return decision.kind === 'ask' && resolveAttachTo(r.item, decision) === ''
      }).length
    : items.filter((item) => {
        if (item.status !== 'waiting') return false
        const folderId = mode === AUTO || mode === '' ? null : mode
        const decision = decisionFor(item, folderId)
        return decision.kind === 'ask' && resolveAttachTo(item, decision) === ''
      }).length

  const changeDest = (item: Item, value: string) => {
    const proposal = item.result?.kind === 'propose' ? item.result : null
    const dest: Destination =
      value === NEW_FOLDER && proposal !== null
        ? { kind: 'new', parentId: proposal.parentId, name: proposal.proposedName }
        : value === ''
          ? { kind: 'none' }
          : { kind: 'folder', folderId: value }
    // 폴더가 바뀌면 후보 목록이 통째로 갈린다. 선택을 남겨 두면 셀렉트가 목록에 없는
    // 값을 가리켜 화면이 거짓말을 한다 (실제 붙이기는 uploadTarget 이 한 번 더 막는다).
    update(item.id, { dest, destTouched: true, attachTo: undefined })
  }

  const destValue = (dest: Destination) =>
    dest.kind === 'new' ? NEW_FOLDER : dest.kind === 'folder' ? dest.folderId : ''

  /**
   * 새 폴더 이름 편집칸. 제안 이름은 카테고리가 아니라 문서 제목으로 나오는 일이 잦은데
   * 파일명만으로는 그 둘을 가릴 신호가 없다 — 사람이 여기서 고치는 것이 유일한 해법이다.
   * 고친 행은 destTouched 로 표시해 "만들지 않음" 체크가 덮지 않게 한다(셀렉트와 같은 의미론).
   */
  const renderNameEditor = (item: Item, dest: Extract<Destination, { kind: 'new' }>) => {
    const { parentId, name } = dest
    const error = folderNameError(name)
    // 흡수 판정도 부모 스코프 안에서 해야 한다 — 부모가 다른 동명 폴더는 다른 폴더다.
    const existingId = error === null ? findExistingFolderByName(name, parentId, folders) : null
    const existingName = existingId === null ? undefined : folderNameById.get(existingId)

    return (
      <div className="mt-2">
        <input
          type="text"
          value={name}
          maxLength={100}
          aria-label={`${item.file.name} 새 폴더 이름`}
          onChange={(e) =>
            update(item.id, {
              dest: { kind: 'new', parentId, name: e.target.value },
              destTouched: true,
            })
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

  /**
   * "새 문서 / 기존 문서의 새 버전" 선택칸. 후보가 없으면(kind: 'none') 아무것도 그리지
   * 않는다 — `attachDefault` 가 'none'·'auto' 로 판정한 건은 애초에 이 함수까지 오지
   * 않는다(수동 모드는 addFiles 가 곧장 올린다). 여기 그려지는 건 전부 `ask` 이거나,
   * 자동 분류 미리보기에서 사람이 아직 안 건드린 `auto` 행이다.
   *
   * **기본값은 항상 새 문서였다** — 2026-09-20 부로 뒤집는다. 팀원이 선택칸의 뜻을 몰라
   * 기본값(새 문서)으로 그대로 올려 같은 문서가 여러 건으로 쪼개졌다(운영 실측:
   * `마이페이지_화면설계서_v0.5` 5건). 잘못 붙인 판을 떼는 화면이 없다는 비대칭은
   * 그대로이므로, 그 조건을 못 채우면(ask) 사람이 "새 문서로 올리기"나 후보 중 하나를
   * 직접 고를 때까지 미선택 placeholder 로 둔다 — 조용히 어느 쪽으로도 가지 않는다.
   *
   * **자동 조건은 2026-09-22 에 넓어졌다.** 처음엔 "후보가 정확히 1건이고 버전이 엄격히
   * 높을 때만"이었는데, 운영 업로드 66건 재생에서 자동이 14/66뿐이었다(팀원이 버전
   * 번호를 안 올리고 날짜만 바꿔 재업로드하는 습관 + 이미 쪼개진 문서로 후보가 여럿인
   * 폴더). 지금은 후보가 여러 건이어도 `attachDefault` 가 그중 가장 최신 하나를 target
   * 으로 골라 비교하고, "버전은 같지만 파일명 날짜가 같거나 늦음"도 자동에 넣는다(재생
   * 실측: 약 42/66). 셀렉트에 보이는 후보 순서(`findSimilarDocuments`)도 같은 기준으로
   * 정렬돼 있어 첫 항목이 곧 target 이다.
   */
  const renderAttachChoice = (item: Item, folderId: string | null) => {
    const found = candidatesFor(item.file.name, folderId)
    if (found.length === 0) return null

    const decision = decisionFor(item, folderId)
    const value = resolveAttachTo(item, decision)
    const target = found.find((c) => c.id === value)
    const warning = target ? attachVersionWarning(item.file.name, target.latestFileName) : null

    return (
      <div className="mt-2">
        <select
          value={value}
          aria-label={`${item.file.name} 올리는 방식`}
          onChange={(e) => update(item.id, { attachTo: e.target.value })}
          className="w-full rounded-lg border border-border bg-surface py-1.5 pr-8 pl-2.5 text-xs text-ink outline-none focus:border-accent"
        >
          {/* 미선택일 때만 뜨는 placeholder. hidden 이라 다른 값을 고른 뒤에는 목록에
              안 남는다 — 한 번 고르면 되돌릴(다시 미선택으로 갈) 이유가 없다. */}
          <option value="" disabled hidden>
            올리는 방식을 골라 주세요
          </option>
          <option value={NEW_DOCUMENT}>새 문서로 올리기</option>
          {/* 제목이 아니라 **파일명**으로 보여준다. 여기서 묻는 것은 "이 파일이 저 파일의
              다음 판인가"이고, 제목은 사람이 고칠 수 있어 파일과 어긋나 있을 수 있다. */}
          {found.map((c) => (
            <option key={c.id} value={c.id}>
              ‘{c.latestFileName}’ 의 새 버전으로 올리기
            </option>
          ))}
        </select>
        {warning !== null && (
          <p
            className={`mt-1 text-xs ${warning.level === 'danger' ? 'text-danger' : 'text-ink-muted'}`}
          >
            {warning.message}
          </p>
        )}
        {target !== undefined && (
          <p className="mt-1 text-xs text-ink-muted">새 버전으로 올리면 되돌릴 수 없습니다.</p>
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
              <div className="flex items-center gap-2">
                <p className="truncate-cell min-w-0 flex-1 text-sm text-ink">{item.file.name}</p>
                {renderRemoveButton(item)}
              </div>
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
                    새 폴더 &lsquo;
                    {dest.kind === 'new'
                      ? newFolderLabel(dest.parentId, dest.name)
                      : newFolderLabel(item.result.parentId, item.result.proposedName)}
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
              {dest.kind === 'new' && renderNameEditor(item, dest)}
              {renderAttachChoice(item, attachFolderId(dest))}
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
                          {item.status === 'waiting' && (
                            <GitBranch className="h-4 w-4 text-accent" />
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
                        {item.status === 'waiting' && renderRemoveButton(item)}
                      </div>

                      {item.status === 'uploading' && (
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-canvas">
                          <div
                            className="h-full bg-accent transition-[width] duration-150"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      )}
                      {item.status === 'waiting' &&
                        renderAttachChoice(item, mode === AUTO || mode === '' ? null : mode)}
                      {/* attachDefault 가 곧장 붙인(auto) 건. 어디에 붙었는지 올린 뒤에도
                          보이게 한다 — 셀렉트를 안 보여주고 넘어갔으니 결과라도 알아야 한다. */}
                      {item.attachedLabel && item.status === 'done' && (
                        <p className="mt-1.5 text-xs text-ink-muted">{item.attachedLabel}</p>
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
                    : unresolvedCount > 0
                      ? `${unresolvedCount}건은 새 문서인지 기존 문서의 새 버전인지 골라 주세요`
                      : `${items.length}건 · 올리기 전에 확인하세요`
                  : items.length === 0
                    ? ' '
                    : unresolvedCount > 0
                      ? `${unresolvedCount}건은 새 문서인지 기존 문서의 새 버전인지 골라 주세요`
                      : waitingCount > 0
                        ? `${waitingCount}건 선택 완료 · 눌러서 올리세요`
                        : uploading
                          ? `업로드 중… ${doneCount}/${items.length}`
                          : `완료 ${doneCount}건${errorCount > 0 ? ` · 실패 ${errorCount}건` : ''}`}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={close}
                  className={
                    previewing || waitingCount > 0
                      ? 'rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-canvas'
                      : 'rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover'
                  }
                >
                  {previewing || uploading || waitingCount > 0
                    ? '취소'
                    : finished
                      ? '완료'
                      : '닫기'}
                </button>
                {previewing && (
                  <button
                    type="button"
                    disabled={preparing || invalidNameCount > 0 || unresolvedCount > 0}
                    onClick={() => void startAuto()}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
                  >
                    업로드 시작
                  </button>
                )}
                {!previewing && waitingCount > 0 && (
                  <button
                    type="button"
                    disabled={unresolvedCount > 0}
                    onClick={handleStartWaiting}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
                  >
                    선택 확정하고 올리기
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
