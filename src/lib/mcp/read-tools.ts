import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { activeDocumentWhere } from '@/lib/trash'
import { sheetsToText, type SheetRows } from './xlsx-text'
import { htmlToText } from './html-text'

export const MAX_READ_BYTES = 1024 * 1024
export const READ_DEFAULT_LIMIT = 20_000
export const READ_MAX_LIMIT = 100_000

export type ReadableKind = 'html' | 'markdown' | 'csv' | 'text' | 'xlsx'

export const READ_UNSUPPORTED_FORMAT =
  '이 형식은 본문을 읽을 수 없습니다. 읽을 수 있는 형식: html·md·csv·txt·xlsx'
export const READ_TOO_LARGE = '원본이 1MB 를 넘어 본문을 읽지 않습니다.'
export const READ_FETCH_FAILED = '저장소에서 파일을 받지 못했습니다.'
export const READ_PARSE_FAILED = '파일을 해석하지 못했습니다.'
export const READ_OFFSET_OUT_OF_RANGE = 'offset 이 본문 길이를 넘었습니다.'
export const READ_DOWNLOAD_HINT = '전체 파일이 필요하면 get_download_url 로 받으세요.'
export const READ_ENCODING_WARNING =
  'UTF-8 로 읽을 수 없는 바이트가 있어 일부 글자가 깨졌습니다(�). 원본이 필요하면 get_download_url 로 받으세요.'

export const readDocumentInputSchema = z.object({
  id: z.string().min(1),
  versionNo: z.number().int().min(1).optional(),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(READ_MAX_LIMIT).default(READ_DEFAULT_LIMIT),
  format: z.enum(['text', 'raw']).default('text'),
})

// 확장자가 있으면 이 표만 본다(표에 없으면 mimeType 을 보지 않는다).
const EXTENSION_KIND: Record<string, ReadableKind> = {
  html: 'html',
  htm: 'html',
  md: 'markdown',
  markdown: 'markdown',
  csv: 'csv',
  txt: 'text',
  xlsx: 'xlsx',
}

// 확장자가 없을 때만 보는 보조 판정.
const MIME_KIND: Record<string, ReadableKind> = {
  'text/html': 'html',
  'text/markdown': 'markdown',
  'text/csv': 'csv',
  'text/plain': 'text',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

// 첫 글자가 영문이어야 확장자로 본다 — 이 팀 파일명은 `…_v0.3` 처럼 판번호에
// 점이 들어가서, 숫자로 시작하는 꼬리를 확장자로 읽으면 안 된다.
const EXTENSION_RE = /\.([a-z][a-z0-9]{0,9})$/i

/** §3-2. 확장자가 있으면 확장자만, 없으면 mimeType. 읽을 수 없으면 null. */
export function readableKind(fileName: string, mimeType: string): ReadableKind | null {
  const match = EXTENSION_RE.exec(fileName)
  if (match) {
    return EXTENSION_KIND[match[1].toLowerCase()] ?? null
  }
  const type = mimeType.split(';')[0].trim().toLowerCase()
  return MIME_KIND[type] ?? null
}

/** §3-4. fatal 디코딩 실패 시 대체 문자로 다시 풀고 replaced=true. \r\n·\r → \n. */
export function decodeUtf8(bytes: Uint8Array): { text: string; replaced: boolean } {
  let text: string
  let replaced = false
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    replaced = true
  }
  return { text: text.replace(/\r\n|\r/g, '\n'), replaced }
}

/** §3-7. */
export function sliceText(
  text: string,
  offset: number,
  limit: number,
): { ok: true; chunk: string; nextOffset: number | null } | { ok: false } {
  const total = text.length
  if (offset > total) return { ok: false }
  if (offset === total) return { ok: true, chunk: '', nextOffset: null }

  let end = Math.min(offset + limit, total)
  if (end < total) {
    // (offset+limit/2, end] 구간의 마지막 개행 뒤로 당긴다 — 행·문단이 반으로 안 잘리게.
    const searchStart = offset + Math.floor(limit / 2)
    const newlineIndex = text.lastIndexOf('\n', end - 1)
    if (newlineIndex > searchStart) {
      end = newlineIndex + 1
    } else {
      // 개행이 없으면 그대로 두되, 서로게이트 쌍이 반으로 안 잘리게 한다.
      // 당기면 한 글자도 못 나가는 경우(limit 1)는 쌍을 통째로 넣는다 — 안 그러면
      // nextOffset 이 offset 과 같아져 따라가는 클라이언트가 같은 호출을 반복한다.
      const code = text.charCodeAt(end - 1)
      if (code >= 0xd800 && code <= 0xdbff) end = end - 1 > offset ? end - 1 : end + 1
    }
  }

  return { ok: true, chunk: text.slice(offset, end), nextOffset: end < total ? end : null }
}

