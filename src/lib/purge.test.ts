import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { parseTrashCutoff, purgeTrashedDocuments, unreferencedKeys, type PurgeScope } from '@/lib/purge'

// 단건 영구삭제와 휴지통 비우기가 공유하는 절차. deps 를 가짜로 꽂아 "무엇을 어떤 순서·인자로
// 부르고 무엇을 돌려주는가"만 본다 — DB·S3 에는 붙지 않는다 (upload-commit.test.ts 와 같은 방식).
const documentFindMany = vi.fn()
const documentDeleteMany = vi.fn()
const documentVersionFindMany = vi.fn()
const deleteObject = vi.fn()
const scheduleMeasure = vi.fn()

const prisma = {
  document: { findMany: documentFindMany, deleteMany: documentDeleteMany },
  documentVersion: { findMany: documentVersionFindMany },
} as unknown as PrismaClient

function deps() {
  return { prisma, deleteObject, scheduleMeasure }
}

const Q1_SELECT = { id: true, docKey: true, versions: { select: { s3Key: true } } }

function doc(id: string, s3Keys: string[], docKey: string | null = null) {
  return { id, docKey, versions: s3Keys.map((s3Key) => ({ s3Key })) }
}

const TWO_DOCS = [doc('doc_1', ['k1']), doc('doc_2', ['k2'])]

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  documentFindMany.mockReset().mockResolvedValue(TWO_DOCS)
  documentDeleteMany.mockReset().mockResolvedValue({ count: 2 })
  documentVersionFindMany.mockReset().mockResolvedValue([])
  deleteObject.mockReset().mockResolvedValue(undefined)
  scheduleMeasure.mockReset()
  // S3 정리 실패는 로그로만 남는다 — 테스트 출력이 그 로그로 덮이지 않게 막는다.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('purgeTrashedDocuments — 대상 확정 (Q1)', () => {
  it('AC-2 소유자 scope 면 그 뒤에 휴지통 조건을 붙여 조회해야 한다', async () => {
    await purgeTrashedDocuments({ createdById: 'user_1' }, deps())

    expect(documentFindMany).toHaveBeenCalledTimes(1)
    expect(documentFindMany.mock.calls[0][0]).toEqual({
      where: { createdById: 'user_1', deletedAt: { not: null } },
      select: Q1_SELECT,
    })
  })

  it('AC-2 id scope 면 그 문서 하나를 휴지통 조건과 함께 조회해야 한다', async () => {
    await purgeTrashedDocuments({ id: 'doc_1' }, deps())

    expect(documentFindMany.mock.calls[0][0]).toEqual({
      where: { id: 'doc_1', deletedAt: { not: null } },
      select: Q1_SELECT,
    })
  })

  it('AC-2 빈 scope(관리자)면 휴지통 조건만으로 조회해야 한다', async () => {
    await purgeTrashedDocuments({}, deps())

    expect(documentFindMany.mock.calls[0][0]).toEqual({
      where: { deletedAt: { not: null } },
      select: Q1_SELECT,
    })
  })

  // 타입은 여분 필드를 막지 못한다(구조적 대입). 활성 문서를 지키는 것은 펼치는 순서다.
  it('scope 에 deletedAt 이 섞여 들어와도 휴지통 조건이 이겨야 한다', async () => {
    const leaked = { createdById: 'user_1', deletedAt: null } as unknown as PurgeScope

    await purgeTrashedDocuments(leaked, deps())

    expect(documentFindMany.mock.calls[0][0].where).toEqual({
      createdById: 'user_1',
      deletedAt: { not: null },
    })
  })

  it('AC-3 대상이 0건이면 count 0 을 돌려주고 삭제·참조 조회·S3·측정에 가지 않아야 한다', async () => {
    documentFindMany.mockResolvedValue([])

    const result = await purgeTrashedDocuments({ createdById: 'user_1' }, deps())

    expect(result).toEqual({ count: 0 })
    expect(documentDeleteMany).not.toHaveBeenCalled()
    expect(documentVersionFindMany).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
    expect(scheduleMeasure).not.toHaveBeenCalled()
  })

  it('대상 조회가 던지면 그대로 던지고 아무것도 지우지 않아야 한다', async () => {
    const boom = new Error('연결 끊김')
    documentFindMany.mockRejectedValue(boom)

    await expect(purgeTrashedDocuments({}, deps())).rejects.toBe(boom)
    expect(documentDeleteMany).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })
})

