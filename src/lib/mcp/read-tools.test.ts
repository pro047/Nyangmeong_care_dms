import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_READ_BYTES,
  READ_DEFAULT_LIMIT,
  READ_DOWNLOAD_HINT,
  READ_ENCODING_WARNING,
  READ_FETCH_FAILED,
  READ_MAX_LIMIT,
  READ_OFFSET_OUT_OF_RANGE,
  READ_PARSE_FAILED,
  READ_TOO_LARGE,
  READ_UNSUPPORTED_FORMAT,
  decodeUtf8,
  readDocumentContent,
  readDocumentInputSchema,
  readVersionQuery,
  readableKind,
  sliceText,
  type ReadDeps,
  type ReadVersion,
} from '@/lib/mcp/read-tools'
import { sheetsToText, type SheetRows } from '@/lib/mcp/xlsx-text'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

describe('readableKind — 확장자 우선, 없을 때만 mimeType (§3-2)', () => {
  it('팀 파일명 html 이면 html 이어야 한다 (K1)', () => {
    expect(readableKind('화면설계서_v0.3_20260912.html', 'text/html')).toBe('html')
  })

  it('확장자 대소문자와 무관하게 판정해야 한다 (K2)', () => {
    expect(readableKind('A.HTML', '')).toBe('html')
    expect(readableKind('b.Htm', '')).toBe('html')
    expect(readableKind('c.MD', '')).toBe('markdown')
    expect(readableKind('d.markdown', '')).toBe('markdown')
    expect(readableKind('e.CSV', '')).toBe('csv')
    expect(readableKind('f.txt', '')).toBe('text')
    expect(readableKind('g.XLSX', '')).toBe('xlsx')
  })

  it('확장자와 mimeType 이 어긋나면 확장자를 따라야 한다 (K3)', () => {
    expect(readableKind('notes.md', 'application/octet-stream')).toBe('markdown')
    expect(readableKind('data.csv', 'application/vnd.ms-excel')).toBe('csv')
  })

  it('확장자가 표 밖이면 mimeType 이 읽을 수 있는 형식이어도 null 이어야 한다 (K4)', () => {
    expect(readableKind('보고서.pdf', 'text/plain')).toBeNull()
    expect(readableKind('old.xls', 'text/csv')).toBeNull()
  })

  it('확장자가 없거나 점 뒤가 숫자면 파라미터를 뗀 mimeType 으로 판정해야 한다 (K5)', () => {
    expect(readableKind('README', 'text/plain')).toBe('text')
    expect(readableKind('설계서_v0.3', 'text/html; charset=utf-8')).toBe('html')
  })

  it('확장자가 없을 때 octet-stream 이면 null, xlsx mimeType 이면 xlsx 여야 한다 (K6)', () => {
    expect(readableKind('README', 'application/octet-stream')).toBeNull()
    expect(readableKind('요구사항정의서', XLSX_MIME)).toBe('xlsx')
  })
})

describe('decodeUtf8 (§3-4)', () => {
  it('한글 UTF-8 바이트면 원문 그대로이고 replaced 가 false 여야 한다 (D1)', () => {
    const result = decodeUtf8(new TextEncoder().encode('회의록, 가나다'))

    expect(result).toEqual({ text: '회의록, 가나다', replaced: false })
  })

  it('EUC-KR 바이트가 섞이면 U+FFFD 로 두고 replaced 가 true 여야 한다 (D2)', () => {
    const result = decodeUtf8(new Uint8Array([0x61, 0xb0, 0xa1, 0x62]))

    expect(result.text).toContain('�')
    expect(result.replaced).toBe(true)
  })

  it('BOM 으로 시작하면 결과 첫 글자가 BOM 이 아니어야 한다 (D3)', () => {
    const result = decodeUtf8(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))

    expect(result.text.charCodeAt(0)).not.toBe(0xfeff)
    expect(result.text).toBe('a')
  })

  it('\\r\\n·\\r 은 \\n 으로 바뀌어야 한다 (D4)', () => {
    expect(decodeUtf8(new TextEncoder().encode('a\r\nb\rc')).text).toBe('a\nb\nc')
  })
})

