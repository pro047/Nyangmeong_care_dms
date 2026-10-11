import { describe, expect, it, vi } from 'vitest'
import { BULK_MAX_TOTAL_BYTES, planZipEntries, selectBulkDocuments } from '@/lib/bulk-download'
import type { BulkDocument } from '@/lib/bulk-download'
import {
  BULK_CONCURRENCY,
  BULK_FETCH_FAILED,
  BULK_UNAUTHORIZED,
  BULK_ZIP_FAILED,
  createJsZipWriter,
  runBulkDownload,
  type BulkBatch,
  type BulkDownloadDeps,
  type BulkDownloadRequest,
  type BulkFetchResponse,
  type BulkProgress,
  type ZipWriter,
} from '@/lib/bulk-download-run'
import type { FolderRow } from '@/lib/folder'

const ZIP_NAME = 'DMS_문서_20261012_0030.zip'
const LOGIN_HTML = '로그인·회원가입_화면설계서_v0.10_20260930.html'
const PLACE_XLSX = '05_플레이스_동물병원_기능명세서_v0.2_260908 (1).xlsx'

const FOLDERS: FolderRow[] = [
  { id: 'f-screen', name: '화면설계서', parentId: null },
  { id: 'f-my', name: '마이페이지', parentId: 'f-screen' },
  { id: 'f-req', name: '요구사항', parentId: null },
]

function doc(id: string, folderId: string | null, fileName: string, sizeBytes = 10): BulkDocument {
  return { id, title: `문서 ${id}`, folderId, fileName, sizeBytes }
}

// r03·r04 는 같은 폴더의 같은 이름, r05 는 0바이트, r06 은 고르지 않는 종류다.
const DOCUMENTS: BulkDocument[] = [
  doc('r01', 'f-screen', LOGIN_HTML),
  doc('r02', 'f-my', PLACE_XLSX),
  doc('r03', 'f-my', 'a.txt'),
  doc('r04', 'f-my', 'a.txt'),
  doc('r05', null, '빈 파일.md', 0),
  doc('r06', 'f-req', '요구사항.xlsx'),
]
const SELECTED: (string | null)[] = ['f-screen', null]
const TARGET_IDS = ['r01', 'r02', 'r03', 'r04', 'r05']

const EXPECTED_PATHS: Record<string, string> = {
  r01: `화면설계서/${LOGIN_HTML}`,
  r02: `화면설계서/마이페이지/${PLACE_XLSX}`,
  r03: '화면설계서/마이페이지/a.txt',
  r04: '화면설계서/마이페이지/a (2).txt',
  r05: '미분류/빈 파일.md',
}

/** 문서마다 내용을 다르게 줘서 zip 안에서 뒤바뀐 것을 잡는다. */
function bodyOf(id: string): string {
  return id === 'r05' ? '' : `본문 ${id} — 내용`
}

function toArrayBuffer(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text)
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function urlOf(id: string): string {
  return `/api/documents/${id}/download`
}

function idFromUrl(url: string): string {
  const match = /^\/api\/documents\/([^/?]+)\/download$/.exec(url)
  if (!match) throw new Error(`예상하지 못한 URL: ${url}`)
  return decodeURIComponent(match[1])
}

function okResponse(id: string): BulkFetchResponse {
  // 성공 응답은 S3 로 리다이렉트된 뒤의 것이다.
  return { ok: true, status: 200, redirected: true, arrayBuffer: async () => toArrayBuffer(bodyOf(id)) }
}

function errorResponse(status: number, redirected = false): BulkFetchResponse {
  return { ok: false, status, redirected, arrayBuffer: async () => new ArrayBuffer(0) }
}

type Responder = (id: string) => BulkFetchResponse | Promise<BulkFetchResponse>

