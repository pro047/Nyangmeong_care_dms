import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/server'
import type { PrismaClient } from '@/generated/prisma/client'
import { registerDmsTools } from '@/lib/mcp/server'
import { SIMILAR_CANDIDATES_EXIST } from '@/lib/mcp/upload-tools'
import { ACTIVE_DOCUMENT_NOT_FOUND } from '@/lib/trash'
import { VERSION_FORBIDDEN } from '@/lib/ownership'
import { titleFromFileName } from '@/lib/title'
import { READ_UNSUPPORTED_FORMAT, readVersionQuery } from '@/lib/mcp/read-tools'

// 실제 DB·S3 없이 "도구가 무엇을 어떤 인자로 조회하고 무엇을 돌려주는가"만 본다.
// server.ts 가 prisma·presign·commit 을 주입받게 된 이유가 이 테스트다.
type ToolResult = {
  content: { type: string; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}
type ToolCallback = (args: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>
type ZodLike = { parse: (v: unknown) => Record<string, unknown>; safeParse: unknown }

const documentFindMany = vi.fn()
const documentFindFirst = vi.fn()
const folderFindMany = vi.fn()
const presignDownload = vi.fn()
const presignUpload = vi.fn()
const buildS3Key = vi.fn()
const signUploadToken = vi.fn()
const commitCreateDocument = vi.fn()
const commitAddVersion = vi.fn()
const commitDiscardUpload = vi.fn()
const getObjectBytes = vi.fn()

const tools = new Map<string, { config: { inputSchema?: unknown }; cb: ToolCallback }>()

const ADMIN_DISCORD_ID = '375871831044915200'
const VIEWER = { id: 'user_1', discordId: '1000000000000000001', username: '홍길동' }
// auth.ts(verifyMcpBearer)가 만드는 모양 — 사용자 값은 extra 에 있다.
const AUTH_CTX = {
  http: {
    authInfo: {
      token: 't',
      clientId: 'c',
      scopes: ['dms'],
      extra: { userId: VIEWER.id, discordId: VIEWER.discordId, username: VIEWER.username },
    },
  },
}

function setup() {
  tools.clear()
  const server = {
    registerTool: (name: string, config: { inputSchema?: unknown }, cb: ToolCallback) => {
      tools.set(name, { config, cb })
    },
  } as unknown as McpServer
  const prisma = {
    document: { findMany: documentFindMany, findFirst: documentFindFirst },
    folder: { findMany: folderFindMany },
  } as unknown as PrismaClient
  registerDmsTools(server, {
    prisma,
    presignDownload,
    presignUpload,
    buildS3Key,
    signUploadToken,
    adminDiscordId: ADMIN_DISCORD_ID,
    getObjectBytes,
    commit: {
      createDocument: commitCreateDocument,
      addVersion: commitAddVersion,
      discardUpload: commitDiscardUpload,
    },
  })
}

function call(name: string, args: Record<string, unknown>) {
  const tool = tools.get(name)
  if (!tool) throw new Error(`도구 ${name} 이 등록되지 않았다`)
  return tool.cb(args, {})
}

// SDK 는 콜백 전에 inputSchema 로 파싱한다(기본값 적용 포함). 올리기 도구는 그걸 흉내 낸다.
function callWithAuth(name: string, args: Record<string, unknown>, ctx: unknown = AUTH_CTX) {
  const tool = tools.get(name)
  if (!tool) throw new Error(`도구 ${name} 이 등록되지 않았다`)
  return tool.cb((tool.config.inputSchema as ZodLike).parse(args), ctx)
}

beforeEach(() => {
  documentFindMany.mockReset().mockResolvedValue([])
  documentFindFirst.mockReset()
  folderFindMany.mockReset().mockResolvedValue([])
  presignDownload.mockReset()
  presignUpload.mockReset().mockResolvedValue('https://s3.example/put?X-Amz-Signature=abc')
  buildS3Key.mockReset().mockReturnValue('documents/new-uuid.pdf')
  signUploadToken.mockReset().mockResolvedValue('key_token_1')
  commitCreateDocument.mockReset().mockResolvedValue({ ok: true, status: 201, value: { id: 'doc_new', title: '보고서' } })
  commitAddVersion
    .mockReset()
    .mockResolvedValue({ ok: true, status: 201, value: { id: 'doc_1', title: '문서', versionNo: 3 } })
  commitDiscardUpload.mockReset().mockResolvedValue({ ok: true, status: 200, value: { deleted: true } })
  getObjectBytes.mockReset()
  setup()
})

describe('registerDmsTools — 등록', () => {
  it('읽기 4개·올리기 5개·본문 읽기 1개, 도구 10개를 등록해야 한다 (MILESTONES 도구 표)', () => {
    expect([...tools.keys()].sort()).toEqual(
      [
        'search_documents',
        'list_folders',
        'get_document',
        'get_download_url',
        'read_document',
        'find_similar_documents',
        'request_upload',
        'create_document',
        'add_version',
        'discard_upload',
      ].sort(),
    )
  })

  it('inputSchema 는 raw shape 가 아니라 zod 객체여야 한다 (deprecated 오버로드 회피)', () => {
    for (const { config } of tools.values()) {
      expect(typeof (config.inputSchema as { safeParse?: unknown }).safeParse).toBe('function')
    }
  })
})

describe('search_documents', () => {
  it('휴지통 제외를 AND 에 넣고, q 가 없으면 검색 조건을 얹지 않아야 한다', async () => {
    await call('search_documents', { take: 20 })

    const args = documentFindMany.mock.calls[0][0]
    expect(args.where.AND).toContainEqual({ deletedAt: null })
    expect(JSON.stringify(args.where)).not.toContain('contains')
    expect(args.take).toBe(20)
  })

  it('q·folderId·tag 를 전부 AND 로 결합해야 한다', async () => {
    await call('search_documents', { q: '  회의록 ', folderId: 'f1', tag: '기획', take: 5 })

    const { where } = documentFindMany.mock.calls[0][0]
    expect(where.AND).toContainEqual({ deletedAt: null })
    expect(where.AND).toContainEqual({ folderId: 'f1' })
    expect(where.AND).toContainEqual({ tags: { some: { tag: { name: '기획' } } } })
    // normalizeSearchQuery 를 거쳐 공백이 잘린 값으로 검색한다.
    expect(JSON.stringify(where)).toContain('"contains":"회의록"')
  })

  it('조회 조건에 사용자·역할 조건이 없어야 한다 (조회는 전원 동등)', async () => {
    await call('search_documents', { take: 20 })

    const { where } = documentFindMany.mock.calls[0][0]
    const text = JSON.stringify(where)
    expect(text).not.toMatch(/createdById|uploadedById|role|userId/)
  })

  it('결과를 content 텍스트(JSON)와 structuredContent 에 같은 객체로 실어야 한다', async () => {
    documentFindMany.mockResolvedValue([
      {
        id: 'doc_1',
        title: '제목',
        description: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        folder: null,
        createdBy: { username: '홍길동' },
        tags: [],
        versions: [
          { versionNo: 1, fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 1, createdAt: new Date('2026-01-01T00:00:00Z') },
          { versionNo: 2, fileName: 'b.pdf', mimeType: 'application/pdf', sizeBytes: 2, createdAt: new Date('2026-01-02T00:00:00Z') },
        ],
      },
    ])

    const result = await call('search_documents', { take: 20 })

    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0].text)).toEqual(
      JSON.parse(JSON.stringify(result.structuredContent)),
    )
    const documents = (result.structuredContent as { documents: { latest: { versionNo: number } }[] })
      .documents
    expect(documents[0].latest.versionNo).toBe(2)
  })
})

