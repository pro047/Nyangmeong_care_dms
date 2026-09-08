import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from './route'
import { S3_KEY_ALREADY_USED } from '@/lib/upload-guard'

// DB·S3·디스코드는 테스트 환경에 없다. 라우트가 "무엇을 어떤 인자로 부르고
// 무엇을 돌려주는가"만 본다 (versions/route.test.ts 와 같은 패턴).
const { getSession, findFirst, findMany, create, verifyUploadToken, headObjectSize, notifyUpload } =
  vi.hoisted(() => ({
    getSession: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    verifyUploadToken: vi.fn(),
    headObjectSize: vi.fn(),
    notifyUpload: vi.fn(),
  }))
vi.mock('@/lib/session', () => ({ getSession }))
vi.mock('@/lib/prisma', () => ({
  prisma: { documentVersion: { findFirst }, document: { create, findMany } },
}))
vi.mock('@/lib/s3', () => ({ MAX_UPLOAD_BYTES: 100 * 1024 * 1024, headObjectSize }))
vi.mock('@/lib/upload-token', () => ({ verifyUploadToken }))
vi.mock('@/lib/discord', () => ({ notifyUpload }))

const BASE = 'http://localhost:3002/api/documents'
const SESSION = { id: 'user_1', discordId: 'd1', username: 'u', avatarUrl: null }
const BODY = {
  title: '보고서',
  s3Key: 'documents/abc.pdf',
  keyToken: 'token_1',
  fileName: '보고서.pdf',
  mimeType: 'application/pdf',
}

function post(body: unknown) {
  return new NextRequest(BASE, { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(SESSION)
  verifyUploadToken.mockReset().mockResolvedValue(true)
  headObjectSize.mockReset().mockResolvedValue(1234)
  // 기본값은 "이 키로 만들어진 버전 없음" — 재사용 차단을 통과하는 정상 경로다.
  findFirst.mockReset().mockResolvedValue(null)
  create.mockReset().mockResolvedValue({ id: 'doc_1', title: '보고서' })
  notifyUpload.mockReset().mockResolvedValue(undefined)
  findMany.mockReset().mockResolvedValue([])
})

describe('POST /api/documents — keyToken 재사용 차단', () => {
  it('토큰 검증에 실패하면 400 이고 재사용 확인 조회에 가지 않아야 한다', async () => {
    // 재사용 확인은 토큰이 유효한 뒤에만 한다 (무인증 DB 부하 방지).
    verifyUploadToken.mockResolvedValue(false)

    const res = await POST(post(BODY))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '업로드 정보가 만료되었거나 올바르지 않습니다.' })
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('같은 s3Key 의 버전이 이미 있으면 400 이고 S3 조회에 가지 않아야 한다', async () => {
    // keyToken 은 소모되지 않아 TTL 안에 재사용할 수 있다 — 여기서 끊지 않으면
    // 서로 다른 문서가 같은 객체를 가리키고 영구삭제 때 다른 쪽 파일이 걸린다.
    findFirst.mockResolvedValue({ id: 'ver_1' })

    const res = await POST(post(BODY))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: S3_KEY_ALREADY_USED })
    expect(headObjectSize).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('재사용이 아니면 s3Key 로 확인을 거쳐 문서를 만들고 201 이어야 한다', async () => {
    // 재사용 확인이 실제로 그 키를 조회했는지도 본다 — 조회가 비면 차단 자체가 무의미하다.
    const res = await POST(post(BODY))

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'doc_1' })
    expect(findFirst).toHaveBeenCalledWith({
      where: { s3Key: BODY.s3Key },
      select: { id: true },
    })
    expect(create).toHaveBeenCalledTimes(1)
  })
})

// 이 라우트의 소비자는 화면이 아니라 사내 정합성 저장소다. 계약을 어겨도 빌드는 통과하고
// 저쪽만 조용히 깨지므로, 아래는 값이 아니라 **관계**를 고정한다.
describe('GET /api/documents — 외부 계약', () => {
  it('세션이 없으면 401 이고 조회에 가지 않아야 한다', async () => {
    getSession.mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('휴지통을 빼고 문서마다 최신 버전 1건만 뽑아야 한다', async () => {
    await GET()

    const [args] = findMany.mock.calls[0]
    expect(args.where).toEqual({ deletedAt: null })
    // 최신 버전은 컬럼이 아니라 정렬로 구한다 — 이 방향이 뒤집히면 v1 을 최신이라 답한다.
    expect(args.select.versions.orderBy).toEqual({ versionNo: 'desc' })
    expect(args.select.versions.take).toBe(1)
  })

  it('소비자가 읽는 필드를 빠뜨리지 않아야 한다', async () => {
    await GET()

    const [args] = findMany.mock.calls[0]
    expect(args.select.id).toBe(true)
    expect(args.select.versions.select.versionNo).toBe(true)
    expect(args.select.versions.select.fileName).toBe(true)
  })

  it('문서 조회를 잘라 보내지 않아야 한다', async () => {
    // 전량이 아니면 빠진 문서가 저쪽에서 "DMS 에 없음"으로 **조용히** 오분류된다.
    await GET()

    const [args] = findMany.mock.calls[0]
    expect(args.take).toBeUndefined()
    expect(args.skip).toBeUndefined()
    expect(args.cursor).toBeUndefined()
  })

  it('배열이 아니라 documents 키로 감싸야 한다', async () => {
    findMany.mockResolvedValue([{ id: 'doc_1', versions: [{ versionNo: 2, fileName: 'a.pdf' }] }])

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      documents: [{ id: 'doc_1', versions: [{ versionNo: 2, fileName: 'a.pdf' }] }],
    })
  })
})