function harness(respond: Responder = okResponse) {
  const saved: { data: ArrayBuffer; fileName: string }[] = []
  const added: { path: string; data: ArrayBuffer }[] = []
  const progress: BulkProgress[] = []
  const log: string[] = []

  const writer: ZipWriter = {
    add: (path, data) => {
      added.push({ path, data })
    },
    finish: async () => new ArrayBuffer(4),
  }

  const fetchFile = vi.fn(async (url: string) => respond(idFromUrl(url)))
  const createZip = vi.fn(async (): Promise<ZipWriter> => writer)
  const save = vi.fn((data: ArrayBuffer, fileName: string) => {
    log.push('save')
    saved.push({ data, fileName })
  })
  const onProgress = vi.fn((p: BulkProgress) => {
    log.push(p.phase)
    progress.push({ ...p })
  })

  const deps: BulkDownloadDeps = { fetchFile, createZip, save, onProgress }
  return { deps, fetchFile, createZip, save, onProgress, saved, added, progress, log, writer }
}

function request(overrides: Partial<BulkDownloadRequest> = {}): BulkDownloadRequest {
  return { folders: FOLDERS, documents: DOCUMENTS, selected: SELECTED, zipName: ZIP_NAME, ...overrides }
}

async function openZip(data: ArrayBuffer) {
  const mod = await import('jszip')
  const JSZip = mod.default ?? mod
  return JSZip.loadAsync(data)
}

async function readZip(data: ArrayBuffer): Promise<Record<string, string>> {
  const zip = await openZip(data)
  const entries: Record<string, string> = {}
  for (const file of Object.values(zip.files)) {
    if (file.dir) continue
    entries[file.name] = await file.async('string')
  }
  return entries
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

async function ticks(count: number) {
  for (let i = 0; i < count; i++) await tick()
}

/** 응답을 테스트가 직접 풀어 주는 fetch. 타이머에 기대지 않고 동시 진행 수를 잰다. */
function gatedFetch() {
  const pending: { id: string; resolve: (response: BulkFetchResponse) => void }[] = []
  const state = { inFlight: 0, maxInFlight: 0 }

  const fetchFile = vi.fn(
    (url: string) =>
      new Promise<BulkFetchResponse>((resolve) => {
        state.inFlight += 1
        state.maxInFlight = Math.max(state.maxInFlight, state.inFlight)
        pending.push({
          id: idFromUrl(url),
          resolve: (response) => {
            state.inFlight -= 1
            resolve(response)
          },
        })
      }),
  )

  const releaseAll = () => {
    for (const item of pending.splice(0)) item.resolve(okResponse(item.id))
  }

  return { fetchFile, pending, state, releaseAll }
}

/** 끝날 때까지 밀린 응답을 전부 풀어 준다. 끝나지 않으면 테스트 타임아웃 대신 여기서 던진다. */
async function drain<T>(run: Promise<T>, releaseAll: () => void): Promise<T> {
  let settled = false
  const mark = () => {
    settled = true
  }
  run.then(mark, mark)
  for (let i = 0; i < 200 && !settled; i++) {
    releaseAll()
    await tick()
  }
  if (!settled) throw new Error('runBulkDownload 가 끝나지 않았다')
  return run
}

const TEN: BulkDocument[] = Array.from({ length: 10 }, (_, i) =>
  doc(`t${String(i + 1).padStart(2, '0')}`, 'f-req', `파일${i + 1}.txt`),
)

describe('runBulkDownload — 받기 전 판정', () => {
  it('AC-13 합계가 상한보다 1바이트 크면 아무것도 받지 않고 too-large 여야 한다', async () => {
    const h = harness()
    const documents = [doc('b01', null, '큰.bin', BULK_MAX_TOTAL_BYTES), doc('b02', null, '작은.bin', 1)]

    const result = await runBulkDownload(request({ documents, selected: [null] }), h.deps)

    expect(result).toEqual({ kind: 'too-large', totalBytes: 209715201, limitBytes: 209715200 })
    expect(h.fetchFile).toHaveBeenCalledTimes(0)
    expect(h.createZip).toHaveBeenCalledTimes(0)
    expect(h.save).toHaveBeenCalledTimes(0)
  })

  it('AC-13 합계가 정확히 상한이면 받기를 진행해야 한다', async () => {
    const h = harness((id) => ({
      ok: true,
      status: 200,
      redirected: true,
      arrayBuffer: async () => toArrayBuffer(id),
    }))
    const documents = [
      doc('b01', null, '큰.bin', BULK_MAX_TOTAL_BYTES - 1),
      doc('b02', null, '작은.bin', 1),
    ]

    const result = await runBulkDownload(request({ documents, selected: [null] }), h.deps)

    expect(h.fetchFile).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ kind: 'done', zipName: ZIP_NAME, savedCount: 2, skipped: [] })
  })

  it('AC-13 고르지 않은 종류의 크기는 합계에 넣지 않아야 한다', async () => {
    const h = harness()
    const documents = [doc('b01', 'f-req', '큰.bin', BULK_MAX_TOTAL_BYTES + 1), doc('b02', null, '작은.txt', 1)]

    const result = await runBulkDownload(request({ documents, selected: [null] }), h.deps)

    expect(result).toEqual({ kind: 'done', zipName: ZIP_NAME, savedCount: 1, skipped: [] })
  })

  it('AC-14 아무 종류도 고르지 않으면 받지 않고 empty 여야 한다', async () => {
    const h = harness()

    const result = await runBulkDownload(request({ selected: [] }), h.deps)

    expect(result).toEqual({ kind: 'empty' })
    expect(h.fetchFile).toHaveBeenCalledTimes(0)
    expect(h.createZip).toHaveBeenCalledTimes(0)
    expect(h.save).toHaveBeenCalledTimes(0)
  })

  it('AC-14 고른 종류에 문서가 없으면 받지 않고 empty 여야 한다', async () => {
    const h = harness()
    const folders: FolderRow[] = [...FOLDERS, { id: 'f-empty', name: '빈 폴더', parentId: null }]

    const result = await runBulkDownload(request({ folders, selected: ['f-empty'] }), h.deps)

    expect(result).toEqual({ kind: 'empty' })
    expect(h.fetchFile).toHaveBeenCalledTimes(0)
    expect(h.save).toHaveBeenCalledTimes(0)
  })
})