describe('get_document', () => {
  it('활성 문서만 조회해야 한다', async () => {
    documentFindFirst.mockResolvedValue(null)

    await call('get_document', { id: 'doc_1' })

    expect(documentFindFirst.mock.calls[0][0].where).toEqual({ id: 'doc_1', deletedAt: null })
  })

  it('없거나 휴지통이면 isError 와 공용 문구를 돌려줘야 한다', async () => {
    documentFindFirst.mockResolvedValue(null)

    const result = await call('get_document', { id: 'doc_1' })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(ACTIVE_DOCUMENT_NOT_FOUND)
    expect(result.content[0].text).toBe('문서를 찾을 수 없거나 휴지통에 있습니다.')
  })

  it('조회 select 에 s3Key 를 넣지 않아야 한다 (저장 위치는 다운로드 URL 로만 나간다)', async () => {
    documentFindFirst.mockResolvedValue(null)

    await call('get_document', { id: 'doc_1' })

    expect(JSON.stringify(documentFindFirst.mock.calls[0][0].select)).not.toContain('s3Key')
  })
})

describe('get_download_url — 최신 판은 versionNo desc 정렬로 구한다', () => {
  const VERSION = {
    versionNo: 3,
    fileName: '보고서.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1234,
    s3Key: 'documents/abc.pdf',
  }

  it('versionNo 를 안 주면 versionNo desc 첫 행(take 1)을 골라야 한다', async () => {
    documentFindFirst.mockResolvedValue({ versions: [VERSION] })
    presignDownload.mockResolvedValue('https://s3.example/signed')

    await call('get_download_url', { id: 'doc_1' })

    const args = documentFindFirst.mock.calls[0][0]
    expect(args.where).toEqual({ id: 'doc_1', deletedAt: null })
    expect(args.select.versions.orderBy).toEqual({ versionNo: 'desc' })
    expect(args.select.versions.take).toBe(1)
    expect(args.select.versions.where).toBeUndefined()
    // "최신" 컬럼이 스며들면 여기서 잡힌다.
    expect(JSON.stringify(args)).not.toMatch(/isLatest|latestVersion/)
  })

  it('versionNo 를 주면 그 판을 조건으로 걸어야 한다', async () => {
    documentFindFirst.mockResolvedValue({ versions: [{ ...VERSION, versionNo: 2 }] })
    presignDownload.mockResolvedValue('https://s3.example/signed')

    await call('get_download_url', { id: 'doc_1', versionNo: 2 })

    const args = documentFindFirst.mock.calls[0][0]
    expect(args.select.versions.where).toEqual({ versionNo: 2 })
  })
})

