import {
  bulkDownloadUrl,
  bulkTotalBytes,
  exceedsBulkLimit,
  planZipEntries,
  selectBulkDocuments,
  BULK_MAX_TOTAL_BYTES,
  type BulkDocument,
} from '@/lib/bulk-download'
import type { FolderRow } from '@/lib/folder'

/** 동시에 열어 두는 다운로드 요청 수. 라우트가 요청마다 DB 조회를 내고 앱 풀이 5 라 4 를 넘기지 않는다. */
export const BULK_CONCURRENCY = 3

export const BULK_FETCH_FAILED = '파일을 받지 못했습니다'
export const BULK_ZIP_FAILED = 'zip 을 만들지 못했습니다'
export const BULK_UNAUTHORIZED = '로그인이 만료됐습니다. 다시 로그인한 뒤 받아 주세요.'

/** fetch 응답 중 이 모듈이 보는 부분. 브라우저의 Response 가 그대로 만족한다. */
export type BulkFetchResponse = {
  ok: boolean
  status: number
  /** 우리 라우트의 404 와 리다이렉트 뒤 S3 의 404 를 가른다. */
  redirected: boolean
  arrayBuffer(): Promise<ArrayBuffer>
}

export type ZipWriter = {
  add(path: string, data: ArrayBuffer): void
  finish(): Promise<ArrayBuffer>
}

export type BulkProgress = {
  phase: 'fetching' | 'zipping'
  /** 끝난 문서 수 (받았거나 건너뜀) */
  done: number
  total: number
}

export type BulkDownloadDeps = {
  fetchFile: (url: string) => Promise<BulkFetchResponse>
  createZip: () => Promise<ZipWriter>
  save: (data: ArrayBuffer, fileName: string) => void
  onProgress?: (progress: BulkProgress) => void
}

export type BulkDownloadRequest = {
  folders: FolderRow[]
  documents: BulkDocument[]
  /** 고른 종류의 folderId 들. null 은 미분류. */
  selected: readonly (string | null)[]
  zipName: string
}

export type BulkSkipped = { documentId: string; title: string }

export type BulkDownloadResult =
  | { kind: 'empty' }
  | { kind: 'too-large'; totalBytes: number; limitBytes: number }
  | { kind: 'done'; zipName: string; savedCount: number; skipped: BulkSkipped[] }
  | { kind: 'all-skipped'; skipped: BulkSkipped[] }
  | { kind: 'failed'; message: string; document: BulkSkipped | null }
  | { kind: 'cancelled' }

/** 화면이 닫기를 누르면 cancelled 를 true 로 바꾼다. 반드시 참조로 넘긴다. */
export type BulkBatch = { cancelled: boolean }

type Failure = { message: string; document: BulkSkipped | null }

function httpFailureMessage(status: number): string {
  return status === 401 ? BULK_UNAUTHORIZED : `${BULK_FETCH_FAILED} (${status})`
}

/**
 * 고른 종류의 최신판을 받아 zip 하나로 저장한다. **reject 하지 않는다** — 실패는 전부 결과로 돌려준다.
 *
 * 실패가 하나라도 있으면 zip 을 만들지 않는다: 몇 건 빠진 zip 이 온전한 것처럼 저장되면 안 된다.
 * 404 중 우리 라우트가 준 것(휴지통으로 간 문서)만 건너뛴다.
 */
