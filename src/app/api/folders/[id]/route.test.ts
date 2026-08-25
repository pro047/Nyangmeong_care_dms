import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE, PATCH } from './route'
import { FOLDER_NAME_CONFLICT, FOLDER_NOT_FOUND } from '@/lib/folder'

const { getSession, findUnique, findFirst, update, del } = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ getSession }))
vi.mock('@/lib/prisma', () => ({
  prisma: { folder: { findUnique, findFirst, update, delete: del } },
}))

const BASE = 'http://localhost:3002/api/folders/folder_1'
const PARAMS = { params: Promise.resolve({ id: 'folder_1' }) }
const SESSION = { id: 'user_1', discordId: 'd1', username: 'u', avatarUrl: null }

function patch(body: unknown) {
  return new NextRequest(BASE, { method: 'PATCH', body: JSON.stringify(body) })
}

const withCode = (code: string) => Object.assign(new Error('prisma'), { code })

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(SESSION)
  findUnique.mockReset().mockResolvedValue({ parentId: 'parent_1' })
  findFirst.mockReset().mockResolvedValue(null)
  update.mockReset().mockResolvedValue({ id: 'folder_1' })
  del.mockReset().mockResolvedValue({ id: 'folder_1' })
})

describe('PATCH /api/folders/[id]', () => {
  it('세션이 없으면 401 이고 DB 에 가지 않아야 한다', async () => {
    getSession.mockResolvedValue(null)

    const res = await PATCH(patch({ name: '새 이름' }), PARAMS)

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: '로그인이 필요합니다.' })
    expect(update).not.toHaveBeenCalled()
  })

  it('공백뿐인 이름이면 400 이어야 한다', async () => {
    const res = await PATCH(patch({ name: '  ' }), PARAMS)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '요청 형식이 올바르지 않습니다.' })
    expect(update).not.toHaveBeenCalled()
  })

  it('대상 폴더가 없으면 404 여야 한다', async () => {
    findUnique.mockResolvedValue(null)

    const res = await PATCH(patch({ name: '새 이름' }), PARAMS)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: FOLDER_NOT_FOUND })
    expect(update).not.toHaveBeenCalled()
  })

  it('같은 부모 아래(자기 제외) 같은 이름이 있으면 409 여야 한다', async () => {
    findFirst.mockResolvedValue({ id: 'folder_2' })

    const res = await PATCH(patch({ name: ' 중복 ' }), PARAMS)

    // "같은 위치" 판정은 대상의 parentId 기준이고 자기 자신은 빼야 한다.
    expect(findFirst.mock.calls[0][0].where).toEqual({
      parentId: 'parent_1',
      name: '중복',
      NOT: { id: 'folder_1' },
    })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: FOLDER_NAME_CONFLICT })
    expect(update).not.toHaveBeenCalled()
  })

  it('update 가 P2025 면 404 여야 한다 (조회와 수정 사이에 지워진 경합)', async () => {
    update.mockRejectedValue(withCode('P2025'))

    const res = await PATCH(patch({ name: '새 이름' }), PARAMS)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: FOLDER_NOT_FOUND })
  })

  it('성공하면 200 과 id, 이름은 trim 되어 저장돼야 한다', async () => {
    const res = await PATCH(patch({ name: ' 새 이름 ' }), PARAMS)

    expect(update.mock.calls[0][0]).toMatchObject({
      where: { id: 'folder_1' },
      data: { name: '새 이름' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'folder_1' })
  })
})

describe('DELETE /api/folders/[id]', () => {
  const req = () => new NextRequest(BASE, { method: 'DELETE' })

  it('세션이 없으면 401 이고 DB 에 가지 않아야 한다', async () => {
    getSession.mockResolvedValue(null)

    const res = await DELETE(req(), PARAMS)

    expect(res.status).toBe(401)
    expect(del).not.toHaveBeenCalled()
  })

  it('없는 폴더(P2025)면 404 여야 한다', async () => {
    del.mockRejectedValue(withCode('P2025'))

    const res = await DELETE(req(), PARAMS)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: FOLDER_NOT_FOUND })
  })

  it('성공하면 200 과 id 여야 한다', async () => {
    const res = await DELETE(req(), PARAMS)

    expect(del.mock.calls[0][0]).toMatchObject({ where: { id: 'folder_1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'folder_1' })
  })

  it('매핑에 없는 오류는 삼키지 않고 던져야 한다', async () => {
    const boom = new Error('연결 끊김')
    del.mockRejectedValue(boom)

    await expect(DELETE(req(), PARAMS)).rejects.toBe(boom)
  })
})