describe('get_download_url — 파일은 앱 서버를 거치지 않는다', () => {
  const VERSION = {
    versionNo: 3,
    fileName: '보고서.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1234,
    s3Key: 'documents/abc.pdf',
  }

  it('presignDownload(s3Key, fileName, false) 로 받은 URL 만 돌려줘야 한다', async () => {
    documentFindFirst.mockResolvedValue({ versions: [VERSION] })
    presignDownload.mockResolvedValue('https://s3.example/signed?X-Amz-Signature=abc')

    const result = await call('get_download_url', { id: 'doc_1' })

    expect(presignDownload).toHaveBeenCalledTimes(1)
    expect(presignDownload).toHaveBeenCalledWith('documents/abc.pdf', '보고서.pdf', false)
    expect(result.structuredContent).toEqual({
      url: 'https://s3.example/signed?X-Amz-Signature=abc',
      fileName: '보고서.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1234,
      expiresInSeconds: 300,
      versionNo: 3,
    })
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
  })

  it('응답에 s3Key 를 싣지 않아야 한다', async () => {
    documentFindFirst.mockResolvedValue({ versions: [VERSION] })
    presignDownload.mockResolvedValue('https://s3.example/signed')

    const result = await call('get_download_url', { id: 'doc_1' })

    expect(result.content[0].text).not.toContain('documents/abc.pdf')
    expect(result.structuredContent).not.toHaveProperty('s3Key')
  })

  it('문서가 없거나 휴지통이면 presign 하지 않고 isError 여야 한다', async () => {
    documentFindFirst.mockResolvedValue(null)

    const result = await call('get_download_url', { id: 'doc_1' })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(ACTIVE_DOCUMENT_NOT_FOUND)
    expect(presignDownload).not.toHaveBeenCalled()
  })

  it('지정한 판이 없으면 presign 하지 않고 isError 여야 한다', async () => {
    documentFindFirst.mockResolvedValue({ versions: [] })

    const result = await call('get_download_url', { id: 'doc_1', versionNo: 9 })

    expect(result.isError).toBe(true)
    expect(presignDownload).not.toHaveBeenCalled()
  })
})

