import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE } from './route'

// DB·S3·쿠키는 테스트 환경에 없다. 라우트가 "무엇을 어떤 인자로 부르고
// 무엇을 돌려주는가"만 본다 ([id]/route.test.ts 와 같은 패턴).
const {
  getSession,
  findMany,
  deleteMany,
  versionFindMany,
  deleteObject,
  hasDocKey,
  scheduleConsistencyMeasure,
  envValues,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  versionFindMany: vi.fn(),
  deleteObject: vi.fn(),
  hasDocKey: vi.fn(),
  scheduleConsistencyMeasure: vi.fn(),
  // env.ts 는 import 시점에 process.env 를 검증하며 던지므로 통째로 갈아 끼운다.
  envValues: { ADMIN_DISCORD_ID: undefined as string | undefined },
}))
vi.mock('@/lib/session', () => ({ getSession }))
vi.mock('@/lib/prisma', () => ({
  prisma: { document: { findMany, deleteMany }, documentVersion: { findMany: versionFindMany } },
}))
vi.mock('@/lib/env', () => ({ env: envValues }))
vi.mock('@/lib/s3', () => ({ deleteObject }))
vi.mock('@/lib/consistency-schedule', () => ({ hasDocKey, scheduleConsistencyMeasure }))

// discordId 는 실제 스노플레이크 모양이어야 한다 — 스키마가 ^\d{17,20}$ 만 받는다.
const ADMIN_ID = '375871831044915200'
const OTHER_ID = '1000000000000000009'
const SESSION = { id: 'user_1', discordId: ADMIN_ID, username: 'u', avatarUrl: null }

const KEY_1 = 'documents/secret-1.pdf'
const KEY_2 = 'documents/secret-2.pdf'
const TRASHED_DOCS = [
  { id: 'doc_1', docKey: null, versions: [{ s3Key: KEY_1 }] },
  { id: 'doc_2', docKey: null, versions: [{ s3Key: KEY_2 }] },
]

const BEFORE = '2026-10-11T12:00:00.000Z'
const TRASHED_BEFORE = { not: null, lte: new Date(BEFORE) }