describe('runBulkDownload — zip 왕복 (실제 jszip)', () => {
  it('AC-15 받은 파일을 계획한 경로에 그대로 담아 한 번 저장해야 한다', async () => {
    const h = harness()
    const deps: BulkDownloadDeps = { ...h.deps, createZip: createJsZipWriter }

    const result = await runBulkDownload(request(), deps)

    expect(result).toEqual({ kind: 'done', zipName: ZIP_NAME, savedCount: 5, skipped: [] })
    expect(h.save).toHaveBeenCalledTimes(1)
    expect(h.saved[0].fileName).toBe(ZIP_NAME)

    const entries = await readZip(h.saved[0].data)
    const plan = planZipEntries(FOLDERS, selectBulkDocuments(FOLDERS, DOCUMENTS, SELECTED))
    expect(Object.keys(entries).sort()).toEqual(plan.map((e) => e.path).sort())
    expect(entries).toEqual({
      [EXPECTED_PATHS.r01]: bodyOf('r01'),
      [EXPECTED_PATHS.r02]: bodyOf('r02'),
      [EXPECTED_PATHS.r03]: bodyOf('r03'),
      [EXPECTED_PATHS.r04]: bodyOf('r04'),
      [EXPECTED_PATHS.r05]: '',
    })
  })

  it('AC-15 0바이트 파일도 항목으로 들어가야 한다', async () => {
    const h = harness()
    const deps: BulkDownloadDeps = { ...h.deps, createZip: createJsZipWriter }

    await runBulkDownload(request({ selected: [null] }), deps)

    const zip = await openZip(h.saved[0].data)
    const files = Object.values(zip.files).filter((f) => !f.dir)
    expect(files.map((f) => f.name)).toEqual(['미분류/빈 파일.md'])
    expect((await files[0].async('uint8array')).byteLength).toBe(0)
  })

  it('AC-15 응답이 뒤바뀐 순서로 끝나도 계획 순서대로 zip 에 넣어야 한다', async () => {
    const gate = gatedFetch()
    const h = harness()
    const deps: BulkDownloadDeps = { ...h.deps, fetchFile: gate.fetchFile }

    const run = runBulkDownload(request(), deps)
    const releaseNewestFirst = () => {
      for (const item of gate.pending.splice(0).reverse()) item.resolve(okResponse(item.id))
    }
    const result = await drain(run, releaseNewestFirst)

    expect(result).toEqual({ kind: 'done', zipName: ZIP_NAME, savedCount: 5, skipped: [] })
    expect(h.added.map((a) => a.path)).toEqual(TARGET_IDS.map((id) => EXPECTED_PATHS[id]))
    expect(h.added.map((a) => new TextDecoder().decode(a.data))).toEqual(TARGET_IDS.map(bodyOf))
  })

  it('AC-15 createJsZipWriter 는 압축하지 않고 넣은 바이트를 그대로 돌려줘야 한다', async () => {
    const writer = await createJsZipWriter()
    const zeros = new ArrayBuffer(4096)

    writer.add('폴더/영.bin', zeros)
    writer.add('폴더/글.txt', toArrayBuffer('가나다'))
    const out = await writer.finish()

    // STORE 면 0 으로 찬 4096바이트가 줄지 않는다. DEFLATE 면 수십 바이트가 된다.
    expect(out.byteLength).toBeGreaterThan(4096)
    const zip = await openZip(out)
    expect((await zip.files['폴더/영.bin'].async('uint8array')).byteLength).toBe(4096)
    expect(await zip.files['폴더/글.txt'].async('string')).toBe('가나다')
  })

  it('AC-16 리다이렉트 없는 404 문서는 건너뛰고 나머지를 저장해야 한다', async () => {
    const h = harness((id) => (id === 'r03' ? errorResponse(404) : okResponse(id)))
    const deps: BulkDownloadDeps = { ...h.deps, createZip: createJsZipWriter }

    const result = await runBulkDownload(request(), deps)

    expect(result).toEqual({
      kind: 'done',
      zipName: ZIP_NAME,
      savedCount: 4,
      skipped: [{ documentId: 'r03', title: '문서 r03' }],
    })
    expect(h.save).toHaveBeenCalledTimes(1)
    const entries = await readZip(h.saved[0].data)
    expect(entries).toEqual({
      [EXPECTED_PATHS.r01]: bodyOf('r01'),
      [EXPECTED_PATHS.r02]: bodyOf('r02'),
      [EXPECTED_PATHS.r04]: bodyOf('r04'),
      [EXPECTED_PATHS.r05]: '',
    })
    expect(EXPECTED_PATHS.r03 in entries).toBe(false)
  })
})

