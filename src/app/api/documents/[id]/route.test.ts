import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH } from './route'
import { ACTIVE_DOCUMENT_NOT_FOUND } from '@/lib/trash'

// DB·쿠키는 테스트 환경에 없다. 라우트가 "무엇을 어떤 인자로 부르고
// 무엇을 돌려주는가"만 본다 (download/route.test.ts 와 같은 패턴).
const { getSession, updateMany } = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateMany: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ getSession }))
vi.mock('@/lib/prisma', () => ({ prisma: { document: { updateMany } } }))

const BASE = 'http://localhost:3002/api/documents/doc_1'
const PARAMS = { params: Promise.resolve({ id: 'doc_1' }) }
const SESSION = { id: 'user_1', discordId: 'd1', username: 'u', avatarUrl: null }

function patch(body: unknown) {
  return new NextRequest(BASE, { method: 'PATCH', body: JSON.stringify(body) })
}

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(SESSION)
  updateMany.mockReset().mockResolvedValue({ count: 1 })
})

describe('PATCH /api/documents/[id]', () => {
  it('세션이 없으면 401 이어야 한다', async () => {
    getSession.mockResolvedValue(null)

    const res = await PATCH(patch({ title: '제목' }), PARAMS)

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: '로그인이 필요합니다.' })
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('빈 객체면 400 이고 DB 에 가지 않아야 한다', async () => {
    const res = await PATCH(patch({}), PARAMS)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '요청 형식이 올바르지 않습니다.' })
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('count 0 이면 404 문구여야 한다', async () => {
    // 없는 문서와 휴지통 문서를 구분하지 않는다 — 둘 다 사용자에겐 404다.
    updateMany.mockResolvedValue({ count: 0 })

    const res = await PATCH(patch({ title: '제목' }), PARAMS)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: ACTIVE_DOCUMENT_NOT_FOUND })
  })

  it('제목은 trim, 빈 설명은 null 로 활성 문서만 갱신해야 한다', async () => {
    const res = await PATCH(patch({ title: ' 제목 ', description: '' }), PARAMS)

    // where 가 id + deletedAt 뿐이어야 한다 — 작성자·역할 조건이 스며들면 여기서 잡힌다.
    const args = updateMany.mock.calls[0][0]
    expect(args.where).toEqual({ id: 'doc_1', deletedAt: null })
    expect(args.data).toEqual({ title: '제목', description: null })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'doc_1' })
  })
})
