import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'
import { ACTIVE_DOCUMENT_NOT_FOUND } from '@/lib/trash'
import { VERSION_CONFLICT } from '@/lib/version-create'

// DB·S3·디스코드는 테스트 환경에 없다. 라우트가 "무엇을 어떤 인자로 부르고
// 무엇을 돌려주는가"만 본다 (download/route.test.ts 와 같은 패턴).
const { getSession, findFirst, update, verifyUploadToken, headObjectSize, notifyUpload } =
  vi.hoisted(() => ({
    getSession: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    verifyUploadToken: vi.fn(),
    headObjectSize: vi.fn(),
    notifyUpload: vi.fn(),
  }))
vi.mock('@/lib/session', () => ({ getSession }))
vi.mock('@/lib/prisma', () => ({
  prisma: { documentVersion: { findFirst }, document: { update } },
}))
vi.mock('@/lib/s3', () => ({ MAX_UPLOAD_BYTES: 100 * 1024 * 1024, headObjectSize }))
vi.mock('@/lib/upload-token', () => ({ verifyUploadToken }))
vi.mock('@/lib/discord', () => ({ notifyUpload }))

const BASE = 'http://localhost:3002/api/documents/doc_1/versions'
const PARAMS = { params: Promise.resolve({ id: 'doc_1' }) }
const SESSION = { id: 'user_1', discordId: 'd1', username: 'u', avatarUrl: null }
const BODY = {
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
  findFirst.mockReset().mockResolvedValue({ versionNo: 2 })
  update.mockReset().mockResolvedValue({ id: 'doc_1', title: '문서' })
  notifyUpload.mockReset().mockResolvedValue(undefined)
})

describe('POST /api/documents/[id]/versions — 차단 순서', () => {
  it('세션이 없으면 401 이어야 한다', async () => {
    getSession.mockResolvedValue(null)

    const res = await POST(post(BODY), PARAMS)

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: '로그인이 필요합니다.' })
    expect(verifyUploadToken).not.toHaveBeenCalled()
  })

  it('본문 형식이 틀리면 400 이고 토큰 검증에 가지 않아야 한다', async () => {
    const res = await POST(post({}), PARAMS)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '요청 형식이 올바르지 않습니다.' })
    expect(verifyUploadToken).not.toHaveBeenCalled()
  })

  it('토큰 검증에 실패하면 400 이고 S3 를 조회하지 않아야 한다', async () => {
    verifyUploadToken.mockResolvedValue(false)

    const res = await POST(post(BODY), PARAMS)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '업로드 정보가 만료되었거나 올바르지 않습니다.' })
    expect(headObjectSize).not.toHaveBeenCalled()
  })

  it('S3 에 객체가 없으면 400 이고 DB 를 조회하지 않아야 한다', async () => {
    headObjectSize.mockResolvedValue(null)

    const res = await POST(post(BODY), PARAMS)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '업로드된 파일을 찾을 수 없습니다.' })
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('크기가 상한을 넘으면 400 이고 DB 를 조회하지 않아야 한다', async () => {
    headObjectSize.mockResolvedValue(100 * 1024 * 1024 + 1)

    const res = await POST(post(BODY), PARAMS)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '파일이 너무 큽니다. (최대 100MB)' })
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('활성 문서의 버전이 없으면 404 이고 update 에 가지 않아야 한다', async () => {
    // 없는 문서와 휴지통 문서가 같은 조회로 함께 걸린다.
    findFirst.mockResolvedValue(null)

    const res = await POST(post(BODY), PARAMS)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: ACTIVE_DOCUMENT_NOT_FOUND })
    expect(update).not.toHaveBeenCalled()
  })
})