describe('runBulkDownload — 실패', () => {
  const failures: { name: string; respond: Responder; message: () => string }[] = [
    { name: '(a) 500', respond: () => errorResponse(500), message: () => `${BULK_FETCH_FAILED} (500)` },
    { name: '(b) 403', respond: () => errorResponse(403), message: () => `${BULK_FETCH_FAILED} (403)` },
    { name: '(c) 401', respond: () => errorResponse(401), message: () => BULK_UNAUTHORIZED },
    {
      name: '(d) fetchFile 이 reject',
      respond: () => Promise.reject(new TypeError('Failed to fetch')),
      message: () => BULK_FETCH_FAILED,
    },
    {
      name: '(e) arrayBuffer 가 reject',
      respond: () => ({
        ok: true,
        status: 200,
        redirected: true,
        arrayBuffer: () => Promise.reject(new Error('body stream error')),
      }),
      message: () => BULK_FETCH_FAILED,
    },
    {
      name: '(f) 리다이렉트 뒤의 404',
      respond: () => errorResponse(404, true),
      message: () => `${BULK_FETCH_FAILED} (404)`,
    },
  ]

  it.each(failures)(
    'AC-17 $name 이면 zip 을 만들지 않고 failed 여야 한다',
    async ({ respond, message }) => {
      const h = harness((id) => (id === 'r02' ? respond(id) : okResponse(id)))

      const result = await runBulkDownload(request(), h.deps)

      expect(result).toEqual({
        kind: 'failed',
        message: message(),
        document: { documentId: 'r02', title: '문서 r02' },
      })
      expect(h.createZip).toHaveBeenCalledTimes(0)
      expect(h.save).toHaveBeenCalledTimes(0)
    },
  )

  it('AC-17 사용자 문구는 비어 있지 않고 서로 달라야 하며 원본 오류 문구를 싣지 않아야 한다', async () => {
    const h = harness(() => Promise.reject(new TypeError('Failed to fetch')))

    const result = await runBulkDownload(request({ selected: [null] }), h.deps)

    expect(BULK_FETCH_FAILED.length).toBeGreaterThan(0)
    expect(BULK_UNAUTHORIZED.length).toBeGreaterThan(0)
    expect(BULK_ZIP_FAILED.length).toBeGreaterThan(0)
    expect(new Set([BULK_FETCH_FAILED, BULK_UNAUTHORIZED, BULK_ZIP_FAILED]).size).toBe(3)
    expect(result).toEqual({
      kind: 'failed',
      message: BULK_FETCH_FAILED,
      document: { documentId: 'r05', title: '문서 r05' },
    })
    expect(JSON.stringify(result).includes('Failed to fetch')).toBe(false)
  })

  it('AC-17 404 건너뛰기와 다른 실패가 섞이면 failed 여야 한다', async () => {
    const h = harness((id) => {
      if (id === 'r01') return errorResponse(404)
      if (id === 'r04') return errorResponse(500)
      return okResponse(id)
    })

    const result = await runBulkDownload(request(), h.deps)

    expect(result).toEqual({
      kind: 'failed',
      message: `${BULK_FETCH_FAILED} (500)`,
      document: { documentId: 'r04', title: '문서 r04' },
    })
    expect(h.createZip).toHaveBeenCalledTimes(0)
    expect(h.save).toHaveBeenCalledTimes(0)
  })

  it('AC-18 고른 문서가 전부 리다이렉트 없는 404 면 저장하지 않고 all-skipped 여야 한다', async () => {
    const h = harness(() => errorResponse(404))

    const result = await runBulkDownload(request(), h.deps)

    expect(result.kind).toBe('all-skipped')
    const skipped = result.kind === 'all-skipped' ? result.skipped : []
    expect([...skipped].sort((a, b) => a.documentId.localeCompare(b.documentId))).toEqual(
      TARGET_IDS.map((id) => ({ documentId: id, title: `문서 ${id}` })),
    )
    expect(h.createZip).toHaveBeenCalledTimes(0)
    expect(h.save).toHaveBeenCalledTimes(0)
  })

  it('AC-24 createZip 이 reject 하면 문서 없는 failed 여야 한다', async () => {
    const h = harness()
    const deps: BulkDownloadDeps = {
      ...h.deps,
      createZip: vi.fn(() => Promise.reject(new Error('chunk load failed'))),
    }

    const result = await runBulkDownload(request(), deps)

    expect(result).toEqual({ kind: 'failed', message: BULK_ZIP_FAILED, document: null })
    expect(h.save).toHaveBeenCalledTimes(0)
  })

  it('AC-24 finish 가 reject 하면 문서 없는 failed 여야 한다', async () => {
    const h = harness()
    const writer: ZipWriter = { add: () => {}, finish: () => Promise.reject(new Error('out of memory')) }
    const deps: BulkDownloadDeps = { ...h.deps, createZip: async () => writer }

    const result = await runBulkDownload(request(), deps)

    expect(result).toEqual({ kind: 'failed', message: BULK_ZIP_FAILED, document: null })
    expect(h.save).toHaveBeenCalledTimes(0)
  })

  it('AC-24 save 가 throw 하면 문서 없는 failed 여야 한다', async () => {
    const h = harness()
    const save = vi.fn(() => {
      throw new Error('blocked')
    })
    const deps: BulkDownloadDeps = { ...h.deps, save }

    const result = await runBulkDownload(request(), deps)

    expect(result).toEqual({ kind: 'failed', message: BULK_ZIP_FAILED, document: null })
    expect(save).toHaveBeenCalledTimes(1)
  })
})

