import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/server'
import type { PrismaClient } from '@/generated/prisma/client'
import { registerDmsTools } from '@/lib/mcp/server'
import { ACTIVE_DOCUMENT_NOT_FOUND } from '@/lib/trash'

// 실제 DB·S3 없이 "도구가 무엇을 어떤 인자로 조회하고 무엇을 돌려주는가"만 본다.
// server.ts 가 prisma·presignDownload 를 주입받게 된 이유가 이 테스트다.
type ToolResult = {
  content: { type: string; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}
type ToolCallback = (args: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>

const documentFindMany = vi.fn()
const documentFindFirst = vi.fn()
const folderFindMany = vi.fn()
const presignDownload = vi.fn()

const tools = new Map<string, { config: { inputSchema?: unknown }; cb: ToolCallback }>()

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
  registerDmsTools(server, { prisma, presignDownload })
}

function call(name: string, args: Record<string, unknown>) {
  const tool = tools.get(name)
  if (!tool) throw new Error(`도구 ${name} 이 등록되지 않았다`)
  return tool.cb(args, {})
}

beforeEach(() => {
  documentFindMany.mockReset().mockResolvedValue([])
  documentFindFirst.mockReset()
  folderFindMany.mockReset().mockResolvedValue([])
  presignDownload.mockReset()
  setup()
})

describe('registerDmsTools — 등록', () => {
  it('1단계 도구 4개만 등록해야 한다 (업로드 도구는 2단계)', () => {
    expect([...tools.keys()].sort()).toEqual(
      ['get_document', 'get_download_url', 'list_folders', 'search_documents'].sort(),
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