describe('POST /api/documents/[id]/versions — 정상 생성', () => {
  it('최신이 v2 면 v3 를 만들고 201 을 돌려줘야 한다', async () => {
    const res = await POST(post(BODY), PARAMS)

    expect(verifyUploadToken).toHaveBeenCalledWith('token_1', 'documents/abc.pdf', 'user_1')
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'doc_1', versionNo: 3 })

    const args = update.mock.calls[0][0]
    expect(args.where).toEqual({ id: 'doc_1', deletedAt: null })
    expect(args.data.versions.create).toEqual({
      versionNo: 3,
      s3Key: 'documents/abc.pdf',
      fileName: '보고서.pdf',
      mimeType: 'application/pdf',
      // 크기는 클라이언트 신고값이 아니라 HeadObject 결과여야 한다.
      sizeBytes: 1234,
      changeNote: null,
      uploadedById: 'user_1',
    })
    expect(notifyUpload).toHaveBeenCalledWith(
      expect.objectContaining({ versionNo: 3, changeNote: null, uploaderName: 'u' }),
    )
  })

  it('변경 메모는 trim 되어 DB 와 알림에 같은 값으로 가야 한다', async () => {
    await POST(post({ ...BODY, changeNote: ' 메모 ' }), PARAMS)

    const args = update.mock.calls[0][0]
    expect(args.data.versions.create.changeNote).toBe('메모')
    expect(notifyUpload).toHaveBeenCalledWith(expect.objectContaining({ changeNote: '메모' }))
  })
})

describe('POST /api/documents/[id]/versions — 경합·알림 실패', () => {
  it('update 가 P2002 를 던지면 409 문구여야 한다', async () => {
    // 조회와 생성 사이에 남이 같은 번호를 올린 경우 — @@unique 가 직렬화 장치다.
    update.mockRejectedValue({ code: 'P2002' })

    const res = await POST(post(BODY), PARAMS)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: VERSION_CONFLICT })
  })

  it('update 가 P2025 를 던지면 404 문구여야 한다', async () => {
    // 조회와 생성 사이에 문서가 휴지통으로 간 경우.
    update.mockRejectedValue({ code: 'P2025' })

    const res = await POST(post(BODY), PARAMS)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: ACTIVE_DOCUMENT_NOT_FOUND })
  })

  it('모르는 오류는 404/409 로 뭉개지 말고 다시 던져야 한다', async () => {
    update.mockRejectedValue(new Error('boom'))

    await expect(POST(post(BODY), PARAMS)).rejects.toThrow('boom')
  })

  it('notifyUpload 가 실패해도 201 이어야 한다', async () => {
    // 알림 실패가 이미 저장된 버전을 되돌리면 안 된다. 기존 문서 생성 라우트에는
    // 이 성질이 없다(설계 §4.3-6) — 이 라우트만 바깥에서 감싼다.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    notifyUpload.mockRejectedValue(new Error('discord down'))

    const res = await POST(post(BODY), PARAMS)

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'doc_1', versionNo: 3 })
    consoleError.mockRestore()
  })
})

describe('POST /api/documents/[id]/versions — 불변식', () => {
  it('최신 버전은 컬럼이 아니라 versionNo desc 정렬로 골라야 한다', async () => {
    await POST(post(BODY), PARAMS)

    const query = findFirst.mock.calls[0][0]
    expect(query.orderBy).toEqual({ versionNo: 'desc' })
    expect(query.where).not.toHaveProperty('versionNo')
  })

  it('조회 조건은 문서 id 와 삭제 여부뿐이어야 한다 (역할·권한 조건 없음)', async () => {
    // 접근 제어는 길드 멤버십 하나다. 세션은 통과 여부만 가르고 where 에는 들어가지 않는다.
    await POST(post(BODY), PARAMS)

    const query = findFirst.mock.calls[0][0]
    expect(Object.keys(query.where).sort()).toEqual(['document', 'documentId'])
    expect(query.where).toMatchObject({ documentId: 'doc_1', document: { deletedAt: null } })
  })

  it('재업로드는 Document 필드를 건드리지 않고 버전만 중첩 생성해야 한다', async () => {
    // 1문서 = 1파일: 파일 정보는 DocumentVersion 에만 산다. data 에 fileName/s3Key 가
    // 직접 들어오면 Document/DocumentVersion 분리가 깨진 것이다.
    await POST(post(BODY), PARAMS)

    const args = update.mock.calls[0][0]
    expect(Object.keys(args.data)).toEqual(['versions'])
    expect(Object.keys(args.data.versions)).toEqual(['create'])
  })
})
