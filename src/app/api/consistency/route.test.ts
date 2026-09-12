import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'
import { CONSISTENCY_DUPLICATE } from '@/lib/consistency'

// DB 는 테스트 환경에 없다. 라우트가 "무엇을 어떤 인자로 부르고 무엇을 돌려주는가"만 본다
// (documents/route.test.ts 와 같은 패턴).
const { getSession, create } = vi.hoisted(() => ({ getSession: vi.fn(), create: vi.fn() }))
vi.mock('@/lib/session', () => ({ getSession }))
vi.mock('@/lib/prisma', () => ({ prisma: { consistencySnapshot: { create } } }))

const BASE = 'http://localhost:3002/api/consistency'
const SESSION = { id: 'user_1', discordId: 'd1', username: 'u', avatarUrl: null }

const BODY = {
  measuredAt: '2026-09-11T20:31:00+09:00',
  reqVer: '0.6',
  counts: { errors: 1, warnings: 0, pending: 0, unresolved: 0 },
  metrics: [{ axis: 'referenceTotal', from: null, to: null, ok: 361, total: 377 }],
  findings: [
    { level: 'error', check: '참조', doc: 'SCR-COM', refId: 'SCR-HLT-001', where: null, message: '참조 대상 없음' },
  ],
  docs: [{ key: 'REQ', ver: '0.6', dmsId: 'doc_1', dmsVersion: 4 }],
}

function post(body: unknown) {
  return new NextRequest(BASE, { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  getSession.mockReset().mockResolvedValue(SESSION)
  create.mockReset().mockResolvedValue({ id: 'snap_1' })
})

describe('POST /api/consistency', () => {
  it('정상 페이로드면 201 과 id 를 돌려줘야 한다', async () => {
    const res = await POST(post(BODY))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'snap_1' })
  })

  // 프록시가 먼저 보지만 이 리포는 보호를 이중으로 건다 (CLAUDE.md).
  it('세션이 없으면 401 이어야 하고 DB 를 건드리지 않아야 한다', async () => {
    getSession.mockResolvedValue(null)
    const res = await POST(post(BODY))
    expect(res.status).toBe(401)
    expect(create).not.toHaveBeenCalled()
  })

  it('본문이 JSON 이 아니면 400 이어야 한다', async () => {
    const res = await POST(new NextRequest(BASE, { method: 'POST', body: '{{{' }))
    expect(res.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })

  it('어느 필드가 틀렸는지 응답에 담아야 한다', async () => {
    const res = await POST(post({ ...BODY, reqVer: '' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('reqVer')
  })

  // 25.4KB 본문이 잘려 도착하는 경우다. 스키마는 통과하고 여기서만 걸린다.
  it('counts 와 findings 가 어긋나면 400 이어야 하고 저장하지 않아야 한다', async () => {
    const res = await POST(post({ ...BODY, counts: { errors: 14, warnings: 0, pending: 0, unresolved: 0 } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('counts 와 findings')
    expect(create).not.toHaveBeenCalled()
  })

  it('스냅샷 한 벌을 중첩 create 로 한 번에 써야 한다', async () => {
    await POST(post(BODY))
    expect(create).toHaveBeenCalledTimes(1)
    const arg = create.mock.calls[0][0]
    expect(arg.data.metrics.create).toHaveLength(1)
    expect(arg.data.findings.create).toHaveLength(1)
    expect(arg.data.docs.create).toHaveLength(1)
  })

  it('같은 measuredAt 을 다시 보내면 409 여야 한다', async () => {
    create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    const res = await POST(post(BODY))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(CONSISTENCY_DUPLICATE)
  })

  it('모르는 DB 오류는 삼키지 말고 던져야 한다', async () => {
    // 뭉개서 200 이나 409 로 돌려주면 저장이 안 됐는데 성공으로 보인다.
    create.mockRejectedValue(Object.assign(new Error('연결 끊김'), { code: 'P1001' }))
    await expect(POST(post(BODY))).rejects.toThrow('연결 끊김')
  })
})