describe('purgeTrashedDocuments — DB 삭제 (Q2)', () => {
  it('AC-1 읽은 id 만, 휴지통 조건을 다시 걸어 지워야 한다', async () => {
    const result = await purgeTrashedDocuments({ createdById: 'user_1' }, deps())

    expect(documentDeleteMany).toHaveBeenCalledTimes(1)
    // 소유자 조건은 다시 걸지 않는다 — id 가 이미 그 조건으로 걸러졌다.
    expect(documentDeleteMany.mock.calls[0][0]).toEqual({
      where: { id: { in: ['doc_1', 'doc_2'] }, deletedAt: { not: null } },
    })
    expect(result).toEqual({ count: 2 })
  })

  it('AC-1 id 는 조회 결과의 순서 그대로여야 한다', async () => {
    documentFindMany.mockResolvedValue([doc('doc_9', ['k9']), doc('doc_3', ['k3']), doc('doc_5', ['k5'])])
    documentDeleteMany.mockResolvedValue({ count: 3 })

    await purgeTrashedDocuments({}, deps())

    expect(documentDeleteMany.mock.calls[0][0].where.id).toEqual({ in: ['doc_9', 'doc_3', 'doc_5'] })
  })

  it('AC-4 읽은 뒤 전부 복구돼 count 가 0 이면 참조 조회·S3·측정에 가지 않아야 한다', async () => {
    documentFindMany.mockResolvedValue([doc('doc_1', ['k1'], 'KEY-1'), doc('doc_2', ['k2'])])
    documentDeleteMany.mockResolvedValue({ count: 0 })

    const result = await purgeTrashedDocuments({ createdById: 'user_1' }, deps())

    expect(result).toEqual({ count: 0 })
    expect(documentVersionFindMany).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
    expect(scheduleMeasure).not.toHaveBeenCalled()
  })

  it('count 는 읽은 수가 아니라 실제로 지워진 수여야 한다', async () => {
    documentDeleteMany.mockResolvedValue({ count: 1 })

    const result = await purgeTrashedDocuments({}, deps())

    expect(result).toEqual({ count: 1 })
  })

  it('AC-9 DB 삭제가 모든 S3 삭제보다 먼저여야 한다', async () => {
    await purgeTrashedDocuments({}, deps())

    expect(deleteObject).toHaveBeenCalledTimes(2)
    const deletedAt = documentDeleteMany.mock.invocationCallOrder[0]
    for (const order of deleteObject.mock.invocationCallOrder) {
      expect(deletedAt).toBeLessThan(order)
    }
  })

  it('AC-9 DB 삭제가 던지면 그대로 던지고 S3 를 건드리지 않아야 한다', async () => {
    const boom = new Error('삭제 실패')
    documentFindMany.mockResolvedValue([doc('doc_1', ['k1'], 'KEY-1')])
    documentDeleteMany.mockRejectedValue(boom)

    await expect(purgeTrashedDocuments({ id: 'doc_1' }, deps())).rejects.toBe(boom)
    expect(documentVersionFindMany).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
    expect(scheduleMeasure).not.toHaveBeenCalled()
  })

  it('세 쿼리는 대상 조회 → 삭제 → 참조 조회 순서여야 한다', async () => {
    await purgeTrashedDocuments({}, deps())

    const q1 = documentFindMany.mock.invocationCallOrder[0]
    const q2 = documentDeleteMany.mock.invocationCallOrder[0]
    const q3 = documentVersionFindMany.mock.invocationCallOrder[0]
    expect(q1).toBeLessThan(q2)
    // 참조 조회가 삭제보다 앞서면 지울 문서의 버전 행이 아직 남아 있어 전부 "참조 중"으로 보인다.
    expect(q2).toBeLessThan(q3)
  })
})