describe('runBulkDownload — 요청 수', () => {
  it('AC-19 문서 10건을 받을 때 동시에 열린 요청이 BULK_CONCURRENCY 를 넘지 않아야 한다', async () => {
    const gate = gatedFetch()
    const h = harness()
    const deps: BulkDownloadDeps = { ...h.deps, fetchFile: gate.fetchFile }

    const run = runBulkDownload(request({ documents: TEN, selected: ['f-req'] }), deps)
    await ticks(3)
    const startedBeforeAnyFinished = gate.fetchFile.mock.calls.length
    const result = await drain(run, gate.releaseAll)

    expect(BULK_CONCURRENCY).toBe(3)
    expect(BULK_CONCURRENCY).toBeLessThanOrEqual(4)
    expect(gate.state.maxInFlight).toBeLessThanOrEqual(BULK_CONCURRENCY)
    // 아무 응답도 끝나지 않았을 때 열려 있는 수가 곧 동시 요청 수다. 1 이면 직렬로 도는 것이다.
    expect(startedBeforeAnyFinished).toBe(BULK_CONCURRENCY)
    expect(gate.fetchFile).toHaveBeenCalledTimes(10)
    expect(result).toEqual({ kind: 'done', zipName: ZIP_NAME, savedCount: 10, skipped: [] })
  })

  it('AC-20 처음 시작된 요청이 500 으로 끝나면 새 요청을 시작하지 않아야 한다', async () => {
    const gate = gatedFetch()
    const h = harness()
    const deps: BulkDownloadDeps = { ...h.deps, fetchFile: gate.fetchFile }

    const run = runBulkDownload(request({ documents: TEN, selected: ['f-req'] }), deps)
    await ticks(3)
    const first = gate.pending.shift()
    if (!first) throw new Error('시작된 요청이 없다')
    first.resolve(errorResponse(500))
    await ticks(3)
    const result = await drain(run, gate.releaseAll)

    expect(gate.fetchFile.mock.calls.length).toBeLessThanOrEqual(BULK_CONCURRENCY)
    expect(result).toEqual({
      kind: 'failed',
      message: `${BULK_FETCH_FAILED} (500)`,
      document: { documentId: first.id, title: `문서 ${first.id}` },
    })
    expect(h.createZip).toHaveBeenCalledTimes(0)
    expect(h.save).toHaveBeenCalledTimes(0)
  })

  // 불변식: 1문서 = 1파일, 파일은 앱 서버를 거치지 않는다(기존 presigned 리다이렉트 라우트만 부른다).
  it('AC-21 대상 문서마다 다운로드 URL 을 정확히 한 번씩만 불러야 한다', async () => {
    const h = harness()

    await runBulkDownload(request(), h.deps)

    const urls = h.fetchFile.mock.calls.map(([url]) => url)
    expect([...urls].sort()).toEqual(TARGET_IDS.map(urlOf))
    expect(urls.includes(urlOf('r06'))).toBe(false)
  })
})

