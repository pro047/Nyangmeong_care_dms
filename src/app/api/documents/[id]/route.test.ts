import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE, PATCH } from './route'
import { ACTIVE_DOCUMENT_NOT_FOUND, TRASH_NOT_FOUND } from '@/lib/trash'
import { MOVE_FOLDER_NOT_FOUND } from '@/lib/document-edit'
import { DELETE_FORBIDDEN } from '@/lib/ownership'

// DB·쿠키는 테스트 환경에 없다. 라우트가 "무엇을 어떤 인자로 부르고
// 무엇을 돌려주는가"만 본다 (download/route.test.ts 와 같은 패턴).
const { getSession, updateMany, findUnique, envValues } = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  // env.ts 는 import 시점에 process.env 를 검증하며 던지므로 통째로 갈아 끼운다.
  envValues: { ADMIN_DISCORD_ID: undefined as string | undefined },
}))
vi.mock('@/lib/session', () => ({ getSession }))
vi.mock('@/lib/prisma', () => ({ prisma: { document: { updateMany, findUnique } } }))
vi.mock('@/lib/env', () => ({ env: envValues }))

const BASE = 'http://localhost:3002/api/documents/doc_1'
const PARAMS = { params: Promise.resolve({ id: 'doc_1' }) }
// discordId 는 실제 스노플레이크 모양이어야 한다 — 스키마가 ^\d{17,20}$ 만 받으므로
// 'd1' 같은 값으로 관리자 경로를 태우면 런타임에 올 수 없는 값으로 통과시키는 셈이 된다.
const ADMIN_ID = '375871831044915200'
const SESSION = { id: 'user_1', discordId: ADMIN_ID, username: 'u', avatarUrl: null }

function patch(body: unknown) {
  return new NextRequest(BASE, { method: 'PATCH', body: JSON.stringify(body) })
}

function del() {
  return new NextRequest(BASE, { method: 'DELETE' })
}

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(SESSION)
  updateMany.mockReset().mockResolvedValue({ count: 1 })
  findUnique.mockReset().mockResolvedValue({ createdById: 'user_1' })
  envValues.ADMIN_DISCORD_ID = undefined
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

  it('folderId 만 보내도 활성 문서만 겨눠 이동해야 한다', async () => {
    const res = await PATCH(patch({ folderId: 'folder_1' }), PARAMS)

    const args = updateMany.mock.calls[0][0]
    expect(args.where).toEqual({ id: 'doc_1', deletedAt: null })
    expect(args.data).toEqual({ folderId: 'folder_1' })
    expect(res.status).toBe(200)
  })

  it('folderId null 은 미분류로 꺼내는 요청으로 통과해야 한다', async () => {
    const res = await PATCH(patch({ folderId: null }), PARAMS)

    expect(updateMany.mock.calls[0][0].data).toEqual({ folderId: null })
    expect(res.status).toBe(200)
  })

  it('없는 폴더로 이동(P2003)이면 404 문구여야 한다', async () => {
    // 조회와 수정 사이에 남이 폴더를 지운 경우 — FK 위반을 사용자 문구로 바꿔야 한다.
    updateMany.mockRejectedValue(Object.assign(new Error('fk'), { code: 'P2003' }))

    const res = await PATCH(patch({ folderId: 'ghost' }), PARAMS)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: MOVE_FOLDER_NOT_FOUND })
  })

  it('매핑에 없는 오류는 삼키지 않고 던져야 한다', async () => {
    const boom = new Error('연결 끊김')
    updateMany.mockRejectedValue(boom)

    await expect(PATCH(patch({ title: '제목' }), PARAMS)).rejects.toBe(boom)
  })
})

describe('DELETE /api/documents/[id]', () => {
  it('세션이 없으면 401 이고 소유자 조회조차 하지 않아야 한다', async () => {
    getSession.mockResolvedValue(null)

    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(401)
    expect(findUnique).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('올린 사람이면 활성 문서를 휴지통으로 보내야 한다', async () => {
    const res = await DELETE(del(), PARAMS)

    const args = updateMany.mock.calls[0][0]
    expect(args.where).toEqual({ id: 'doc_1', deletedAt: null })
    expect(args.data.deletedAt).toBeInstanceOf(Date)
    expect(res.status).toBe(200)
  })

  it('남의 문서면 403 이고 DB 를 건드리지 않아야 한다', async () => {
    findUnique.mockResolvedValue({ createdById: 'user_2' })

    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: DELETE_FORBIDDEN })
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('관리자는 남의 문서도 지울 수 있어야 한다', async () => {
    findUnique.mockResolvedValue({ createdById: 'user_2' })
    envValues.ADMIN_DISCORD_ID = ADMIN_ID

    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(200)
    expect(updateMany).toHaveBeenCalled()
  })

  // 관리자 설정이 없을 때 전원이 통과하는 사고를 막는다.
  it('관리자 id 가 없으면 남의 문서는 여전히 403 이어야 한다', async () => {
    findUnique.mockResolvedValue({ createdById: 'user_2' })
    envValues.ADMIN_DISCORD_ID = ''

    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(403)
  })

  // 소유자 판정은 "없음"을 대신 판정하지 않는다 — 그건 count 가 한다.
  it('없는 문서는 403 이 아니라 404 로 떨어져야 한다', async () => {
    findUnique.mockResolvedValue(null)
    updateMany.mockResolvedValue({ count: 0 })

    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: TRASH_NOT_FOUND })
  })
})
