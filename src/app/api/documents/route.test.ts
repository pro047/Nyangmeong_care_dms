import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'
import { S3_KEY_ALREADY_USED } from '@/lib/upload-guard'

// DB·S3·디스코드는 테스트 환경에 없다. 라우트가 "무엇을 어떤 인자로 부르고
// 무엇을 돌려주는가"만 본다 (versions/route.test.ts 와 같은 패턴).
const { getSession, findFirst, create, verifyUploadToken, headObjectSize, notifyUpload } =
  vi.hoisted(() => ({
    getSession: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    verifyUploadToken: vi.fn(),
    headObjectSize: vi.fn(),
    notifyUpload: vi.fn(),
  }))
vi.mock('@/lib/session', () => ({ getSession }))
vi.mock('@/lib/prisma', () => ({
  prisma: { documentVersion: { findFirst }, document: { create } },
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