describe('sliceText (§3-7)', () => {
  it('전체가 limit 이하면 전부 주고 nextOffset 이 null 이어야 한다 (S1)', () => {
    expect(sliceText('abc', 0, 10)).toEqual({ ok: true, chunk: 'abc', nextOffset: null })
  })

  it('개행 없는 긴 문자열이면 정확히 limit 글자와 offset+limit 을 줘야 한다 (S2)', () => {
    const result = sliceText('a'.repeat(100), 20, 30)

    expect(result).toEqual({ ok: true, chunk: 'a'.repeat(30), nextOffset: 50 })
  })

  it('뒤쪽 절반에 개행이 있으면 마지막 개행 바로 뒤에서 끊어야 한다 (S3)', () => {
    // limit 10, 절반 경계 5, 개행 위치 7
    const result = sliceText('aaaaaaa\nbbbbbbbbbb', 0, 10)

    expect(result).toEqual({ ok: true, chunk: 'aaaaaaa\n', nextOffset: 8 })
  })

  it('개행이 앞쪽 절반에만 있으면 그 자리에서 끊지 않고 limit 글자를 줘야 한다 (S4)', () => {
    const result = sliceText('aa\n' + 'b'.repeat(50), 0, 10)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.chunk.length).toBe(10)
    expect(result.nextOffset).toBe(10)
  })

  it('경계가 서로게이트 쌍 가운데면 한 글자 앞에서 끊어야 한다 (S5)', () => {
    // 이모지가 9·10 위치를 차지한다 (limit 10 → limit-1·limit).
    const text = 'a'.repeat(9) + '😀' + 'b'.repeat(10)

    const result = sliceText(text, 0, 10)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.chunk.length).toBe(9)
    const last = result.chunk.charCodeAt(result.chunk.length - 1)
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false)
    expect(result.nextOffset).toBe(9)
  })

  it('limit 1 로 서로게이트 쌍 앞에서 읽으면 쌍을 통째로 주고 앞으로 나아가야 한다 (F2)', () => {
    const text = '😀x'

    const result = sliceText(text, 0, 1)

    expect(result).toEqual({ ok: true, chunk: '😀', nextOffset: 2 })
  })

  it('limit 1 로도 서로게이트가 섞인 본문을 끝까지 이어 읽어야 한다 (F2)', () => {
    const text = 'a😀b😀😀c'

    const joined = readAll(text, 1)

    expect(joined).toBe(text)
  })

  function readAll(text: string, limit: number): string {
    let out = ''
    let offset: number | null = 0
    // 무한 루프 방지 — 한 번에 1글자 이상은 진행해야 한다.
    for (let i = 0; offset !== null && i <= text.length + 1; i++) {
      const result = sliceText(text, offset, limit)
      if (!result.ok) throw new Error(`offset ${offset} 에서 ok:false`)
      out += result.chunk
      offset = result.nextOffset
    }
    if (offset !== null) throw new Error('nextOffset 을 따라가도 끝나지 않았다')
    return out
  }

  it('nextOffset 을 되먹여 모은 청크를 이으면 원문과 같아야 한다 (S6 개행·서로게이트)', () => {
    const withNewlines = Array.from({ length: 40 }, (_, i) => `${i}번째 줄 ${'가'.repeat(i % 7)}`).join('\n')
    const withSurrogates = Array.from({ length: 60 }, (_, i) => (i % 3 === 0 ? '😀' : 'ab')).join('')

    expect(readAll(withNewlines, 17)).toBe(withNewlines)
    expect(readAll(withSurrogates, 5)).toBe(withSurrogates)
  })

  it('offset 이 total 과 같으면 빈 청크 성공, 넘으면 ok:false, 빈 문자열 offset 0 은 성공이어야 한다 (S7)', () => {
    expect(sliceText('abc', 3, 10)).toEqual({ ok: true, chunk: '', nextOffset: null })
    expect(sliceText('abc', 4, 10)).toEqual({ ok: false })
    expect(sliceText('', 0, 10)).toEqual({ ok: true, chunk: '', nextOffset: null })
  })
})

