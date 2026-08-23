import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'
import { DOCUMENT_NOT_FOUND } from '@/lib/page-error'

// DB·S3·쿠키는 테스트 환경에 없다. 라우트가 "무엇을 어떤 인자로 부르고 무엇을 돌려주는가"만 본다.
// vi.hoisted 로 만드는 이유: Prisma 의 findFirst 타입은 전체 행을 요구해 select 결과
// ({ s3Key, fileName }) 를 mockResolvedValue 에 넣을 수 없다. 느슨한 vi.fn() 을 쓴다.
const { getSession, findFirst, presignDownload } = vi.hoisted(() => ({
  getSession: vi.fn(),
  findFirst: vi.fn(),
  presignDownload: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ getSession }))
vi.mock('@/lib/prisma', () => ({ prisma: { documentVersion: { findFirst } } }))
vi.mock('@/lib/s3', () => ({ presignDownload }))

const NOT_FOUND = '문서를 찾을 수 없습니다.'
const BASE = 'http://localhost:3002/api/documents/doc_1/download'
const PARAMS = { params: Promise.resolve({ id: 'doc_1' }) }
const SESSION = { id: 'user_1', discordId: 'd1', username: 'u', avatarUrl: null }
const VERSION = { s3Key: 'documents/abc.pdf', fileName: '보고서.pdf' }

function request(query = '', headers: Record<string, string> = {}) {
  return new NextRequest(`${BASE}${query}`, { headers })
}

/** 브라우저 주소창·<a href> 가 보내는 최상위 내비게이션 요청. */
function navigate(query = '') {
  return request(query, { 'sec-fetch-dest': 'document', accept: 'text/html' })
}

/** 스크립트의 fetch() 가 보내는 요청. */
function fetchLike(query = '') {
  return request(query, { 'sec-fetch-dest': 'empty', accept: 'application/json' })
}

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(SESSION)
  findFirst.mockReset()
  presignDownload.mockReset()
})

describe('GET /api/documents/[id]/download — 404 응답 방식', () => {
  it('잘못된 버전 번호를 내비게이션으로 요청하면 DB 를 거치지 않고 /?error= 로 리다이렉트해야 한다', async () => {
    const res = await GET(navigate('?v=1e21'), PARAMS)

    expect(res.status).toBe(307)
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/')
    expect(location.searchParams.get('error')).toBe(DOCUMENT_NOT_FOUND)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('잘못된 버전 번호를 fetch 로 요청하면 기존대로 404 JSON 이어야 한다', async () => {
    const res = await GET(fetchLike('?v=1e21'), PARAMS)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: NOT_FOUND })
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('없는(지워진) 문서를 내비게이션으로 요청하면 /?error= 로 리다이렉트해야 한다', async () => {
    // 다른 사람이 휴지통으로 보낸 문서의 링크를 클릭한 상황.
    findFirst.mockResolvedValue(null)

    const res = await GET(navigate(), PARAMS)

    expect(res.status).toBe(307)
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/')
    expect(location.searchParams.get('error')).toBe(DOCUMENT_NOT_FOUND)
  })

  it('없는 문서를 fetch 로 요청하면 기존대로 404 JSON 이어야 한다', async () => {
    findFirst.mockResolvedValue(null)

    const res = await GET(fetchLike(), PARAMS)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: NOT_FOUND })
  })

  it('리다이렉트 URL 은 원래 쿼리(?v=)를 이어받지 않아야 한다', async () => {
    // ?v=1e21 이 /?v=1e21&error= 로 따라가면 목록 페이지가 엉뚱한 파라미터를 들고 다닌다.
    const res = await GET(navigate('?v=1e21&inline=1'), PARAMS)

    const location = new URL(res.headers.get('location')!)
    expect([...location.searchParams.keys()]).toEqual(['error'])
  })
})

describe('GET /api/documents/[id]/download — 불변식', () => {
  // 404 는 내비게이션이면 리다이렉트인데 401 만 JSON 인 것은 의도다. proxy 가 같은 쿠키를
  // 같은 키로 먼저 검증해 내비게이션 401 을 /login 으로 보내므로, 여기 401 에 내비게이션이
  // 닿는 경우는 프록시 통과와 라우트 도착 사이에 exp 가 지나는 수 ms 경합뿐이다.
  it('세션이 없으면 401 JSON 이어야 한다 (변경 없음)', async () => {
    getSession.mockResolvedValue(null)

    const res = await GET(navigate(), PARAMS)

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: '로그인이 필요합니다.' })
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('버전을 지정하지 않으면 versionNo 조건 없이 versionNo desc 정렬로 최신을 골라야 한다', async () => {
    // "최신 버전"은 컬럼이 아니라 정렬로 구한다. isLatest 같은 키가 스며들면 여기서 잡힌다.
    findFirst.mockResolvedValue(VERSION)
    presignDownload.mockResolvedValue('https://s3.example/signed')

    await GET(fetchLike(), PARAMS)

    const args = findFirst.mock.calls[0][0]
    expect(args.orderBy).toEqual({ versionNo: 'desc' })
    expect(args.where).not.toHaveProperty('versionNo')
  })

  it('?v=2 면 versionNo 2 를 조건으로 걸되 정렬은 그대로여야 한다', async () => {
    findFirst.mockResolvedValue(VERSION)
    presignDownload.mockResolvedValue('https://s3.example/signed')

    await GET(fetchLike('?v=2'), PARAMS)

    const args = findFirst.mock.calls[0][0]
    expect(args.where).toMatchObject({ versionNo: 2 })
    expect(args.orderBy).toEqual({ versionNo: 'desc' })
  })

  it('조회 조건은 문서 id 와 삭제 여부뿐이어야 한다 (역할·권한 조건 없음)', async () => {
    // 접근 제어는 길드 멤버십 하나다. 세션은 통과 여부만 가르고 where 에는 들어가지 않는다.
    findFirst.mockResolvedValue(VERSION)
    presignDownload.mockResolvedValue('https://s3.example/signed')

    await GET(fetchLike(), PARAMS)

    const args = findFirst.mock.calls[0][0]
    expect(Object.keys(args.where).sort()).toEqual(['document', 'documentId'])
    expect(args.where).toMatchObject({ documentId: 'doc_1', document: { deletedAt: null } })
  })

  it('문서를 찾으면 파일을 돌려주지 않고 presigned URL 로 리다이렉트해야 한다', async () => {
    // 파일은 앱 서버를 거치지 않는다 — 응답 본문이 아니라 Location 으로 S3 에 보낸다.
    findFirst.mockResolvedValue(VERSION)
    presignDownload.mockResolvedValue('https://s3.example/signed?X-Amz-Signature=abc')

    const res = await GET(navigate('?inline=1'), PARAMS)

    expect(presignDownload).toHaveBeenCalledWith(VERSION.s3Key, VERSION.fileName, true)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://s3.example/signed?X-Amz-Signature=abc')
    expect(await res.text()).toBe('')
  })
})
