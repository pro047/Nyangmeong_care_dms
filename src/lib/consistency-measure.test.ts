import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { CLOCK_MARGIN_MS, MEASURE_CRASHED, MEASURE_QUIET_MS, SUPERSEDED, measureConsistency, measureWhenQuiet } from './consistency-measure'

const findMany = vi.fn() // docKey.findMany
const create = vi.fn()
const getObjectBytes = vi.fn()
const count = vi.fn() // document.count — 더 새 변경 확인
const prisma = { docKey: { findMany }, document: { count }, consistencySnapshot: { create } } as unknown as PrismaClient
const NOW = new Date('2026-09-27T01:02:03.456Z')

const SCR = `<section><div class="frame-bar">SCR-TST-001</div><p>REQ-TST-001</p></section>`

function doc(id: string, key: string, fileName: string, s3Key: string, extra: Record<string, unknown> = {}) {
  return { key, document: { id, deletedAt: null, versions: [{ versionNo: 3, s3Key, fileName }], ...extra } }
}

beforeEach(() => {
  findMany.mockReset()
  create.mockReset().mockResolvedValue({ id: 'snap_1' })
  getObjectBytes.mockReset().mockImplementation(async (key: string) =>
    key === 's3/scr' ? new TextEncoder().encode(SCR) : null,
  )
})

describe('measureConsistency', () => {
  it('docKey 문서의 최신판을 읽어 스냅샷 하나를 만든다', async () => {
    findMany.mockResolvedValue([doc('d_scr', 'SCR-TST', '화면설계서_v0.3.html', 's3/scr')])

    const outcome = await measureConsistency({ prisma, getObjectBytes, now: () => NOW })

    expect(outcome).toEqual({ ok: true, snapshotId: 'snap_1', docs: 1, missing: 0 })
    // 최신판만 — 버전 정렬을 DB 에 맡긴다
    expect(findMany.mock.calls[0][0].select.document.select.versions).toMatchObject({ orderBy: { versionNo: 'desc' }, take: 1 })
    const data = create.mock.calls[0][0].data
    expect(data.measuredAt).toEqual(NOW)
    expect(data.docs.create).toEqual([{ key: 'SCR-TST', ver: '0.3', dmsId: 'd_scr', dmsVersion: 3 }])
  })

  it('휴지통 문서 · 못 읽는 파일은 조용히 빠지지 않고 파싱 error 로 남는다', async () => {
    findMany.mockResolvedValue([
      doc('d_scr', 'SCR-TST', 'scr.html', 's3/scr'),
      doc('d_trash', 'FN-TST', 'fn.xlsx', 's3/fn', { deletedAt: new Date() }),
      doc('d_gone', 'REQ', 'req.xlsx', 's3/missing'),
    ])

    const outcome = await measureConsistency({ prisma, getObjectBytes, now: () => NOW })

    expect(outcome).toMatchObject({ ok: true, docs: 1, missing: 2 })
    const findings = create.mock.calls[0][0].data.findings.create
    expect(findings.filter((f: { check: string }) => f.check === '파싱').map((f: { doc: string }) => f.doc).sort()).toEqual([
      'FN-TST',
      'REQ',
    ])
  })

  it('문서가 안 달린 키도 조용히 빠지지 않고 파싱 error 로 남는다', async () => {
    findMany.mockResolvedValue([doc('d_scr', 'SCR-TST', 'scr.html', 's3/scr'), { key: 'SCR-LAN', document: null }])

    await measureConsistency({ prisma, getObjectBytes, now: () => NOW })

    const findings = create.mock.calls[0][0].data.findings.create
    expect(findings).toContainEqual(expect.objectContaining({ check: '파싱', doc: 'SCR-LAN' }))
  })

  it('키마다 문서가 하나도 없으면 스냅샷을 만들지 않는다', async () => {
    findMany.mockResolvedValue([{ key: 'REQ', document: null }])

    expect(await measureConsistency({ prisma, getObjectBytes })).toMatchObject({ ok: false })
    expect(create).not.toHaveBeenCalled()
  })

  it('같은 measuredAt(P2002)은 실패가 아니라 이미 있는 측정이다 — 던지지 않는다', async () => {
    findMany.mockResolvedValue([doc('d_scr', 'SCR-TST', 'scr.html', 's3/scr')])
    create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))

    expect(await measureConsistency({ prisma, getObjectBytes })).toEqual({ ok: false, reason: '이미 기록된 측정입니다.' })
  })

  it('DB 오류가 나도 던지지 않는다 — 응답 뒤라 받을 사람이 없다', async () => {
    findMany.mockRejectedValue(new Error('connection refused'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await measureConsistency({ prisma, getObjectBytes })).toEqual({ ok: false, reason: MEASURE_CRASHED })
    consoleError.mockRestore()
  })

  it('측정 시각은 DB 를 읽기 전에 찍어야 한다 — 늦게 끝난 옛 측정이 최신으로 보이면 안 된다', async () => {
    const order: string[] = []
    findMany.mockImplementation(async () => {
      order.push('read')
      return [doc('d_scr', 'SCR-TST', 'scr.html', 's3/scr')]
    })

    await measureConsistency({ prisma, getObjectBytes, now: () => (order.push('now'), NOW) })

    expect(order).toEqual(['now', 'read'])
  })
})

describe('measureWhenQuiet', () => {
  const since = new Date('2026-09-27T01:00:00.000Z')
  const wait = vi.fn(async () => {})

  beforeEach(() => {
    count.mockReset().mockResolvedValue(0)
    wait.mockClear()
    findMany.mockResolvedValue([doc('d_scr', 'SCR-TST', 'scr.html', 's3/scr')])
  })

  it('조용한 시간을 기다린 뒤, 더 새 변경이 없으면 재야 한다', async () => {
    const outcome = await measureWhenQuiet({ prisma, getObjectBytes, since, wait })

    expect(wait).toHaveBeenCalledWith(MEASURE_QUIET_MS)
    expect(outcome.ok).toBe(true)
    // docKey 문서 중 예약 시각(+여유)보다 늦게 바뀌었거나 새 버전이 붙은 것 — 휴지통 문서도 포함(deletedAt 조건 없음)
    const after = new Date(since.getTime() + CLOCK_MARGIN_MS)
    expect(count).toHaveBeenCalledWith({
      where: {
        docKey: { not: null },
        OR: [{ updatedAt: { gt: after } }, { versions: { some: { createdAt: { gt: after } } } }],
      },
    })
  })

  it('기다리는 사이 docKey 문서가 또 바뀌었으면 건너뛰고 S3 도 안 읽어야 한다', async () => {
    count.mockResolvedValue(1)

    const outcome = await measureWhenQuiet({ prisma, getObjectBytes, since, wait })

    expect(outcome).toEqual({ ok: false, reason: SUPERSEDED })
    expect(findMany).not.toHaveBeenCalled()
    expect(getObjectBytes).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('확인 쿼리가 실패해도 던지지 않아야 한다', async () => {
    count.mockRejectedValue(new Error('db down'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await measureWhenQuiet({ prisma, getObjectBytes, since, wait })).toEqual({ ok: false, reason: MEASURE_CRASHED })
    consoleError.mockRestore()
  })
})