describe('readVersionQuery — get_download_url 과 같은 판 선택 (§3-1)', () => {
  it('versionNo 를 안 주면 versionNo desc 첫 행(take 1)이고 where 가 없어야 한다 (Q1)', () => {
    const query = readVersionQuery('doc_1', undefined)

    expect(query.select.versions).toMatchObject({ orderBy: { versionNo: 'desc' }, take: 1 })
    expect((query.select.versions as { where?: unknown }).where).toBeUndefined()
  })

  it('versionNo 를 주면 그 판을 where 로 걸어야 한다 (Q2)', () => {
    const query = readVersionQuery('doc_1', 2)

    expect((query.select.versions as { where?: unknown }).where).toEqual({ versionNo: 2 })
  })

  it('활성 문서만 보고 title 과 판의 s3Key 를 select 해야 한다 (Q3)', () => {
    const query = readVersionQuery('doc_1', undefined)

    expect(query.where).toEqual({ id: 'doc_1', deletedAt: null })
    expect(query.select.title).toBe(true)
    expect(query.select.versions.select.s3Key).toBe(true)
  })

  it('"최신" 컬럼과 사용자·역할 조건이 없어야 한다 (Q4 — 최신은 정렬로, 조회는 전원 동등)', () => {
    for (const versionNo of [undefined, 2]) {
      const text = JSON.stringify(readVersionQuery('doc_1', versionNo))

      expect(text).not.toMatch(/isLatest|latestVersion/)
      expect(text).not.toMatch(/createdById|uploadedById|role|userId/)
    }
  })

  it('파일 필드는 판(versions) 안에서만 읽고 Document 수준에서는 읽지 않아야 한다 (Document/DocumentVersion 분리)', () => {
    const query = readVersionQuery('doc_1', undefined)

    expect(Object.keys(query.select).sort()).toEqual(['title', 'versions'])
    expect(Object.keys(query.select.versions.select).sort()).toEqual(
      ['fileName', 'mimeType', 's3Key', 'sizeBytes', 'versionNo'].sort(),
    )
  })
})