export async function runBulkDownload(
  request: BulkDownloadRequest,
  deps: BulkDownloadDeps,
  batch: BulkBatch = { cancelled: false },
): Promise<BulkDownloadResult> {
  const targets = selectBulkDocuments(request.folders, request.documents, request.selected)
  if (targets.length === 0) return { kind: 'empty' }

  const totalBytes = bulkTotalBytes(targets)
  if (exceedsBulkLimit(totalBytes)) {
    return { kind: 'too-large', totalBytes, limitBytes: BULK_MAX_TOTAL_BYTES }
  }

  // 경로는 받기 전에 확정한다 — 건너뛴 문서 때문에 뒤 문서의 번호가 바뀌면 안 된다.
  const plan = planZipEntries(request.folders, targets)
  // 경로를 정한 그 판을 받는다 — 화면을 연 뒤 재업로드된 판이 옛 파일명으로 들어가면 안 된다.
  const versions = new Map(targets.map((document) => [document.id, document.versionNo]))
  const total = plan.length
  const received: (ArrayBuffer | undefined)[] = new Array(total).fill(undefined)
  const skippedAt: (BulkSkipped | undefined)[] = new Array(total).fill(undefined)
  let failure: Failure | null = null
  let done = 0
  let next = 0

  const notify = (progress: BulkProgress) => {
    try {
      deps.onProgress?.(progress)
    } catch {
      // 진행 표시의 오류가 받기를 reject 로 끝내면 안 된다.
    }
  }

  const fetchOne = async (index: number) => {
    const entry = plan[index]
    const who: BulkSkipped = { documentId: entry.documentId, title: entry.title }
    const fail = (message: string) => {
      failure ??= { message, document: who }
    }

    let response: BulkFetchResponse
    try {
      response = await deps.fetchFile(bulkDownloadUrl(entry.documentId, versions.get(entry.documentId)))
    } catch {
      fail(BULK_FETCH_FAILED)
      return
    }

    if (!response.ok && response.status === 404 && !response.redirected) {
      skippedAt[index] = who
    } else if (!response.ok) {
      fail(httpFailureMessage(response.status))
      return
    } else {
      try {
        received[index] = await response.arrayBuffer()
      } catch {
        fail(BULK_FETCH_FAILED)
        return
      }
    }

    done += 1
    notify({ phase: 'fetching', done, total })
  }

  const worker = async () => {
    while (failure === null && !batch.cancelled && next < total) {
      const index = next
      next += 1
      await fetchOne(index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, total) }, worker))

  if (failure !== null) return { kind: 'failed', ...(failure as Failure) }
  if (batch.cancelled) return { kind: 'cancelled' }

  const skipped = skippedAt.filter((s): s is BulkSkipped => s !== undefined)
  const savedCount = total - skipped.length
  if (savedCount === 0) return { kind: 'all-skipped', skipped }

  // createZip 은 위 판정이 전부 끝난 뒤에 부른다 — 실패 경로에서 zip 을 만들지 않았음이 보장된다.
  let bytes: ArrayBuffer
  try {
    const zip = await deps.createZip()
    plan.forEach((entry, index) => {
      const data = received[index]
      if (data !== undefined) zip.add(entry.path, data)
    })
    notify({ phase: 'zipping', done: total, total })
    bytes = await zip.finish()
  } catch {
    return { kind: 'failed', message: BULK_ZIP_FAILED, document: null }
  }

  if (batch.cancelled) return { kind: 'cancelled' }

  try {
    deps.save(bytes, request.zipName)
  } catch {
    return { kind: 'failed', message: BULK_ZIP_FAILED, document: null }
  }
  return { kind: 'done', zipName: request.zipName, savedCount, skipped }
}

/** jszip 을 동적 import 해 만든 ZipWriter. 압축 없음(STORE) — 합계가 작고 대부분 이미 압축된 형식이다. */
export async function createJsZipWriter(): Promise<ZipWriter> {
  const mod = await import('jszip')
  const JSZip = mod.default ?? mod
  const zip = new JSZip()
  return {
    add: (path, data) => {
      // JSZip 은 항목 시각을 UTC 필드로 적는데 zip 의 시각에는 시간대가 없다 — 그대로 두면
      // 푼 파일의 수정 시각이 한국에서 9시간 이르게 찍힌다. 로컬 벽시계가 UTC 필드에 오게 민다.
      const now = new Date()
      zip.file(path, data, { date: new Date(now.getTime() - now.getTimezoneOffset() * 60_000) })
    },
    finish: () => zip.generateAsync({ type: 'arraybuffer', compression: 'STORE' }),
  }
}
