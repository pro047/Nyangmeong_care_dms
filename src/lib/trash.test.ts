import { describe, expect, it } from 'vitest'
import {
  activeDocumentWhere,
  outcomeFromCount,
  RESTORE_NOT_FOUND,
  TRASH_NOT_FOUND,
  trashOrderBy,
  trashedDocumentWhere,
} from '@/lib/trash'

describe('activeDocumentWhere', () => {
  it('두 번 호출하면 서로 다른 객체이고 둘 다 { deletedAt: null } 이어야 한다', () => {
    // Arrange & Act
    const first = activeDocumentWhere()
    const second = activeDocumentWhere()

    // Assert
    expect(first).toEqual({ deletedAt: null })
    expect(second).toEqual({ deletedAt: null })
    expect(first).not.toBe(second)
  })

  it('반환 객체를 호출자가 변형해도 다음 호출 결과가 오염되지 않아야 한다', () => {
    // Arrange: 라우트 핸들러가 `{ id, ...activeDocumentWhere() }` 처럼 spread 하거나
    // 반환값에 직접 키를 덧붙이는 사고를 재현한다.
    const leaked = activeDocumentWhere() as Record<string, unknown>
    leaked.id = 'doc_1'

    // Act
    const fresh = activeDocumentWhere()

    // Assert
    expect(fresh).toEqual({ deletedAt: null })
    expect(fresh).not.toHaveProperty('id')
  })

  it('where 절에 deletedAt 외의 조건(사용자·권한)이 들어가지 않아야 한다', () => {
    // 접근 제어는 길드 멤버십 하나뿐이다 — 작성자 조건 같은 것이 스며들면 여기서 잡힌다.
    expect(Object.keys(activeDocumentWhere())).toEqual(['deletedAt'])
    expect(Object.keys(trashedDocumentWhere())).toEqual(['deletedAt'])
  })
})

describe('trashedDocumentWhere', () => {
  it('{ deletedAt: { not: null } } 이어야 한다', () => {
    expect(trashedDocumentWhere()).toEqual({ deletedAt: { not: null } })
  })

  it('두 번 호출하면 서로 다른 객체여야 한다', () => {
    const first = trashedDocumentWhere()
    const second = trashedDocumentWhere()

    expect(first).not.toBe(second)
    expect(first.deletedAt).not.toBe(second.deletedAt)
  })
})

describe('trashOrderBy', () => {
  it("{ deletedAt: 'desc' } 이어야 한다", () => {
    expect(trashOrderBy()).toEqual({ deletedAt: 'desc' })
  })

  it('두 번 호출하면 서로 다른 객체여야 한다', () => {
    // 공유 상수였을 때는 한 호출자가 변형하면 이후 모든 요청의 정렬이 바뀌었다.
    expect(trashOrderBy()).not.toBe(trashOrderBy())
  })
})

describe('outcomeFromCount', () => {
  const msg = '테스트용 없음 메시지'

  it('count 가 1 이면 { ok: true } 여야 한다', () => {
    expect(outcomeFromCount(1, msg)).toEqual({ ok: true })
  })

  it('count 가 0 이면 { ok: false, status: 404, error: msg } 여야 한다', () => {
    expect(outcomeFromCount(0, msg)).toEqual({ ok: false, status: 404, error: msg })
  })

  it('count 가 2 이면 { ok: true } 여야 한다 (id 는 PK 라 실제로는 0/1 뿐 — 경계 명시)', () => {
    expect(outcomeFromCount(2, msg)).toEqual({ ok: true })
  })

  it('실패 결과의 error 는 넘긴 메시지를 그대로 써야 한다 (삭제·복구 문구가 섞이지 않는다)', () => {
    expect(outcomeFromCount(0, TRASH_NOT_FOUND)).toMatchObject({ error: TRASH_NOT_FOUND })
    expect(outcomeFromCount(0, RESTORE_NOT_FOUND)).toMatchObject({ error: RESTORE_NOT_FOUND })
    expect(TRASH_NOT_FOUND).not.toBe(RESTORE_NOT_FOUND)
  })
})
