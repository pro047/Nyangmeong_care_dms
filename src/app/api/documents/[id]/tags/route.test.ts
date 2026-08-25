import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PUT } from './route'
import { ACTIVE_DOCUMENT_NOT_FOUND } from '@/lib/trash'
import { TAG_CONFLICT } from '@/lib/tag'

const { getSession, update } = vi.hoisted(() => ({
  getSession: vi.fn(),
  update: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ getSession }))
vi.mock('@/lib/prisma', () => ({ prisma: { document: { update } } }))

const BASE = 'http://localhost:3002/api/documents/doc_1/tags'
const PARAMS = { params: Promise.resolve({ id: 'doc_1' }) }
const SESSION = { id: 'user_1', discordId: 'd1', username: 'u', avatarUrl: null }

function put(body: unknown) {
  return new NextRequest(BASE, { method: 'PUT', body: JSON.stringify(body) })
}

const withCode = (code: string) => Object.assign(new Error('prisma'), { code })

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(SESSION)
  update.mockReset().mockResolvedValue({ id: 'doc_1' })
})

describe('PUT /api/documents/[id]/tags', () => {
  it('세션이 없으면 401 이고 DB 에 가지 않아야 한다', async () => {
    getSession.mockResolvedValue(null)

    const res = await PUT(put({ tags: ['기획'] }), PARAMS)

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: '로그인이 필요합니다.' })
    expect(update).not.toHaveBeenCalled()
  })

  it('tags 가 배열이 아니면 400 이어야 한다', async () => {
    const res = await PUT(put({ tags: '기획' }), PARAMS)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '요청 형식이 올바르지 않습니다.' })
    expect(update).not.toHaveBeenCalled()
  })

  it('서로 다른 태그 11개면 400 이어야 한다', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `태그${i}`)

    const res = await PUT(put({ tags: eleven }), PARAMS)

    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  it('활성 문서만 겨눠 조인 전체를 교체해야 한다 (휴지통 문서 배제)', async () => {
    // trim·대소문자 중복은 정규화로 걸러진 뒤 저장돼야 한다.
    const res = await PUT(put({ tags: [' 기획 ', 'API', 'api', ''] }), PARAMS)

    const args = update.mock.calls[0][0]
    // where 가 id + deletedAt 뿐이어야 한다 — 작성자·역할 조건이 스며들면 여기서 잡힌다.
    expect(args.where).toEqual({ id: 'doc_1', deletedAt: null })
    expect(args.data).toEqual({
      tags: {
        deleteMany: {},
        create: [
          { tag: { connectOrCreate: { where: { name: '기획' }, create: { name: '기획' } } } },
          { tag: { connectOrCreate: { where: { name: 'API' }, create: { name: 'API' } } } },
        ],
      },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'doc_1', tags: ['기획', 'API'] })
  })

  it('빈 배열이면 조인만 비우고 200 이어야 한다 (태그 전부 제거)', async () => {
    const res = await PUT(put({ tags: [] }), PARAMS)

    expect(update.mock.calls[0][0].data).toEqual({ tags: { deleteMany: {}, create: [] } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'doc_1', tags: [] })
  })

  it('없는 문서나 휴지통 문서(P2025)면 404 문구여야 한다', async () => {
    update.mockRejectedValue(withCode('P2025'))

    const res = await PUT(put({ tags: ['기획'] }), PARAMS)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: ACTIVE_DOCUMENT_NOT_FOUND })
  })

  it('태그 생성 경합(P2002)이면 409 문구여야 한다', async () => {
    update.mockRejectedValue(withCode('P2002'))

    const res = await PUT(put({ tags: ['기획'] }), PARAMS)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: TAG_CONFLICT })
  })

  it('매핑에 없는 오류는 삼키지 않고 던져야 한다', async () => {
    const boom = new Error('연결 끊김')
    update.mockRejectedValue(boom)

    await expect(PUT(put({ tags: ['기획'] }), PARAMS)).rejects.toBe(boom)
  })
})