describe('readDocumentContent (§5 ②~⑧)', () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  const getObjectBytes = vi.fn<ReadDeps['getObjectBytes']>()
  const parseXlsx = vi.fn<ReadDeps['parseXlsx']>()
  const deps: ReadDeps = { getObjectBytes, parseXlsx }
  const INPUT = { offset: 0, limit: READ_DEFAULT_LIMIT, format: 'text' as const }

  const S3_KEY = 'documents/0f3a-secret-key.csv'
  function version(overrides: Partial<ReadVersion> = {}): ReadVersion {
    return {
      documentId: 'doc_1',
      title: '데이터',
      versionNo: 2,
      fileName: 'data.csv',
      mimeType: 'text/csv',
      sizeBytes: 100,
      s3Key: S3_KEY,
      ...overrides,
    }
  }

  beforeEach(() => {
    getObjectBytes.mockReset()
    parseXlsx.mockReset()
  })

  it('읽을 수 없는 형식이면 S3 를 부르지 않고 READ_UNSUPPORTED_FORMAT 과 get_download_url 안내여야 한다 (R1)', async () => {
    const outcome = await readDocumentContent(
      version({ fileName: '보고서.pdf', mimeType: 'application/pdf' }),
      INPUT,
      deps,
    )

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.error).toBe(READ_UNSUPPORTED_FORMAT)
    expect(outcome.failure.hint).toContain('get_download_url')
    expect(getObjectBytes).not.toHaveBeenCalled()
  })

  it('sizeBytes 가 MAX_READ_BYTES+1 이면 S3 를 부르지 않고 READ_TOO_LARGE 여야 한다 (R2)', async () => {
    const outcome = await readDocumentContent(version({ sizeBytes: MAX_READ_BYTES + 1 }), INPUT, deps)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.error).toBe(READ_TOO_LARGE)
    expect(outcome.failure.hint).toBe(READ_DOWNLOAD_HINT)
    expect(getObjectBytes).not.toHaveBeenCalled()
  })

  it('sizeBytes 가 정확히 MAX_READ_BYTES 면 S3 를 불러야 한다 (R2 경계)', async () => {
    getObjectBytes.mockResolvedValue(enc('a,b'))

    const outcome = await readDocumentContent(version({ sizeBytes: MAX_READ_BYTES }), INPUT, deps)

    expect(getObjectBytes).toHaveBeenCalledTimes(1)
    expect(outcome.ok).toBe(true)
  })

  it('S3 는 (s3Key, MAX_READ_BYTES) 로 불러야 한다 (R3)', async () => {
    getObjectBytes.mockResolvedValue(enc('a,b'))

    await readDocumentContent(version(), INPUT, deps)

    expect(getObjectBytes).toHaveBeenCalledWith(S3_KEY, MAX_READ_BYTES)
  })

  it('S3 가 null 이면 READ_FETCH_FAILED 와 안내여야 한다 (R4)', async () => {
    getObjectBytes.mockResolvedValue(null)

    const outcome = await readDocumentContent(version(), INPUT, deps)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.error).toBe(READ_FETCH_FAILED)
    expect(outcome.failure.hint).toContain('get_download_url')
  })

  it('DB sizeBytes 는 작은데 받은 바이트가 MAX+1 이면 해석하지 않고 READ_TOO_LARGE 여야 한다 (R5)', async () => {
    getObjectBytes.mockResolvedValue(new Uint8Array(MAX_READ_BYTES + 1))

    const outcome = await readDocumentContent(
      version({ fileName: '정의서.xlsx', mimeType: XLSX_MIME, sizeBytes: 10 }),
      INPUT,
      deps,
    )

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.error).toBe(READ_TOO_LARGE)
    expect(parseXlsx).not.toHaveBeenCalled()
  })

  it('sizeBytes 가 0 이면 S3 를 부르지 않고 빈 본문 성공이어야 한다 (R6)', async () => {
    const outcome = await readDocumentContent(version({ sizeBytes: 0 }), INPUT, deps)

    expect(getObjectBytes).not.toHaveBeenCalled()
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.chunk).toBe('')
    expect(outcome.meta.totalChars).toBe(0)
    expect(outcome.meta.nextOffset).toBeNull()
  })

  it('UTF-8 csv 면 kind csv, 본문 그대로, encodingWarning null 이어야 한다 (R7)', async () => {
    getObjectBytes.mockResolvedValue(enc('이름,값\n가,1\n'))

    const outcome = await readDocumentContent(version(), INPUT, deps)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.meta.kind).toBe('csv')
    expect(outcome.chunk).toBe('이름,값\n가,1\n')
    expect(outcome.meta.encodingWarning).toBeNull()
  })

  it('txt 에 EUC-KR 바이트가 있으면 성공하되 READ_ENCODING_WARNING 을 실어야 한다 (R8)', async () => {
    getObjectBytes.mockResolvedValue(new Uint8Array([0xb0, 0xa1, 0x0a]))

    const outcome = await readDocumentContent(
      version({ fileName: '메모.txt', mimeType: 'text/plain' }),
      INPUT,
      deps,
    )

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.meta.encodingWarning).toBe(READ_ENCODING_WARNING)
    expect(READ_ENCODING_WARNING).toContain('UTF-8')
    expect(READ_ENCODING_WARNING).toContain('get_download_url')
  })

  it('html 이면 format text 는 태그를 걷고 format raw 는 원문 그대로여야 한다 (R9)', async () => {
    const html = '<html><body><h1>화면</h1><p>설명</p></body></html>'
    getObjectBytes.mockResolvedValue(enc(html))
    const htmlVersion = version({ fileName: '화면설계서_v0.3.html', mimeType: 'text/html' })

    const asText = await readDocumentContent(htmlVersion, INPUT, deps)
    const asRaw = await readDocumentContent(htmlVersion, { ...INPUT, format: 'raw' }, deps)

    expect(asText.ok && asRaw.ok).toBe(true)
    if (!asText.ok || !asRaw.ok) return
    expect(asText.chunk).not.toMatch(/<[^>]+>/)
    expect(asText.chunk).toContain('화면')
    expect(asText.meta.format).toBe('text')
    expect(asRaw.chunk).toBe(html)
    expect(asRaw.meta.format).toBe('raw')
  })

  it('md 에 format raw 를 줘도 meta.format 은 text 여야 한다 (R10)', async () => {
    getObjectBytes.mockResolvedValue(enc('# 제목'))

    const outcome = await readDocumentContent(
      version({ fileName: 'notes.md', mimeType: 'text/markdown' }),
      { ...INPUT, format: 'raw' },
      deps,
    )

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.meta.format).toBe('text')
  })

  it('xlsx 면 받은 바이트로 parseXlsx 를 부르고 본문은 sheetsToText 결과여야 한다 (R11)', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    const sheets: SheetRows[] = [{ name: '요구사항', rows: [{ number: 1, cells: ['ID', '내용'] }] }]
    getObjectBytes.mockResolvedValue(bytes)
    parseXlsx.mockResolvedValue(sheets)

    const outcome = await readDocumentContent(
      version({ fileName: '정의서.xlsx', mimeType: XLSX_MIME }),
      INPUT,
      deps,
    )

    expect(parseXlsx).toHaveBeenCalledWith(bytes)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.chunk).toBe(sheetsToText(sheets))
    expect(outcome.meta.kind).toBe('xlsx')
    expect(outcome.meta.encodingWarning).toBeNull()
  })

  it('parseXlsx 가 throw 하면 READ_PARSE_FAILED 이고 예외 메시지(내부 경로)를 싣지 않아야 한다 (R12)', async () => {
    getObjectBytes.mockResolvedValue(new Uint8Array([1, 2, 3]))
    parseXlsx.mockRejectedValue(new Error('내부 경로 /var/task/node_modules/exceljs 실패'))

    const outcome = await readDocumentContent(
      version({ fileName: '정의서.xlsx', mimeType: XLSX_MIME }),
      INPUT,
      deps,
    )

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.error).toBe(READ_PARSE_FAILED)
    expect(outcome.failure.hint).toContain('get_download_url')
    expect(JSON.stringify(outcome.failure)).not.toContain('/var/task')
  })

  it('offset 이 totalChars 를 넘으면 READ_OFFSET_OUT_OF_RANGE 이고 hint 가 없어야 한다 (R13)', async () => {
    getObjectBytes.mockResolvedValue(enc('abc'))

    const outcome = await readDocumentContent(version(), { ...INPUT, offset: 4 }, deps)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.error).toBe(READ_OFFSET_OUT_OF_RANGE)
    expect(outcome.failure.hint).toBeUndefined()
  })

  it('성공 meta 는 §4-1 필드를 전부 채우고 어디에도 s3Key 가 없어야 한다 (R14)', async () => {
    const body = 'x'.repeat(30)
    getObjectBytes.mockResolvedValue(enc(body))

    const outcome = await readDocumentContent(version({ sizeBytes: 30 }), { ...INPUT, offset: 5, limit: 10 }, deps)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.meta).toEqual({
      documentId: 'doc_1',
      title: '데이터',
      versionNo: 2,
      fileName: 'data.csv',
      kind: 'csv',
      format: 'text',
      sizeBytes: 30,
      offset: 5,
      returnedChars: 10,
      totalChars: 30,
      nextOffset: 15,
      encodingWarning: null,
    })
    expect(outcome.meta.returnedChars).toBe(outcome.chunk.length)
    expect(JSON.stringify(outcome)).not.toContain(S3_KEY)
  })

  it('실패 failure 에도 s3Key 가 없어야 한다 (R14)', async () => {
    getObjectBytes.mockResolvedValue(null)

    const outcome = await readDocumentContent(version(), INPUT, deps)

    expect(outcome.ok).toBe(false)
    expect(JSON.stringify(outcome)).not.toContain(S3_KEY)
  })
})

describe('readDocumentInputSchema (R15)', () => {
  it('offset·limit·format 을 안 주면 0·20000·text 여야 한다', () => {
    expect(readDocumentInputSchema.parse({ id: 'doc_1' })).toEqual({
      id: 'doc_1',
      offset: 0,
      limit: 20_000,
      format: 'text',
    })
    expect(READ_DEFAULT_LIMIT).toBe(20_000)
  })

  it('limit 이 READ_MAX_LIMIT 를 넘거나 offset 이 음수면 파싱에 실패해야 한다', () => {
    expect(READ_MAX_LIMIT).toBe(100_000)
    expect(readDocumentInputSchema.safeParse({ id: 'doc_1', limit: 100_001 }).success).toBe(false)
    expect(readDocumentInputSchema.safeParse({ id: 'doc_1', offset: -1 }).success).toBe(false)
    expect(readDocumentInputSchema.safeParse({ id: 'doc_1', limit: 100_000 }).success).toBe(true)
  })
})