describe('read_document — 접착 (3단계)', () => {
  const S3_KEY = 'documents/0f3a-secret-key.csv'
  const BODY = 'a,b\n1,2\n'
  const CSV_VERSION = {
    versionNo: 1,
    fileName: 'data.csv',
    mimeType: 'text/csv',
    sizeBytes: new TextEncoder().encode(BODY).length,
    s3Key: S3_KEY,
  }

  // SDK 가 inputSchema 로 파싱(기본값 적용)한 뒤 부르는 것을 흉내 내고, ctx 는 비워 둔다 —
  // 1단계 읽기 도구처럼 토큰 사용자를 쓰지 않아야 한다.
  const read = (args: Record<string, unknown>) => callWithAuth('read_document', args, {})

  it('versionNo 를 안 주면 readVersionQuery(id, undefined) 와 같은 인자로 조회해야 한다 (V3)', async () => {
    documentFindFirst.mockResolvedValue(null)

    await read({ id: 'doc_1' })

    expect(documentFindFirst).toHaveBeenCalledTimes(1)
    expect(documentFindFirst.mock.calls[0][0]).toEqual(readVersionQuery('doc_1', undefined))
    expect(documentFindFirst.mock.calls[0][0].select.versions.orderBy).toEqual({ versionNo: 'desc' })
  })

  it('versionNo 를 주면 readVersionQuery(id, versionNo) 와 같은 인자로 조회해야 한다 (V3)', async () => {
    documentFindFirst.mockResolvedValue(null)

    await read({ id: 'doc_1', versionNo: 2 })

    expect(documentFindFirst.mock.calls[0][0]).toEqual(readVersionQuery('doc_1', 2))
  })

  it('문서가 없거나 휴지통이면 S3 를 부르지 않고 isError 와 공용 문구여야 한다 (V4)', async () => {
    documentFindFirst.mockResolvedValue(null)

    const result = await read({ id: 'doc_1' })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(ACTIVE_DOCUMENT_NOT_FOUND)
    expect(getObjectBytes).not.toHaveBeenCalled()
  })

  it('지정한 판이 없으면(versions: []) S3 를 부르지 않고 isError 와 공용 문구여야 한다 (V4)', async () => {
    documentFindFirst.mockResolvedValue({ title: '데이터', versions: [] })

    const result = await read({ id: 'doc_1', versionNo: 9 })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(ACTIVE_DOCUMENT_NOT_FOUND)
    expect(getObjectBytes).not.toHaveBeenCalled()
  })

  it('csv 를 읽으면 content 는 [메타 JSON, 본문] 두 블록이고 structuredContent 에 본문이 없어야 한다 (V5·V8)', async () => {
    documentFindFirst.mockResolvedValue({ title: '데이터', versions: [CSV_VERSION] })
    getObjectBytes.mockResolvedValue(new TextEncoder().encode(BODY))

    const result = await read({ id: 'doc_1' })

    expect(result.isError).toBeUndefined()
    expect(result.content).toHaveLength(2)
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
    expect(result.content[1].text).toBe(BODY)
    expect(result.structuredContent).toMatchObject({ documentId: 'doc_1', kind: 'csv', nextOffset: null })
    expect(JSON.stringify(result.structuredContent)).not.toContain('a,b')
  })

  it('성공·실패 응답 어디에도 s3Key 값이 없어야 한다 (V6)', async () => {
    documentFindFirst.mockResolvedValue({ title: '데이터', versions: [CSV_VERSION] })
    getObjectBytes.mockResolvedValueOnce(new TextEncoder().encode(BODY)).mockResolvedValueOnce(null)

    const ok = await read({ id: 'doc_1' })
    const failed = await read({ id: 'doc_1' })

    expect(failed.isError).toBe(true)
    expect(JSON.stringify(ok)).not.toContain(S3_KEY)
    expect(JSON.stringify(failed)).not.toContain(S3_KEY)
  })

  it('pdf 문서면 S3 를 부르지 않고 isError 와 READ_UNSUPPORTED_FORMAT JSON 이어야 한다 (V7)', async () => {
    documentFindFirst.mockResolvedValue({
      title: '보고서',
      versions: [{ ...CSV_VERSION, fileName: '보고서.pdf', mimeType: 'application/pdf' }],
    })

    const result = await read({ id: 'doc_1' })

    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0].text).error).toBe(READ_UNSUPPORTED_FORMAT)
    expect(getObjectBytes).not.toHaveBeenCalled()
  })

  // 읽기 예외(서버가 S3 에서 받는다)는 읽기에만 열렸다 — 올리기 경로의 presign·커밋을 건드리면 안 된다.
  it('본문을 읽어도 presign·업로드 토큰·커밋을 부르지 않고 getObjectBytes 만 불러야 한다', async () => {
    documentFindFirst.mockResolvedValue({ title: '데이터', versions: [CSV_VERSION] })
    getObjectBytes.mockResolvedValue(new TextEncoder().encode(BODY))

    await read({ id: 'doc_1' })

    expect(getObjectBytes).toHaveBeenCalledTimes(1)
    expect(documentFindFirst).toHaveBeenCalledTimes(1)
    for (const fn of [
      presignDownload,
      presignUpload,
      buildS3Key,
      signUploadToken,
      commitCreateDocument,
      commitAddVersion,
      commitDiscardUpload,
      documentFindMany,
      folderFindMany,
    ]) {
      expect(fn).not.toHaveBeenCalled()
    }
  })
})

