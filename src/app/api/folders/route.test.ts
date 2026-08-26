import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'
import { FOLDER_NAME_CONFLICT, PARENT_FOLDER_NOT_FOUND } from '@/lib/folder'

// DB·쿠키는 테스트 환경에 없다. 라우트가 "무엇을 어떤 인자로 부르고
// 무엇을 돌려주는가"만 본다 (documents/[id]/route.test.ts 와 같은 패턴).
const { getSession, findFirst, create } = vi.hoisted(() => ({
  getSession: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ getSession }))
vi.mock('@/lib/prisma', () => ({ prisma: { folder: { findFirst, create } } }))

const BASE = 'http://localhost:3002/api/folders'
const SESSION = { id: 'user_1', discordId: 'd1', username: 'u', avatarUrl: null }

function post(body: unknown) {
  return new NextRequest(BASE, { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(SESSION)
  findFirst.mockReset().mockResolvedValue(null)
  create.mockReset().mockResolvedValue({ id: 'folder_1', name: '기획' })
})

describe('POST /api/folders', () => {
  it('세션이 없으면 401 이고 DB 에 가지 않아야 한다', async () => {
    // 접근 제어는 길드 멤버십(세션 유무) 하나뿐 — 역할·권한 검사가 스며들면 안 된다.
    getSession.mockResolvedValue(null)

    const res = await POST(post({ name: '기획' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: '로그인이 필요합니다.' })
    expect(findFirst).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('공백뿐인 이름이면 400 이어야 한다', async () => {
    const res = await POST(post({ name: '   ' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '요청 형식이 올바르지 않습니다.' })
    expect(create).not.toHaveBeenCalled()
  })

  it('parentId 생략은 null 로 사전 확인해야 한다 (루트 중복은 unique 가 못 막는다)', async () => {
    const res = await POST(post({ name: ' 기획 ' }))

    // NULLS DISTINCT 때문에 루트끼리는 이 pre-check 가 유일한 방어다.
    expect(findFirst.mock.calls[0][0].where).toEqual({ parentId: null, name: '기획' })
    expect(create.mock.calls[0][0].data).toEqual({ name: '기획', parentId: null })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'folder_1', name: '기획' })
  })

  it('aliases 를 보내면 정규화되어 create data 에 들어가야 한다', async () => {
    const res = await POST(
      post({ name: '화면설계서', aliases: [' 와이어프레임 ', '와이어프레임', 'WF'] }),
    )

    expect(create.mock.calls[0][0].data).toEqual({
      name: '화면설계서',
      parentId: null,
      aliases: ['와이어프레임', 'WF'],
    })
    expect(res.status).toBe(201)
  })

  it('aliases 를 안 보내면 create data 에 aliases 키 자체가 없어야 한다', async () => {
    // 스키마의 @default([]) 가 빈 배열을 넣는다 — 라우트가 키를 만들어 붙이면 안 된다.
    await POST(post({ name: '기획' }))

    expect(create.mock.calls[0][0].data).toEqual({ name: '기획', parentId: null })
  })

  it('같은 위치에 같은 이름이 있으면 409 이고 create 하지 않아야 한다', async () => {
    findFirst.mockResolvedValue({ id: 'folder_0' })

    const res = await POST(post({ name: '기획', parentId: 'parent_1' }))

    expect(findFirst.mock.calls[0][0].where).toEqual({ parentId: 'parent_1', name: '기획' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: FOLDER_NAME_CONFLICT })
    expect(create).not.toHaveBeenCalled()
  })

  it('없는 부모(P2003)면 404 문구여야 한다', async () => {
    create.mockRejectedValue(Object.assign(new Error('fk'), { code: 'P2003' }))

    const res = await POST(post({ name: '기획', parentId: 'ghost' }))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: PARENT_FOLDER_NOT_FOUND })
  })

  it('매핑에 없는 오류는 삼키지 않고 던져야 한다', async () => {
    const boom = new Error('연결 끊김')
    create.mockRejectedValue(boom)

    await expect(POST(post({ name: '기획' }))).rejects.toBe(boom)
  })
})