describe('runBulkDownload — 받을 판 고정 (리뷰 뒤 추가)', () => {
  // 화면을 연 뒤 누가 재업로드하면 "지금의 최신"은 파일명을 정한 판이 아니다.
  it('문서에 판 번호가 있으면 그 판을 지목해 받아야 한다', async () => {
    const h = harness()
    const urls: string[] = []
    const deps: BulkDownloadDeps = {
      ...h.deps,
      fetchFile: async (url) => {
        urls.push(url)
        return { ok: true, status: 200, redirected: true, arrayBuffer: async () => new ArrayBuffer(1) }
      },
    }
    const documents: BulkDocument[] = [{ ...doc('p01', null, 'a.html'), versionNo: 4 }]

    const result = await runBulkDownload(request({ documents, selected: [null] }), deps)

    expect(result.kind).toBe('done')
    expect(urls).toEqual(['/api/documents/p01/download?v=4'])
  })
})

describe('runBulkDownload — 취소', () => {
  it('AC-22 받는 도중 취소되면 저장하지 않고 cancelled 여야 한다', async () => {
    const batch: BulkBatch = { cancelled: false }
    const h = harness((id) => {
      batch.cancelled = true
      return okResponse(id)
    })

    const result = await runBulkDownload(request({ documents: TEN, selected: ['f-req'] }), h.deps, batch)

    expect(result).toEqual({ kind: 'cancelled' })
    expect(h.save).toHaveBeenCalledTimes(0)
    expect(h.fetchFile.mock.calls.length).toBeLessThanOrEqual(BULK_CONCURRENCY)
  })

  it('AC-22 시작 전에 이미 취소됐으면 한 건도 받지 않아야 한다', async () => {
    const h = harness()

    const result = await runBulkDownload(request(), h.deps, { cancelled: true })

    expect(result).toEqual({ kind: 'cancelled' })
    expect(h.fetchFile).toHaveBeenCalledTimes(0)
    expect(h.save).toHaveBeenCalledTimes(0)
  })

  it('AC-22 zip 을 만드는 동안 취소되면 저장하지 않아야 한다', async () => {
    const batch: BulkBatch = { cancelled: false }
    const h = harness()
    const writer: ZipWriter = {
      add: () => {},
      finish: async () => {
        batch.cancelled = true
        return new ArrayBuffer(4)
      },
    }
    const deps: BulkDownloadDeps = { ...h.deps, createZip: async () => writer }

    const result = await runBulkDownload(request(), deps, batch)

    expect(result).toEqual({ kind: 'cancelled' })
    expect(h.save).toHaveBeenCalledTimes(0)
  })

  it('AC-22 batch 를 넘기지 않아도 끝까지 받아 저장해야 한다', async () => {
    const h = harness()

    const result = await runBulkDownload(request(), h.deps)

    expect(result).toEqual({ kind: 'done', zipName: ZIP_NAME, savedCount: 5, skipped: [] })
    expect(h.save).toHaveBeenCalledTimes(1)
  })
})