describe('list_folders', () => {
  it('문서 수는 휴지통을 뺀 활성 문서만 세야 한다', async () => {
    folderFindMany.mockResolvedValue([
      { id: 'f1', name: '회의록', parentId: null, _count: { documents: 2 } },
    ])

    const result = await call('list_folders', {})

    const args = folderFindMany.mock.calls[0][0]
    expect(args.select._count).toEqual({ select: { documents: { where: { deletedAt: null } } } })
    expect(result.structuredContent).toEqual({
      folders: [{ id: 'f1', name: '회의록', parentId: null, documentCount: 2 }],
    })
  })
})

describe('s3Key 노출 — 읽기 도구는 감추고 request_upload 만 방금 발급한 키를 싣는다', () => {
  it('search_documents·list_folders 조회 select 에 s3Key 가 없어야 한다', async () => {
    await call('search_documents', { take: 20 })
    await call('list_folders', {})

    expect(JSON.stringify(documentFindMany.mock.calls[0][0].select)).not.toContain('s3Key')
    expect(JSON.stringify(folderFindMany.mock.calls[0][0].select)).not.toContain('s3Key')
  })

  it('request_upload 응답에는 방금 발급한 s3Key 가 있어야 한다', async () => {
    const result = await callWithAuth('request_upload', {
      fileName: '보고서.pdf',
      contentType: 'application/pdf',
      size: 1234,
    })

    expect(result.structuredContent).toHaveProperty('s3Key', 'documents/new-uuid.pdf')
  })
})

describe('올리기 도구 5개 — 인증 정보가 없으면 아무것도 부르지 않는다', () => {
  const CASES: [string, Record<string, unknown>][] = [
    ['find_similar_documents', { fileName: '설계서_v0.6.html', folderId: 'f1' }],
    ['request_upload', { fileName: '보고서.pdf', contentType: 'application/pdf', size: 1234 }],
    [
      'create_document',
      { s3Key: 'documents/a.pdf', keyToken: 't', fileName: '보고서.pdf', mimeType: 'application/pdf', folderId: 'f1' },
    ],
    [
      'add_version',
      { documentId: 'doc_1', s3Key: 'documents/a.pdf', keyToken: 't', fileName: '보고서.pdf', mimeType: 'application/pdf' },
    ],
    ['discard_upload', { s3Key: 'documents/a.pdf', keyToken: 't' }],
  ]

  const CTXS: [string, unknown][] = [
    ['ctx 에 http 없음', {}],
    ['authInfo 없음', { http: {} }],
    ['extra 에 사용자 값 없음', { http: { authInfo: { token: 't', clientId: 'c', scopes: ['dms'], extra: {} } } }],
  ]

  for (const [name, args] of CASES) {
    it.each(CTXS)(`${name}: %s 이면 isError 이고 prisma·S3·commit 을 부르지 않아야 한다`, async (_label, ctx) => {
      const result = await callWithAuth(name, args, ctx)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toBe('인증 정보를 읽을 수 없습니다.')
      for (const fn of [
        documentFindMany,
        documentFindFirst,
        folderFindMany,
        presignUpload,
        buildS3Key,
        signUploadToken,
        commitCreateDocument,
        commitAddVersion,
        commitDiscardUpload,
      ]) {
        expect(fn).not.toHaveBeenCalled()
      }
    })
  }
})

