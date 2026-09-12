import { describe, expect, it } from 'vitest'
import {
  CONSISTENCY_DUPLICATE,
  consistencyFailure,
  consistencyProblem,
  consistencySchema,
  countByLevel,
  snapshotCreateData,
  type ConsistencyInput,
} from '@/lib/consistency'

/** 저쪽 인계문 §2 의 실측 페이로드를 축소한 것. 값이 아니라 모양을 고정한다. */
function payload(over: Partial<ConsistencyInput> = {}): ConsistencyInput {
  return {
    measuredAt: '2026-09-11T20:31:00+09:00',
    reqVer: '0.6',
    counts: { errors: 1, warnings: 1, pending: 0, unresolved: 0 },
    metrics: [
      { axis: 'reference', from: 'FN', to: 'REQ', ok: 42, total: 42 },
      { axis: 'referenceTotal', from: null, to: null, ok: 361, total: 377 },
    ],
    findings: [
      { level: 'error', check: '참조', doc: 'SCR-COM', refId: 'SCR-HLT-001', where: 'SCR-COM-001@블록1', message: '참조 대상 없음' },
      { level: 'warning', check: 'REQ커버리지', doc: 'REQ', refId: 'REQ-HLT-005', where: null, message: '참조 없음' },
    ],
    docs: [{ key: 'REQ', ver: '0.6', dmsId: 'cmtrysbjs000204jrz79h47dz', dmsVersion: 4 }],
    ...over,
  }
}

describe('consistencySchema', () => {
  it('실측 모양의 페이로드를 통과시켜야 한다', () => {
    expect(consistencySchema.safeParse(payload()).success).toBe(true)
  })

  it('타임존 없는 시각은 거절해야 한다', () => {
    // 타임존을 놓치면 DB 시각이 9시간 밀린다 — 이 리포가 실제로 겪은 지뢰다.
    const parsed = consistencySchema.safeParse(payload({ measuredAt: '2026-09-11T20:31:00' }))
    expect(parsed.success).toBe(false)
  })

  it('달력에 없는 날짜는 거절해야 한다', () => {
    // 그냥 string 으로 받았으면 new Date() 가 Invalid Date 로 조용히 통과시킨다.
    expect(consistencySchema.safeParse(payload({ measuredAt: '2026-13-99T00:00:00+09:00' })).success).toBe(false)
  })

  it('모르는 level 은 거절해야 한다', () => {
    const bad = payload()
    const parsed = consistencySchema.safeParse({
      ...bad,
      findings: [{ ...bad.findings[0], level: 'critical' }],
    })
    expect(parsed.success).toBe(false)
  })

  it('metrics 가 비면 거절해야 한다', () => {
    expect(consistencySchema.safeParse(payload({ metrics: [] })).success).toBe(false)
  })

  it('findings 가 비어도 통과해야 한다', () => {
    // 문제가 하나도 없는 측정은 정상이다 — 거절하면 정합성이 완전할 때 못 보낸다.
    const parsed = consistencySchema.safeParse(
      payload({ findings: [], counts: { errors: 0, warnings: 0, pending: 0, unresolved: 0 } }),
    )
    expect(parsed.success).toBe(true)
  })
})

describe('countByLevel', () => {
  it('없는 등급도 0 으로 세어야 한다', () => {
    expect(countByLevel([{ level: 'error' }, { level: 'error' }])).toEqual({
      error: 2,
      warning: 0,
      pending: 0,
      unresolved: 0,
    })
  })
})

describe('consistencyProblem', () => {
  it('온전한 페이로드는 통과해야 한다', () => {
    expect(consistencyProblem(payload())).toBeNull()
  })

  // 25.4KB 본문이 중간에 잘리면 findings 만 줄고 counts 는 그대로다. 여기서만 드러난다.
  it('counts 가 findings 보다 많으면 거절해야 한다', () => {
    const problem = consistencyProblem(payload({ counts: { errors: 14, warnings: 1, pending: 0, unresolved: 0 } }))
    expect(problem?.error).toContain('counts 와 findings 가 어긋납니다')
    expect(problem?.error).toContain('error')
  })

  it('counts 가 findings 보다 적어도 거절해야 한다', () => {
    expect(consistencyProblem(payload({ counts: { errors: 0, warnings: 1, pending: 0, unresolved: 0 } }))).not.toBeNull()
  })

  // 포스트그레스 유일 인덱스는 NULL 을 서로 다른 값으로 보므로 DB 가 이걸 안 막는다.
  it('from/to 가 null 인 같은 축이 두 번 오면 거절해야 한다', () => {
    const problem = consistencyProblem(
      payload({
        metrics: [
          { axis: 'reqCoverage', from: null, to: null, ok: 37, total: 62 },
          { axis: 'reqCoverage', from: null, to: null, ok: 37, total: 50 },
        ],
      }),
    )
    expect(problem?.error).toContain('같은 축이 두 번')
  })

  it('from/to 가 다르면 같은 axis 라도 통과해야 한다', () => {
    const problem = consistencyProblem(
      payload({
        metrics: [
          { axis: 'reference', from: 'FN', to: 'REQ', ok: 42, total: 42 },
          { axis: 'reference', from: 'FN', to: 'SCR', ok: 55, total: 58 },
        ],
      }),
    )
    expect(problem).toBeNull()
  })

  it('분자가 분모보다 크면 거절해야 한다', () => {
    const problem = consistencyProblem(
      payload({ metrics: [{ axis: 'scrCoverage', from: null, to: null, ok: 129, total: 100 }] }),
    )
    expect(problem?.error).toContain('분자가 분모보다 큽니다')
  })

  it('분모가 0 이어도 분자가 0 이면 통과해야 한다', () => {
    // 측정 대상이 아직 없는 축이다. 화면이 0/0 을 어떻게 그릴지는 화면의 문제다.
    expect(
      consistencyProblem(payload({ metrics: [{ axis: 'scrCoverage', from: null, to: null, ok: 0, total: 0 }] })),
    ).toBeNull()
  })
})

describe('snapshotCreateData', () => {
  it('중첩 create 한 벌로 옮겨야 한다', () => {
    const data = snapshotCreateData(payload())
    expect(data.measuredAt).toBeInstanceOf(Date)
    expect(data.metrics.create).toHaveLength(2)
    expect(data.findings.create).toHaveLength(2)
    expect(data.docs.create).toHaveLength(1)
  })

  it('from/to 를 fromKind/toKind 로 옮겨야 한다', () => {
    const data = snapshotCreateData(payload())
    expect(data.metrics.create[0]).toMatchObject({ fromKind: 'FN', toKind: 'REQ' })
    expect(data.metrics.create[1]).toMatchObject({ fromKind: null, toKind: null })
  })

  it('타임존을 살려 UTC 로 옮겨야 한다', () => {
    // +09:00 20:31 은 UTC 11:31 이다. 이게 밀리면 화면의 "측정 시각" 이 9시간 틀린다.
    expect(snapshotCreateData(payload()).measuredAt.toISOString()).toBe('2026-09-11T11:31:00.000Z')
  })
})

describe('consistencyFailure', () => {
  it('P2002 는 409 로 바꿔야 한다', () => {
    expect(consistencyFailure({ code: 'P2002' })).toEqual({
      status: 409,
      error: CONSISTENCY_DUPLICATE,
    })
  })

  it('모르는 오류는 null 을 돌려 호출자가 rethrow 하게 해야 한다', () => {
    expect(consistencyFailure({ code: 'P1001' })).toBeNull()
    expect(consistencyFailure(new Error('boom'))).toBeNull()
  })
})