describe('purgeTrashedDocuments — S3 정리', () => {
  it('AC-5 아직 참조되는 키는 지우지 않아야 한다', async () => {
    documentVersionFindMany.mockResolvedValue([{ s3Key: 'k1' }])

    await purgeTrashedDocuments({}, deps())

    expect(deleteObject).toHaveBeenCalledTimes(1)
    expect(deleteObject).toHaveBeenCalledWith('k2')
  })

  it('AC-5 읽은 뒤 복구된 문서의 키는 남기고 지워진 문서의 키만 지워야 한다', async () => {
    documentFindMany.mockResolvedValue([doc('doc_1', ['a1', 'a2']), doc('doc_2', ['b1'])])
    documentDeleteMany.mockResolvedValue({ count: 1 })
    documentVersionFindMany.mockResolvedValue([{ s3Key: 'a1' }, { s3Key: 'a2' }])

    const result = await purgeTrashedDocuments({}, deps())

    expect(result).toEqual({ count: 1 })
    expect(deleteObject.mock.calls).toEqual([['b1']])
  })

  it('모든 키가 아직 참조되면 S3 삭제를 한 번도 하지 않아야 한다', async () => {
    documentVersionFindMany.mockResolvedValue([{ s3Key: 'k1' }, { s3Key: 'k2' }])

    const result = await purgeTrashedDocuments({}, deps())

    expect(result).toEqual({ count: 2 })
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('AC-6 참조 조회는 키 수와 무관하게 1회이고 중복 없는 키를 처음 나온 순서로 넘겨야 한다', async () => {
    documentFindMany.mockResolvedValue([doc('doc_1', ['b', 'a']), doc('doc_2', ['b'])])

    await purgeTrashedDocuments({}, deps())

    expect(documentVersionFindMany).toHaveBeenCalledTimes(1)
    expect(documentVersionFindMany.mock.calls[0][0]).toEqual({
      where: { s3Key: { in: ['b', 'a'] } },
      select: { s3Key: true },
    })
    // 중복 키에 두 번 부르지 않는다.
    expect(deleteObject.mock.calls).toEqual([['b'], ['a']])
  })

  it('AC-6 키가 많아도 참조 조회는 1회여야 한다', async () => {
    const keys = Array.from({ length: 12 }, (_, i) => `k${i}`)
    documentFindMany.mockResolvedValue([doc('doc_1', keys.slice(0, 6)), doc('doc_2', keys.slice(6))])

    await purgeTrashedDocuments({}, deps())

    expect(documentVersionFindMany).toHaveBeenCalledTimes(1)
    expect(documentVersionFindMany.mock.calls[0][0].where).toEqual({ s3Key: { in: keys } })
    expect(deleteObject.mock.calls).toEqual(keys.map((key) => [key]))
  })

  it('버전이 하나도 없는 문서만 지웠으면 참조 조회도 S3 삭제도 하지 않아야 한다', async () => {
    documentFindMany.mockResolvedValue([doc('doc_1', [])])
    documentDeleteMany.mockResolvedValue({ count: 1 })

    const result = await purgeTrashedDocuments({ id: 'doc_1' }, deps())

    expect(result).toEqual({ count: 1 })
    expect(documentVersionFindMany).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('AC-7 한 키의 S3 삭제가 실패해도 던지지 않고 나머지 키를 계속 지워야 한다', async () => {
    documentFindMany.mockResolvedValue([doc('doc_1', ['k1', 'k2', 'k3'])])
    documentDeleteMany.mockResolvedValue({ count: 1 })
    deleteObject.mockImplementation(async (key: string) => {
      if (key === 'k2') throw new Error('S3 실패')
    })

    const result = await purgeTrashedDocuments({ id: 'doc_1' }, deps())

    expect(result).toEqual({ count: 1 })
    expect(deleteObject.mock.calls).toEqual([['k1'], ['k2'], ['k3']])
    expect(consoleError).toHaveBeenCalled()
  })

  it('AC-7 모든 키의 S3 삭제가 실패해도 지워진 문서 수를 돌려줘야 한다', async () => {
    deleteObject.mockRejectedValue(new Error('S3 실패'))

    const result = await purgeTrashedDocuments({}, deps())

    expect(result).toEqual({ count: 2 })
    expect(deleteObject).toHaveBeenCalledTimes(2)
  })

  it('AC-8 참조 조회가 던지면 던지지 않고 count 를 돌려주며 아무 키도 지우지 않아야 한다', async () => {
    documentVersionFindMany.mockRejectedValue(new Error('연결 끊김'))

    const result = await purgeTrashedDocuments({}, deps())

    // 어느 키가 아직 쓰이는지 모르는 채로 지우면 복구된 문서의 파일이 사라진다.
    expect(result).toEqual({ count: 2 })
    expect(deleteObject).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
  })

  // 풀이 5개라 S3 호출을 한꺼번에 쏟지 않는다 — 앞 키가 끝나기 전에는 다음 키를 시작하지 않는다.
  it('S3 삭제는 한 번에 하나씩 순차로 해야 한다', async () => {
    let releaseFirst: () => void = () => {}
    deleteObject.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve
        }),
    )

    const pending = purgeTrashedDocuments({}, deps())
    await vi.waitFor(() => expect(deleteObject).toHaveBeenCalledTimes(1))
    // 병렬이면 첫 호출과 같은 틱에 둘째가 나간다. 마이크로태스크를 다 비운 뒤에도 1회여야 한다.
    await new Promise((resolve) => setImmediate(resolve))
    expect(deleteObject).toHaveBeenCalledTimes(1)

    releaseFirst()
    await pending

    expect(deleteObject.mock.calls).toEqual([['k1'], ['k2']])
  })
})

describe('purgeTrashedDocuments — 정합성 측정 예약', () => {
  it('AC-10 docKey 문서가 여러 건이어도 측정 예약은 정확히 1회여야 한다', async () => {
    documentFindMany.mockResolvedValue([doc('doc_1', ['k1'], 'KEY-1'), doc('doc_2', ['k2'], 'KEY-2')])

    await purgeTrashedDocuments({}, deps())

    expect(scheduleMeasure).toHaveBeenCalledTimes(1)
  })

  it('AC-10 docKey 문서가 하나만 섞여 있어도 1회 예약해야 한다', async () => {
    documentFindMany.mockResolvedValue([doc('doc_1', ['k1']), doc('doc_2', ['k2'], 'KEY-2')])

    await purgeTrashedDocuments({}, deps())

    expect(scheduleMeasure).toHaveBeenCalledTimes(1)
  })

  it('AC-10 docKey 문서가 없으면 예약하지 않아야 한다', async () => {
    const result = await purgeTrashedDocuments({}, deps())

    expect(result).toEqual({ count: 2 })
    expect(scheduleMeasure).not.toHaveBeenCalled()
  })

  it('S3 정리가 전부 실패해도 측정 예약은 빠지지 않아야 한다', async () => {
    documentFindMany.mockResolvedValue([doc('doc_1', ['k1'], 'KEY-1')])
    documentDeleteMany.mockResolvedValue({ count: 1 })
    documentVersionFindMany.mockRejectedValue(new Error('연결 끊김'))

    await purgeTrashedDocuments({ id: 'doc_1' }, deps())

    expect(scheduleMeasure).toHaveBeenCalledTimes(1)
  })
})

describe('purgeTrashedDocuments — 빈 범위 값 · 기준 시각 (리뷰 뒤 추가)', () => {
  // Prisma 는 where 의 undefined 를 조건 없음으로 읽는다 — 그대로 가면 전원의 휴지통이 대상이다.
  it.each([
    ['createdById 가 undefined', { createdById: undefined }],
    ['createdById 가 빈 문자열', { createdById: '' }],
    ['id 가 undefined', { id: undefined }],
    ['id 가 빈 문자열', { id: '' }],
  ])('%s 이면 던지고 조회조차 하지 않아야 한다', async (_label, scope) => {
    await expect(purgeTrashedDocuments(scope as unknown as PurgeScope, deps())).rejects.toThrow()

    expect(documentFindMany).not.toHaveBeenCalled()
    expect(documentDeleteMany).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('deletedBefore 가 있으면 그 시각까지 휴지통에 들어온 문서만 조회해야 한다', async () => {
    const deletedBefore = new Date('2026-10-11T12:00:00.000Z')

    await purgeTrashedDocuments({ createdById: 'user_1', deletedBefore }, deps())

    expect(documentFindMany.mock.calls[0][0].where).toEqual({
      createdById: 'user_1',
      deletedAt: { not: null, lte: deletedBefore },
    })
  })

  it('관리자 범위에 deletedBefore 만 있으면 소유자 조건 없이 그 시각까지만 조회해야 한다', async () => {
    const deletedBefore = new Date('2026-10-11T12:00:00.000Z')

    await purgeTrashedDocuments({ deletedBefore }, deps())

    expect(documentFindMany.mock.calls[0][0].where).toEqual({
      deletedAt: { not: null, lte: deletedBefore },
    })
  })

  it('참조 조회가 던지면 고아가 될 키 목록을 로그에 남겨야 한다', async () => {
    documentVersionFindMany.mockRejectedValue(new Error('연결 끊김'))

    await purgeTrashedDocuments({}, deps())

    expect(consoleError.mock.calls.flat()).toContainEqual(['k1', 'k2'])
  })
})

describe('parseTrashCutoff', () => {
  it('ISO 시각을 Date 로 읽어야 한다', () => {
    expect(parseTrashCutoff('2026-10-11T12:00:00.000Z')).toEqual(new Date('2026-10-11T12:00:00.000Z'))
  })

  it.each([[null], [''], ['abc']])('%s 는 null 이어야 한다', (raw) => {
    expect(parseTrashCutoff(raw)).toBeNull()
  })
})

describe('unreferencedKeys', () => {
  it('AC-11 참조되는 키를 빼고 후보의 순서를 지켜야 한다', () => {
    expect(unreferencedKeys(['b', 'a', 'c'], [{ s3Key: 'a' }])).toEqual(['b', 'c'])
  })

  it('AC-11 후보가 비면 빈 배열이어야 한다', () => {
    expect(unreferencedKeys([], [{ s3Key: 'a' }])).toEqual([])
  })

  it('AC-11 참조가 비면 후보 그대로여야 한다', () => {
    expect(unreferencedKeys(['b', 'a', 'c'], [])).toEqual(['b', 'a', 'c'])
  })

  it('전부 참조되면 빈 배열이어야 한다', () => {
    expect(unreferencedKeys(['a', 'b'], [{ s3Key: 'b' }, { s3Key: 'a' }])).toEqual([])
  })

  it('후보에 없는 참조 키는 결과에 끼어들지 않아야 한다', () => {
    expect(unreferencedKeys(['a'], [{ s3Key: 'z' }])).toEqual(['a'])
  })
})