describe('find_similar_documents', () => {
  const FOLDER = 'folder_screen_main'
  const row = (id: string, createdById: string, fileName: string) => ({
    id,
    folderId: FOLDER,
    createdById,
    versions: [{ fileName }],
  })

  it('folderId 가 없으면 후보 조회 자체를 하지 않고 빈 배열이어야 한다', async () => {
    const result = await callWithAuth('find_similar_documents', { fileName: '03_메인페이지_화면설계서_v0.6.html' })

    expect(documentFindMany).not.toHaveBeenCalled()
    expect(result.structuredContent).toEqual({ candidates: [] })
  })

  it('같은 폴더의 내 문서만 후보로 내고 각 후보에 판번호 경고를 얹어야 한다', async () => {
    documentFindMany.mockResolvedValue([
      row('doc_mine', VIEWER.id, '03_메인페이지_화면설계서_v0.3_20260819.html'),
      // 남의 문서 — 붙이면 403 이라 후보에서 빠진다 (새 권한 개념이 아니라 기존 소유자 경계).
      row('doc_other', 'user_2', '03_메인페이지_화면설계서_v0.2_20260801.html'),
    ])

    const result = await callWithAuth('find_similar_documents', {
      fileName: '03_메인페이지_화면설계서_v0.6_20260826.html',
      folderId: FOLDER,
    })

    expect(result.isError).toBeUndefined()
    expect(result.structuredContent).toEqual({
      candidates: [
        { documentId: 'doc_mine', latestFileName: '03_메인페이지_화면설계서_v0.3_20260819.html', warning: null },
      ],
    })
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
    // 후보의 최신 파일명은 versionNo desc 로 고른 판이다.
    expect(documentFindMany.mock.calls[0][0].select.versions.orderBy).toEqual({ versionNo: 'desc' })
  })

  it('토큰 사용자가 관리자 discordId 면 남의 문서도 후보로 내야 한다 (adminDiscordId 전달)', async () => {
    documentFindMany.mockResolvedValue([row('doc_other', 'user_2', '03_메인페이지_화면설계서_v0.3_20260819.html')])
    const adminCtx = {
      http: {
        authInfo: {
          ...AUTH_CTX.http.authInfo,
          extra: { ...AUTH_CTX.http.authInfo.extra, discordId: ADMIN_DISCORD_ID },
        },
      },
    }

    const result = await callWithAuth(
      'find_similar_documents',
      { fileName: '03_메인페이지_화면설계서_v0.6_20260826.html', folderId: FOLDER },
      adminCtx,
    )

    const candidates = (result.structuredContent as { candidates: { documentId: string }[] }).candidates
    expect(candidates.map((c) => c.documentId)).toEqual(['doc_other'])
  })
})