describe('runBulkDownload — 진행 표시', () => {
  it('AC-23 받기 진행은 건너뛴 문서까지 세어 1 부터 total 까지 올라가야 한다', async () => {
    const h = harness((id) => (id === 'r03' ? errorResponse(404) : okResponse(id)))

    await runBulkDownload(request(), h.deps)

    const fetching = h.progress.filter((p) => p.phase === 'fetching')
    expect(fetching.map((p) => p.done)).toEqual([1, 2, 3, 4, 5])
    expect(fetching.map((p) => p.total)).toEqual([5, 5, 5, 5, 5])
  })

  it('AC-23 저장 전에 zipping 단계를 알려야 한다', async () => {
    const h = harness()

    await runBulkDownload(request(), h.deps)

    const zipping = h.progress.filter((p) => p.phase === 'zipping')
    expect(zipping.length).toBeGreaterThanOrEqual(1)
    expect(zipping[0]).toEqual({ phase: 'zipping', done: 5, total: 5 })
    expect(h.log.indexOf('zipping')).toBeGreaterThan(h.log.lastIndexOf('fetching'))
    expect(h.log.indexOf('zipping')).toBeLessThan(h.log.indexOf('save'))
    expect(h.log.filter((entry) => entry === 'save')).toHaveLength(1)
  })

  it('AC-23 onProgress 가 없어도 끝까지 받아야 한다', async () => {
    const h = harness()
    const deps: BulkDownloadDeps = { fetchFile: h.fetchFile, createZip: h.createZip, save: h.save }

    const result = await runBulkDownload(request(), deps)

    expect(result).toEqual({ kind: 'done', zipName: ZIP_NAME, savedCount: 5, skipped: [] })
  })
})
