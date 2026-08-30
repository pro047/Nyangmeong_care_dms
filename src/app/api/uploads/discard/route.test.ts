import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

// DB·S3·디스코드는 테스트 환경에 없다. 라우트가 "무엇을 어떤 인자로 부르고
// 무엇을 돌려주는가"만 본다 (versions/route.test.ts 와 같은 패턴).
const { getSession, count, deleteObject, verifyUploadToken } = vi.hoisted(() => ({
  getSession: vi.fn(),
  count: vi.fn(),
  deleteObject: vi.fn(),
  verifyUploadToken: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ getSession }))
vi.mock('@/lib/prisma', () => ({ prisma: { documentVersion: { count } } }))
vi.mock('@/lib/s3', () => ({ deleteObject }))
vi.mock('@/lib/upload-token', () => ({ verifyUploadToken }))

const BASE = 'http://localhost:3002/api/uploads/discard'
const SESSION = { id: 'user_1', discordId: 'd1', username: 'u', avatarUrl: null }
const BODY = { s3Key: 'documents/abc.pdf', keyToken: 'token_1' }

function post(body: unknown) {
  return new NextRequest(BASE, { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(SESSION)
  verifyUploadToken.mockReset().mockResolvedValue(true)
  count.mockReset().mockResolvedValue(0)
  deleteObject.mockReset().mockResolvedValue(undefined)
})

describe('POST /api/uploads/discard — 차단 순서', () => {
  it('세션이 없으면 401 이고 토큰 검증에 가지 않아야 한다', async () => {
    getSession.mockResolvedValue(null)

    const res = await POST(post(BODY))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: '로그인이 필요합니다.' })
    expect(verifyUploadToken).not.toHaveBeenCalled()
  })

  it('본문 형식이 틀리면 400 이고 토큰 검증에 가지 않아야 한다', async () => {
    const res = await POST(post({}))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '요청 형식이 올바르지 않습니다.' })
    expect(verifyUploadToken).not.toHaveBeenCalled()
  })

  it('토큰 검증에 실패하면 400 이고 DB 조회에 가지 않아야 한다', async () => {
    // 토큰 검증이 삭제 권한의 전부다 — 서명 없는 키는 여기서 전부 걸린다.
    verifyUploadToken.mockResolvedValue(false)

    const res = await POST(post(BODY))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '업로드 정보가 만료되었거나 올바르지 않습니다.' })
    expect(count).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })
})

describe('POST /api/uploads/discard — 삭제 판정', () => {
  it('이미 문서가 된 키면 deleteObject 를 부르지 않고 deleted:false 여야 한다', async () => {
    // create 실패가 "저장은 됐는데 응답만 잃음"인 경우 — 지우면 그 문서 파일이 사라진다.
    count.mockResolvedValue(1)

    const res = await POST(post(BODY))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: false })
    expect(count).toHaveBeenCalledWith({ where: { s3Key: BODY.s3Key } })
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('참조하는 버전이 없으면 그 키를 지우고 deleted:true 여야 한다', async () => {
    const res = await POST(post(BODY))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: true })
    expect(verifyUploadToken).toHaveBeenCalledWith(BODY.keyToken, BODY.s3Key, SESSION.id)
    expect(deleteObject).toHaveBeenCalledWith(BODY.s3Key)
  })

  it('deleteObject 가 throw 해도 200 deleted:false 여야 한다 (정리는 최선 노력)', async () => {
    // 500 을 내면 사람이 '닫기'를 눌렀을 뿐인데 실패로 보인다.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    deleteObject.mockRejectedValue(new Error('s3 down'))

    const res = await POST(post(BODY))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: false })
    consoleError.mockRestore()
  })
})