describe('request_upload — 파일은 앱 서버를 거치지 않는다', () => {
  const ARGS = { fileName: '01_요구사항 정의서_v0.3.xlsx', contentType: 'application/vnd.ms-excel', size: 1234 }

  it('buildS3Key → presignUpload(key, contentType) → signUploadToken(key, viewer.id) 순으로 불러야 한다', async () => {
    await callWithAuth('request_upload', ARGS)

    expect(buildS3Key).toHaveBeenCalledWith(ARGS.fileName)
    expect(presignUpload).toHaveBeenCalledWith('documents/new-uuid.pdf', ARGS.contentType)
    expect(signUploadToken).toHaveBeenCalledWith('documents/new-uuid.pdf', VIEWER.id)
    const order = [buildS3Key, presignUpload, signUploadToken].map((fn) => fn.mock.invocationCallOrder[0])
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('presigned PUT URL·keyToken·자동 분류 제안을 싣고 content 와 structuredContent 가 같아야 한다', async () => {
    folderFindMany.mockResolvedValue([{ id: 'f-req', name: '요구사항정의서', parentId: null, aliases: [] }])

    const result = await callWithAuth('request_upload', ARGS)

    expect(folderFindMany.mock.calls[0][0].select).toEqual({ id: true, name: true, parentId: true, aliases: true })
    expect(result.structuredContent).toMatchObject({
      s3Key: 'documents/new-uuid.pdf',
      url: 'https://s3.example/put?X-Amz-Signature=abc',
      keyToken: 'key_token_1',
      contentType: ARGS.contentType,
      method: 'PUT',
      expiresInSeconds: 300,
      suggestedFolder: { folderId: 'f-req', name: '요구사항정의서' },
    })
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
  })
})

describe('create_document — 후보 거절 게이트', () => {
  const FOLDER = 'folder_screen_main'
  const FILE = {
    s3Key: 'documents/new-uuid.html',
    keyToken: 'key_token_1',
    fileName: '03_메인페이지_화면설계서_v0.6_20260826.html',
    mimeType: 'text/html',
  }

  beforeEach(() => {
    documentFindMany.mockResolvedValue([
      {
        id: 'doc_1',
        folderId: FOLDER,
        createdById: VIEWER.id,
        versions: [{ fileName: '03_메인페이지_화면설계서_v0.3_20260819.html' }],
      },
    ])
  })

  it('folderId 에 후보가 있고 ignoreSimilar 가 없으면 isError + 후보 목록이고 커밋하지 않아야 한다', async () => {
    const result = await callWithAuth('create_document', { ...FILE, folderId: FOLDER })

    expect(result.isError).toBe(true)
    const payload = JSON.parse(result.content[0].text)
    expect(payload.error).toBe(SIMILAR_CANDIDATES_EXIST)
    expect(payload.candidates.map((c: { documentId: string }) => c.documentId)).toEqual(['doc_1'])
    expect(commitCreateDocument).not.toHaveBeenCalled()
  })

  it('같은 상황에서 ignoreSimilar: true 면 커밋해야 한다', async () => {
    const result = await callWithAuth('create_document', { ...FILE, folderId: FOLDER, ignoreSimilar: true })

    expect(commitCreateDocument).toHaveBeenCalledTimes(1)
    expect(result.isError).toBeUndefined()
    expect(result.structuredContent).toEqual({ id: 'doc_new', title: '보고서' })
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
  })

  // 결과를 버릴 조회다. 커넥션 상한이 5라 한 번이 아깝다.
  it('ignoreSimilar: true 면 후보 조회 자체를 하지 않아야 한다', async () => {
    await callWithAuth('create_document', { ...FILE, folderId: FOLDER, ignoreSimilar: true })

    expect(documentFindMany).not.toHaveBeenCalled()
  })

  // request_upload 의 suggestedFolder.folderId 는 분류 실패 시 null 이다 — 미분류와 같은 뜻이라
  // 후보 조회 없이 폴더 없는 문서로 만든다.
  it('folderId 가 null 이면 후보 조회 없이 folderId 없이 커밋해야 한다', async () => {
    const result = await callWithAuth('create_document', { ...FILE, folderId: null })

    expect(documentFindMany).not.toHaveBeenCalled()
    expect(commitCreateDocument).toHaveBeenCalledTimes(1)
    expect(commitCreateDocument.mock.calls[0][0].folderId).toBeUndefined()
    expect(result.isError).toBeUndefined()
  })

  it('folderId 의 후보가 남의 문서뿐이면 거절하지 않고 folderId 를 실어 커밋해야 한다', async () => {
    documentFindMany.mockResolvedValue([
      {
        id: 'doc_other',
        folderId: FOLDER,
        createdById: 'user_2',
        versions: [{ fileName: '03_메인페이지_화면설계서_v0.3_20260819.html' }],
      },
    ])

    const result = await callWithAuth('create_document', { ...FILE, folderId: FOLDER })

    expect(documentFindMany).toHaveBeenCalledTimes(1)
    expect(result.isError).toBeUndefined()
    expect(commitCreateDocument).toHaveBeenCalledTimes(1)
    expect(commitCreateDocument.mock.calls[0][0].folderId).toBe(FOLDER)
  })

  it('folderId 가 없으면 후보 조회를 아예 하지 않고 커밋해야 한다', async () => {
    await callWithAuth('create_document', FILE)

    expect(documentFindMany).not.toHaveBeenCalled()
    expect(commitCreateDocument).toHaveBeenCalledTimes(1)
  })

  it('title 을 안 주면 titleFromFileName(fileName) 으로 커밋하고 ignoreSimilar 는 넘기지 않아야 한다', async () => {
    await callWithAuth('create_document', FILE)

    const [input, uploader] = commitCreateDocument.mock.calls[0]
    expect(input).toEqual({ ...FILE, folderId: undefined, title: titleFromFileName(FILE.fileName) })
    expect(input).not.toHaveProperty('ignoreSimilar')
    expect(uploader).toEqual(VIEWER)
  })

  it('title 을 주면 그 값으로 커밋해야 한다', async () => {
    await callWithAuth('create_document', { ...FILE, title: '메인 화면설계서' })

    expect(commitCreateDocument.mock.calls[0][0].title).toBe('메인 화면설계서')
  })

  it('커밋이 ok:false 면 isError 와 그 문구를 돌려줘야 한다', async () => {
    commitCreateDocument.mockResolvedValue({ ok: false, status: 400, error: '업로드된 파일을 찾을 수 없습니다.' })

    const result = await callWithAuth('create_document', FILE)

    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      error: '업로드된 파일을 찾을 수 없습니다.',
      s3Key: FILE.s3Key,
    })
  })

  // 화면은 실패·취소 때 upload-flow.ts 가 discard 를 쏘는데 도구 경로엔 그 자리가 없다 —
  // 안내를 안 실으면 최대 100MB 객체가 S3 에 고아로 남는다.
  it('실패 응답은 s3Key 와 discard_upload 안내를 실어야 한다', async () => {
    commitCreateDocument.mockResolvedValue({ ok: false, status: 400, error: '업로드된 파일을 찾을 수 없습니다.' })

    const result = await callWithAuth('create_document', FILE)

    expect(JSON.parse(result.content[0].text).hint).toContain('discard_upload')
  })
})

