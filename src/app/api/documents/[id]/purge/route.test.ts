import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE } from './route'
import { PURGE_NOT_FOUND } from '@/lib/trash'
import { DELETE_FORBIDDEN } from '@/lib/ownership'

// DB·S3·쿠키는 테스트 환경에 없다. 라우트가 "무엇을 어떤 인자로 부르고
// 무엇을 돌려주는가"만 본다 ([id]/route.test.ts 와 같은 패턴).
const {
  getSession,
  findUnique,
  findMany,
  deleteMany,
  versionFindMany,
  deleteObject,
  hasDocKey,
  scheduleConsistencyMeasure,
  envValues,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
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
  prisma: {
    document: { findUnique, findMany, deleteMany },
    documentVersion: { findMany: versionFindMany },
  },
}))
vi.mock('@/lib/env', () => ({ env: envValues }))
vi.mock('@/lib/s3', () => ({ deleteObject }))
vi.mock('@/lib/consistency-schedule', () => ({ hasDocKey, scheduleConsistencyMeasure }))

const BASE = 'http://localhost:3002/api/documents/doc_1/purge'
const PARAMS = { params: Promise.resolve({ id: 'doc_1' }) }
// discordId 는 실제 스노플레이크 모양이어야 한다 — 스키마가 ^\d{17,20}$ 만 받는다.
const ADMIN_ID = '375871831044915200'
const SESSION = { id: 'user_1', discordId: ADMIN_ID, username: 'u', avatarUrl: null }

const KEY_1 = 'documents/v1.pdf'
const KEY_2 = 'documents/v2.pdf'

function trashed(docKey: string | null = null) {
  return [{ id: 'doc_1', docKey, versions: [{ s3Key: KEY_1 }, { s3Key: KEY_2 }] }]
}

function del() {
  return new NextRequest(BASE, { method: 'DELETE' })
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(SESSION)
  findUnique.mockReset().mockResolvedValue({ createdById: 'user_1' })
  findMany.mockReset().mockResolvedValue(trashed())
  deleteMany.mockReset().mockResolvedValue({ count: 1 })
  versionFindMany.mockReset().mockResolvedValue([])
  deleteObject.mockReset().mockResolvedValue(undefined)
  // docKey 여부는 대상 조회가 함께 읽는다. 옛 조회 경로가 남아 있으면 이 값(false)을 믿게 된다.
  hasDocKey.mockReset().mockResolvedValue(false)
  scheduleConsistencyMeasure.mockReset()
  envValues.ADMIN_DISCORD_ID = undefined
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('DELETE /api/documents/[id]/purge — 차단', () => {
  it('AC-18 세션이 없으면 401 이고 소유자 조회조차 하지 않아야 한다', async () => {
    getSession.mockResolvedValue(null)

    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: '로그인이 필요합니다.' })
    expect(findUnique).not.toHaveBeenCalled()
    expect(findMany).not.toHaveBeenCalled()
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it('AC-19 남의 문서면 403 이고 대상 조회·삭제·S3 에 가지 않아야 한다', async () => {
    findUnique.mockResolvedValue({ createdById: 'user_2' })

    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: DELETE_FORBIDDEN })
    expect(findMany).not.toHaveBeenCalled()
    expect(deleteMany).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
    expect(scheduleConsistencyMeasure).not.toHaveBeenCalled()
  })

  // 관리자 설정이 없을 때 전원이 통과하는 사고를 막는다.
  it('AC-19 관리자 id 가 빈 문자열이어도 남의 문서는 403 이어야 한다', async () => {
    findUnique.mockResolvedValue({ createdById: 'user_2' })
    envValues.ADMIN_DISCORD_ID = ''

    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: DELETE_FORBIDDEN })
    expect(deleteMany).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/documents/[id]/purge — 404', () => {
  it('AC-20 휴지통에 없는 문서면(대상 조회 0건) 404 이고 삭제에 가지 않아야 한다', async () => {
    findMany.mockResolvedValue([])

    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: PURGE_NOT_FOUND })
    expect(deleteMany).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('AC-20 읽은 뒤 복구돼 지워진 것이 없으면 404 이고 S3 를 건드리지 않아야 한다', async () => {
    deleteMany.mockResolvedValue({ count: 0 })

    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: PURGE_NOT_FOUND })
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(deleteObject).not.toHaveBeenCalled()
  })

  // 소유자 판정은 "없음"을 대신 판정하지 않는다 — 그건 count 가 한다.
  it('AC-20 없는 문서는 403 이 아니라 404 로 떨어져야 한다', async () => {
    findUnique.mockResolvedValue(null)
    findMany.mockResolvedValue([])

    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: PURGE_NOT_FOUND })
    expect(findMany).toHaveBeenCalledTimes(1)
  })
})

describe('DELETE /api/documents/[id]/purge — 성공', () => {
  it('AC-21 올린 사람이면 200 이고 그 문서 하나를 휴지통 조건으로 읽고 지워야 한다', async () => {
    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'doc_1' })
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany.mock.calls[0][0].where).toEqual({ id: 'doc_1', deletedAt: { not: null } })
    expect(deleteMany).toHaveBeenCalledTimes(1)
    expect(deleteMany.mock.calls[0][0].where).toEqual({
      id: { in: ['doc_1'] },
      deletedAt: { not: null },
    })
  })

  it('AC-21 지운 뒤 아무도 가리키지 않는 키만 S3 에서 지워야 한다', async () => {
    versionFindMany.mockResolvedValue([{ s3Key: KEY_1 }])

    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(200)
    expect(versionFindMany.mock.calls[0][0]).toEqual({
      where: { s3Key: { in: [KEY_1, KEY_2] } },
      select: { s3Key: true },
    })
    expect(deleteObject.mock.calls).toEqual([[KEY_2]])
  })

  it('AC-22 관리자는 남의 문서도 영구삭제할 수 있어야 한다', async () => {
    findUnique.mockResolvedValue({ createdById: 'user_2' })
    envValues.ADMIN_DISCORD_ID = ADMIN_ID

    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'doc_1' })
    expect(deleteMany.mock.calls[0][0].where).toEqual({
      id: { in: ['doc_1'] },
      deletedAt: { not: null },
    })
  })

  it('AC-23 S3 삭제가 실패해도 200 이고 본문은 그대로여야 한다', async () => {
    deleteObject.mockRejectedValue(new Error('S3 실패'))

    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'doc_1' })
    expect(deleteObject).toHaveBeenCalledTimes(2)
  })
})

describe('DELETE /api/documents/[id]/purge — 정합성 측정', () => {
  it('AC-23 docKey 문서를 영구삭제하면 측정을 한 번 예약해야 한다', async () => {
    findMany.mockResolvedValue(trashed('KEY-1'))

    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(200)
    expect(scheduleConsistencyMeasure).toHaveBeenCalledTimes(1)
  })

  it('AC-23 docKey 가 없는 문서는 측정을 예약하지 않아야 한다', async () => {
    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(200)
    expect(scheduleConsistencyMeasure).not.toHaveBeenCalled()
  })

  it('AC-23 지우지 못했으면(404) docKey 문서여도 측정을 예약하지 않아야 한다', async () => {
    findMany.mockResolvedValue(trashed('KEY-1'))
    deleteMany.mockResolvedValue({ count: 0 })

    const res = await DELETE(del(), PARAMS)

    expect(res.status).toBe(404)
    expect(scheduleConsistencyMeasure).not.toHaveBeenCalled()
  })
})