/** findFirst 인자. get_download_url(server.ts:215-230) 과 같은 판 선택 + document.title. */
export function readVersionQuery(id: string, versionNo: number | undefined) {
  const versionSelect = { versionNo: true, fileName: true, mimeType: true, sizeBytes: true, s3Key: true } as const

  return {
    where: { id, ...activeDocumentWhere() },
    select: {
      title: true,
      versions:
        versionNo === undefined
          ? { orderBy: { versionNo: 'desc' as const }, take: 1, select: versionSelect }
          : { where: { versionNo }, select: versionSelect },
    },
  } satisfies {
    where: Prisma.DocumentWhereInput
    select: Prisma.DocumentSelect
  }
}

export type ReadMeta = {
  documentId: string
  title: string
  versionNo: number
  fileName: string
  kind: ReadableKind
  format: 'text' | 'raw'
  sizeBytes: number
  offset: number
  returnedChars: number
  totalChars: number
  nextOffset: number | null
  encodingWarning: string | null
}

export type ReadVersion = {
  documentId: string
  title: string
  versionNo: number
  fileName: string
  mimeType: string
  sizeBytes: number
  s3Key: string
}

export type ReadInput = { offset: number; limit: number; format: 'text' | 'raw' }

export type ReadDeps = {
  /** s3.ts 의 getObjectBytes. 실패면 null. */
  getObjectBytes: (key: string, maxBytes: number) => Promise<Uint8Array | null>
  /** xlsx-text.ts 의 parseXlsx. 해석 실패는 throw. */
  parseXlsx: (bytes: Uint8Array) => Promise<SheetRows[]>
}

export type ReadFailure = {
  error: string
  hint?: string
  fileName: string
  versionNo: number
  sizeBytes: number
}

export type ReadOutcome = { ok: true; meta: ReadMeta; chunk: string } | { ok: false; failure: ReadFailure }

/** §5 흐름 ②~⑧. DB 는 모르고 판 하나만 받는다. */
export async function readDocumentContent(
  version: ReadVersion,
  input: ReadInput,
  deps: ReadDeps,
): Promise<ReadOutcome> {
  const { documentId, title, versionNo, fileName, mimeType, sizeBytes, s3Key } = version
  const { offset, limit, format } = input

  function failure(error: string, hint?: string): ReadOutcome {
    return { ok: false, failure: { error, hint, fileName, versionNo, sizeBytes } }
  }

  const kind = readableKind(fileName, mimeType)
  if (kind === null) return failure(READ_UNSUPPORTED_FORMAT, READ_DOWNLOAD_HINT)
  if (sizeBytes > MAX_READ_BYTES) return failure(READ_TOO_LARGE, READ_DOWNLOAD_HINT)

  let text = ''
  let encodingWarning: string | null = null

  if (sizeBytes > 0) {
    const bytes = await deps.getObjectBytes(s3Key, MAX_READ_BYTES)
    if (bytes === null) return failure(READ_FETCH_FAILED, READ_DOWNLOAD_HINT)
    if (bytes.length > MAX_READ_BYTES) return failure(READ_TOO_LARGE, READ_DOWNLOAD_HINT)

    if (kind === 'xlsx') {
      let sheets: SheetRows[]
      try {
        sheets = await deps.parseXlsx(bytes)
      } catch {
        return failure(READ_PARSE_FAILED, READ_DOWNLOAD_HINT)
      }
      text = sheetsToText(sheets)
    } else {
      const decoded = decodeUtf8(bytes)
      encodingWarning = decoded.replaced ? READ_ENCODING_WARNING : null
      text = kind === 'html' && format === 'text' ? htmlToText(decoded.text) : decoded.text
    }
  }

  const effectiveFormat: 'text' | 'raw' = kind === 'html' ? format : 'text'

  const sliced = sliceText(text, offset, limit)
  if (!sliced.ok) return failure(READ_OFFSET_OUT_OF_RANGE)

  const meta: ReadMeta = {
    documentId,
    title,
    versionNo,
    fileName,
    kind,
    format: effectiveFormat,
    sizeBytes,
    offset,
    returnedChars: sliced.chunk.length,
    totalChars: text.length,
    nextOffset: sliced.nextOffset,
    encodingWarning,
  }

  return { ok: true, meta, chunk: sliced.chunk }
}