describe('add_version', () => {
  const ARGS = {
    documentId: 'doc_1',
    s3Key: 'documents/new-uuid.pdf',
    keyToken: 'key_token_1',
    fileName: '보고서_v2.pdf',
    mimeType: 'application/pdf',
  }

  it('commit.addVersion(documentId, 파일 입력, 토큰의 사용자) 로 넘기고 {id, versionNo} 를 돌려줘야 한다', async () => {
    const result = await callWithAuth('add_version', ARGS)

    const { documentId, ...file } = ARGS
    expect(commitAddVersion).toHaveBeenCalledWith(documentId, file, VIEWER)
    expect(result.structuredContent).toEqual({ id: 'doc_1', versionNo: 3 })
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
  })

  it('남의 문서라 ok:false 면 isError 와 VERSION_FORBIDDEN 문구여야 한다', async () => {
    commitAddVersion.mockResolvedValue({ ok: false, status: 403, error: VERSION_FORBIDDEN })

    const result = await callWithAuth('add_version', ARGS)

    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      error: VERSION_FORBIDDEN,
      s3Key: ARGS.s3Key,
    })
    expect(result.structuredContent).toBeUndefined()
  })
})

describe('discard_upload', () => {
  const ARGS = { s3Key: 'documents/new-uuid.pdf', keyToken: 'key_token_1' }

  it('commit.discardUpload(입력, 토큰의 사용자) 결과를 그대로 실어야 한다', async () => {
    commitDiscardUpload.mockResolvedValue({ ok: true, status: 200, value: { deleted: false } })

    const result = await callWithAuth('discard_upload', ARGS)

    expect(commitDiscardUpload).toHaveBeenCalledWith(ARGS, VIEWER)
    expect(result.structuredContent).toEqual({ deleted: false })
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
  })

  it('토큰 불일치로 ok:false 면 isError 여야 한다', async () => {
    commitDiscardUpload.mockResolvedValue({
      ok: false,
      status: 400,
      error: '업로드 정보가 만료되었거나 올바르지 않습니다.',
    })

    const result = await callWithAuth('discard_upload', ARGS)

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('업로드 정보가 만료되었거나 올바르지 않습니다.')
  })
})
