import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'
import { ACTIVE_DOCUMENT_NOT_FOUND } from '@/lib/trash'
import { S3_KEY_ALREADY_USED } from '@/lib/upload-guard'
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

// 기본값은 '사람이 고친 제목'이다 ('문서' != '이전' = titleFromFileName('이전.pdf')).
// 이래야 제목 갱신이 끼어들지 않아 나머지 테스트가 재업로드 본연의 동작만 본다.
const LATEST = { versionNo: 2, fileName: '이전.pdf', document: { title: '문서' } }

// findFirst 하나가 두 조회를 받는다: 재사용 확인(where.s3Key)과 최신 버전(where.documentId).
// where 로 갈라 주지 않으면 최신 버전용 기본값이 재사용 확인에 먼저 걸려 전부 400 이 된다.
function mockVersionLookups(latest: unknown, reused: unknown = null) {
  findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) =>
    's3Key' in args.where ? reused : latest,
  )
}

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(SESSION)
  verifyUploadToken.mockReset().mockResolvedValue(true)
  headObjectSize.mockReset().mockResolvedValue(1234)
  findFirst.mockReset()
  mockVersionLookups(LATEST)
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
    // 재사용 확인은 토큰이 유효한 뒤에만 한다 (무인증 DB 부하 방지).
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('같은 s3Key 의 버전이 이미 있으면 400 이고 S3 조회에 가지 않아야 한다', async () => {
    // keyToken 은 소모되지 않아 TTL 안에 재사용할 수 있다 — 여기서 끊지 않으면
    // 같은 객체를 가리키는 버전이 생기고 영구삭제 때 남의 파일이 걸린다.
    mockVersionLookups(LATEST, { id: 'ver_1' })

    const res = await POST(post(BODY), PARAMS)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: S3_KEY_ALREADY_USED })
    expect(headObjectSize).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('S3 에 객체가 없으면 400 이고 최신 버전 조회에 가지 않아야 한다', async () => {
    headObjectSize.mockResolvedValue(null)

    const res = await POST(post(BODY), PARAMS)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '업로드된 파일을 찾을 수 없습니다.' })
    // 재사용 확인(s3Key) 1회뿐 — 최신 버전 조회(documentId)는 나가지 않는다.
    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(findFirst.mock.calls[0][0].where).toEqual({ s3Key: BODY.s3Key })
  })

  it('크기가 상한을 넘으면 400 이고 최신 버전 조회에 가지 않아야 한다', async () => {
    headObjectSize.mockResolvedValue(100 * 1024 * 1024 + 1)

    const res = await POST(post(BODY), PARAMS)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '파일이 너무 큽니다. (최대 100MB)' })
    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(findFirst.mock.calls[0][0].where).toEqual({ s3Key: BODY.s3Key })
  })

  it('활성 문서의 버전이 없으면 404 이고 update 에 가지 않아야 한다', async () => {
    // 없는 문서와 휴지통 문서가 같은 조회로 함께 걸린다.
    mockVersionLookups(null)

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
  // 재사용 확인이 앞에 끼면서 최신 버전 조회는 findFirst 의 두 번째 호출이 됐다.
  const latestQuery = () => findFirst.mock.calls[1][0]

  it('최신 버전은 컬럼이 아니라 versionNo desc 정렬로 골라야 한다', async () => {
    await POST(post(BODY), PARAMS)

    const query = latestQuery()
    expect(query.orderBy).toEqual({ versionNo: 'desc' })
    expect(query.where).not.toHaveProperty('versionNo')
  })

  it('조회 조건은 문서 id 와 삭제 여부뿐이어야 한다 (역할·권한 조건 없음)', async () => {
    // 접근 제어는 길드 멤버십 하나다. 세션은 통과 여부만 가르고 where 에는 들어가지 않는다.
    await POST(post(BODY), PARAMS)

    const query = latestQuery()
    expect(Object.keys(query.where).sort()).toEqual(['document', 'documentId'])
    expect(query.where).toMatchObject({ documentId: 'doc_1', document: { deletedAt: null } })
  })

  it('재업로드가 Document 에 쓰는 것은 제목뿐이어야 한다', async () => {
    // 1문서 = 1파일: 파일 정보는 DocumentVersion 에만 산다. data 에 fileName/s3Key 가
    // 직접 들어오면 Document/DocumentVersion 분리가 깨진 것이다.
    // 제목은 2026-08-28 에 의도적으로 연 예외다 (MILESTONES.md 확정된 설계 결정).
    await POST(post(BODY), PARAMS)

    const args = update.mock.calls[0][0]
    expect(Object.keys(args.data)).toEqual(['versions'])
    expect(Object.keys(args.data.versions)).toEqual(['create'])
  })

  it('제목이 자동 생성값 그대로면 새 파일명을 따라가야 한다', async () => {
    mockVersionLookups({
      versionNo: 2,
      fileName: '이전.pdf',
      document: { title: '이전' },
    })

    await POST(post(BODY), PARAMS)

    // BODY.fileName 이 '보고서.pdf' 다
    expect(update.mock.calls[0][0].data.title).toBe('보고서')
  })

  it('사람이 고친 제목은 재업로드가 덮지 않아야 한다', async () => {
    // 되돌릴 방법이 없는 파괴적 동작이라 불변식만큼 강하게 잡아 둔다.
    mockVersionLookups({
      versionNo: 2,
      fileName: '이전.pdf',
      document: { title: '2026 상반기 보고' },
    })

    await POST(post(BODY), PARAMS)

    expect(update.mock.calls[0][0].data).not.toHaveProperty('title')
  })

  it('제목 판정에 쓰는 값을 버전 조회에서 같이 집어야 한다 (추가 왕복 금지)', async () => {
    // 커넥션 상한이 5다. 판정 하나 때문에 쿼리를 더 내면 안 된다.
    // documentVersion 조회는 재사용 확인 + 최신 버전, 딱 2회 — 제목 판정용 3회째는 없다.
    await POST(post(BODY), PARAMS)

    expect(findFirst).toHaveBeenCalledTimes(2)
    const select = latestQuery().select
    expect(select).toMatchObject({ fileName: true, document: { select: { title: true } } })
  })
})
