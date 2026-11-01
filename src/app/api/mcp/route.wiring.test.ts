import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SILENT_FORBIDDEN } from '@/lib/upload-commit'
import './route'

// 라우트 래퍼가 도구 인자를 커밋 계층까지 전달하는지 본다. 타입은 세 인자 래퍼를 잡지 못해서
// (DESIGN 현황 4-2) 래퍼를 빠뜨리면 silent 가 조용히 버려진다. 그래서 registerDmsTools·addVersion
// 은 실제 코드를 쓰고 바깥 경계(mcp-handler·DB·S3·토큰·디스코드·측정 예약)만 목으로 막는다.
// route.test.ts 는 실제 mcp-handler 로 401 을 보므로 이 목을 공유하지 않게 파일을 나눴다.
type ToolResult = {
  content: { type: string; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}
type ToolCallback = (args: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>
type ToolConfig = { inputSchema: { parse: (v: unknown) => Record<string, unknown> } }
type FakeServer = { registerTool: (name: string, config: ToolConfig, cb: ToolCallback) => void }

const ADMIN_DISCORD_ID = vi.hoisted(() => {
  // env.ts 가 import 시점에 process.env 를 파싱하고 vitest.config.mts 에는 이 값이 없다.
  const id = '375871831044915200'
  process.env.ADMIN_DISCORD_ID = id
  return id
})

const mocks = vi.hoisted(() => ({
  captured: { init: undefined as ((server: FakeServer) => void) | undefined },
  documentFindUnique: vi.fn(),
  documentUpdate: vi.fn(),
  documentCreate: vi.fn(),
  documentVersionFindFirst: vi.fn(),
  verifyUploadToken: vi.fn(),
  headObjectSize: vi.fn(),
  notifyUpload: vi.fn(),
  scheduleMeasure: vi.fn(),
}))

vi.mock('mcp-handler', () => ({
  createMcpHandler: (init: (server: FakeServer) => void) => {
    mocks.captured.init = init
    return () => new Response(null)
  },
  withMcpAuth: (handler: unknown) => handler,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    document: {
      findUnique: mocks.documentFindUnique,
      update: mocks.documentUpdate,
      create: mocks.documentCreate,
    },
    documentVersion: { findFirst: mocks.documentVersionFindFirst },
  },
}))
vi.mock('@/lib/s3', () => ({
  MAX_UPLOAD_BYTES: 100 * 1024 * 1024,
  presignDownload: vi.fn(),
  presignUpload: vi.fn(),
  buildS3Key: vi.fn(),
  headObjectSize: mocks.headObjectSize,
  deleteObject: vi.fn(),
  getObjectBytes: vi.fn(),
}))
vi.mock('@/lib/upload-token', () => ({
  verifyUploadToken: mocks.verifyUploadToken,
  signUploadToken: vi.fn(),
}))
vi.mock('@/lib/discord', () => ({ notifyUpload: mocks.notifyUpload }))
vi.mock('@/lib/consistency-schedule', () => ({ scheduleConsistencyMeasure: mocks.scheduleMeasure }))

const tools = new Map<string, { config: ToolConfig; cb: ToolCallback }>()

const OWNER = { id: 'user_1', discordId: '1000000000000000001', username: '홍길동' }
const ADMIN = { id: 'user_admin', discordId: ADMIN_DISCORD_ID, username: '관리자' }

const FILE = {
  s3Key: 'documents/new-uuid.pdf',
  keyToken: 'key_token_1',
  fileName: '보고서_v2.pdf',
  mimeType: 'application/pdf',
}
const VERSION_ARGS = { ...FILE, documentId: 'doc_1' }

function ctxFor(user: typeof OWNER) {
  return {
    http: {
      authInfo: {
        token: 't',
        clientId: 'c',
        scopes: ['dms'],
        extra: { userId: user.id, discordId: user.discordId, username: user.username },
      },
    },
  }
}

// SDK 는 콜백 전에 inputSchema 로 파싱한다. silent 기본값이 이 단계에서 채워진다.
function callTool(name: string, args: Record<string, unknown>, user: typeof OWNER) {
  const tool = tools.get(name)
  if (!tool) throw new Error(`도구 ${name} 이 등록되지 않았다`)
  return tool.cb(tool.config.inputSchema.parse(args), ctxFor(user))
}

beforeEach(() => {
  mocks.documentFindUnique.mockReset().mockResolvedValue({ createdById: OWNER.id, docKey: null })
  mocks.documentUpdate.mockReset().mockResolvedValue({ id: 'doc_1', title: '문서' })
  mocks.documentCreate.mockReset().mockResolvedValue({ id: 'doc_new', title: '보고서' })
  // findFirst 하나가 재사용 확인(where.s3Key)과 최신 판 조회를 함께 받는다.
  mocks.documentVersionFindFirst.mockReset().mockImplementation(async (args: { where: Record<string, unknown> }) =>
    's3Key' in args.where ? null : { versionNo: 2, fileName: '이전.pdf', document: { title: '문서' } },
  )
  mocks.verifyUploadToken.mockReset().mockResolvedValue({ s3Key: FILE.s3Key })
  mocks.headObjectSize.mockReset().mockResolvedValue(1234)
  mocks.notifyUpload.mockReset().mockResolvedValue(undefined)
  mocks.scheduleMeasure.mockReset()

  tools.clear()
  const server: FakeServer = {
    registerTool: (name, config, cb) => {
      tools.set(name, { config, cb })
    },
  }
  mocks.captured.init?.(server)
})

describe('MCP 라우트 배선 — add_version 의 silent', () => {
  // 대조군. 이 케이스가 깨지면 배선 테스트 구성 자체가 커밋까지 닿지 못한다는 뜻이고,
  // 아래 AC-11 의 실패를 silent 전달 누락으로 읽으면 안 된다.
  it('관리자가 silent 없이 부르면 실제 커밋까지 닿아 저장되고 알림이 가야 한다', async () => {
    const result = await callTool('add_version', VERSION_ARGS, ADMIN)

    expect(result.structuredContent).toEqual({ id: 'doc_1', versionNo: 3 })
    expect(mocks.documentUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.notifyUpload).toHaveBeenCalledTimes(1)
  })

  it('AC-11: 관리자 토큰으로 silent: true 면 저장되고 알림은 가지 않아야 한다', async () => {
    const result = await callTool('add_version', { ...VERSION_ARGS, silent: true }, ADMIN)

    expect(result.structuredContent).toEqual({ id: 'doc_1', versionNo: 3 })
    expect(mocks.documentUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.notifyUpload).not.toHaveBeenCalled()
  })

  it('AC-11: 비관리자 소유자 토큰으로 silent: true 면 SILENT_FORBIDDEN 이고 저장하지 않아야 한다', async () => {
    const result = await callTool('add_version', { ...VERSION_ARGS, silent: true }, OWNER)

    expect(result.isError).toBe(true)
    expect(SILENT_FORBIDDEN).toContain('관리자')
    expect(JSON.parse(result.content[0].text).error).toBe(SILENT_FORBIDDEN)
    expect(mocks.documentUpdate).not.toHaveBeenCalled()
    expect(mocks.notifyUpload).not.toHaveBeenCalled()
  })

  it('비관리자 소유자가 silent 없이 부르면 저장되고 알림이 가야 한다', async () => {
    const result = await callTool('add_version', VERSION_ARGS, OWNER)

    expect(result.isError).toBeUndefined()
    expect(mocks.documentUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.notifyUpload).toHaveBeenCalledTimes(1)
  })
})

describe('MCP 라우트 배선 — 다른 경로 불변', () => {
  it('AC-13: create_document 는 관리자여도 알림을 한 번 보내야 한다', async () => {
    const result = await callTool('create_document', FILE, ADMIN)

    expect(result.structuredContent).toEqual({ id: 'doc_new', title: '보고서' })
    expect(mocks.notifyUpload).toHaveBeenCalledTimes(1)
  })
})