function request(query = `?before=${encodeURIComponent(BEFORE)}`) {
  return new NextRequest(`http://localhost/api/documents/trash${query}`, { method: 'DELETE' })
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(SESSION)
  findMany.mockReset().mockResolvedValue(TRASHED_DOCS)
  deleteMany.mockReset().mockResolvedValue({ count: 2 })
  versionFindMany.mockReset().mockResolvedValue([])
  deleteObject.mockReset().mockResolvedValue(undefined)
  hasDocKey.mockReset().mockResolvedValue(false)
  scheduleConsistencyMeasure.mockReset()
  envValues.ADMIN_DISCORD_ID = undefined
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('DELETE /api/documents/trash — 차단', () => {
  it('AC-12 세션이 없으면 401 이고 대상 조회조차 하지 않아야 한다', async () => {
    getSession.mockResolvedValue(null)

    const res = await DELETE(request())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: '로그인이 필요합니다.' })
    expect(findMany).not.toHaveBeenCalled()
    expect(deleteMany).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/documents/trash — 차단 (리뷰 뒤 추가)', () => {
  // 업로드 토큰처럼 서명만 맞고 id 가 없는 JWT 가 세션 자리에 오면 getSession 이 이런 값을 준다.
  it.each([
    ['undefined', undefined],
    ['빈 문자열', ''],
  ])('세션의 id 가 %s 이면 401 이고 대상 조회조차 하지 않아야 한다', async (_label, id) => {
    getSession.mockResolvedValue({ ...SESSION, id, discordId: OTHER_ID })

    const res = await DELETE(request())

    expect(res.status).toBe(401)
    expect(findMany).not.toHaveBeenCalled()
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it.each([
    ['없으면', ''],
    ['비었으면', '?before='],
    ['날짜가 아니면', '?before=abc'],
    ['시간대가 없으면', '?before=2026-10-11T12:00:00'],
    ['연도뿐이면', '?before=9999'],
  ])('before 가 %s 400 이고 대상 조회조차 하지 않아야 한다', async (_label, query) => {
    const res = await DELETE(request(query))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: '기준 시각이 올바르지 않습니다.' })
    expect(findMany).not.toHaveBeenCalled()
    expect(deleteMany).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/documents/trash — 대상 범위', () => {
  // 관리자 설정이 없거나 비었을 때 전원의 휴지통이 비워지는 사고를 막는다.
  it.each([
    ['설정되지 않았을 때', undefined],
    ['빈 문자열일 때', ''],
    ['다른 사람일 때', OTHER_ID],
  ])('AC-13 관리자 id 가 %s 내가 올린 휴지통 문서만 대상이어야 한다', async (_label, adminId) => {
    envValues.ADMIN_DISCORD_ID = adminId

    const res = await DELETE(request())

    expect(res.status).toBe(200)
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany.mock.calls[0][0].where).toEqual({
      createdById: 'user_1',
      deletedAt: TRASHED_BEFORE,
    })
  })

  it('AC-14 관리자면 소유자 조건 없이 휴지통 전체가 대상이어야 한다', async () => {
    envValues.ADMIN_DISCORD_ID = ADMIN_ID

    const res = await DELETE(request())

    expect(res.status).toBe(200)
    expect(findMany.mock.calls[0][0].where).toEqual({ deletedAt: TRASHED_BEFORE })
  })

  it('AC-13 삭제는 읽은 id 에만, 휴지통 조건을 다시 걸어 나가야 한다', async () => {
    await DELETE(request())

    expect(deleteMany).toHaveBeenCalledTimes(1)
    expect(deleteMany.mock.calls[0][0]).toEqual({
      where: { id: { in: ['doc_1', 'doc_2'] }, deletedAt: TRASHED_BEFORE },
    })
  })
})

describe('DELETE /api/documents/trash — 응답', () => {
  it('AC-15 성공하면 200 이고 본문은 지워진 건수 하나뿐이어야 한다', async () => {
    const res = await DELETE(request())
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(JSON.parse(text)).toEqual({ count: 2 })
    // S3 키는 내부 정보다 — 응답에 실리면 안 된다.
    expect(text).not.toContain(KEY_1)
    expect(text).not.toContain(KEY_2)
    expect(text).not.toContain('doc_1')
  })

  it('AC-15 건수는 읽은 수가 아니라 실제로 지워진 수여야 한다', async () => {
    // 읽은 뒤 한 건이 복구된 경우.
    deleteMany.mockResolvedValue({ count: 1 })
    versionFindMany.mockResolvedValue([{ s3Key: KEY_1 }])

    const res = await DELETE(request())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ count: 1 })
    expect(deleteObject.mock.calls).toEqual([[KEY_2]])
  })

  it('AC-16 휴지통이 비어 있으면 200 count 0 이고 삭제에 가지 않아야 한다', async () => {
    findMany.mockResolvedValue([])

    const res = await DELETE(request())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ count: 0 })
    expect(deleteMany).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('AC-16 읽은 뒤 전부 복구됐으면 200 count 0 이고 S3 를 건드리지 않아야 한다', async () => {
    deleteMany.mockResolvedValue({ count: 0 })

    const res = await DELETE(request())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ count: 0 })
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('AC-17 S3 삭제가 실패해도 200 이고 본문은 지워진 건수여야 한다', async () => {
    deleteObject.mockRejectedValue(new Error('S3 실패'))

    const res = await DELETE(request())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ count: 2 })
    expect(deleteObject).toHaveBeenCalledTimes(2)
  })

  it('DB 오류는 삼키지 않고 던져야 한다', async () => {
    const boom = new Error('연결 끊김')
    findMany.mockRejectedValue(boom)

    await expect(DELETE(request())).rejects.toBe(boom)
    expect(deleteMany).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/documents/trash — S3·정합성 측정 연결', () => {
  it('지워진 문서의 키를 실제 S3 삭제 함수로 넘겨야 한다', async () => {
    await DELETE(request())

    expect(versionFindMany).toHaveBeenCalledTimes(1)
    expect(versionFindMany.mock.calls[0][0]).toEqual({
      where: { s3Key: { in: [KEY_1, KEY_2] } },
      select: { s3Key: true },
    })
    expect(deleteObject.mock.calls).toEqual([[KEY_1], [KEY_2]])
  })

  it('docKey 문서가 섞여 있으면 측정을 한 번 예약해야 한다', async () => {
    findMany.mockResolvedValue([
      { id: 'doc_1', docKey: 'KEY-1', versions: [{ s3Key: KEY_1 }] },
      { id: 'doc_2', docKey: 'KEY-2', versions: [{ s3Key: KEY_2 }] },
    ])

    await DELETE(request())

    expect(scheduleConsistencyMeasure).toHaveBeenCalledTimes(1)
  })

  it('docKey 문서가 없으면 측정을 예약하지 않아야 한다', async () => {
    await DELETE(request())

    expect(scheduleConsistencyMeasure).not.toHaveBeenCalled()
  })
})
