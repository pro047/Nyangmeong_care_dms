import { describe, expect, it } from 'vitest'
import {
  documentListOrderBy,
  latestCandidateQuery,
  supersededDocumentIds,
  type LatestCandidate,
} from '@/lib/latest'

const at = (iso: string) => new Date(iso)

describe('supersededDocumentIds', () => {
  it('폴더마다 최신 하나만 빼고 나머지를 골라야 한다', () => {
    const rows: LatestCandidate[] = [
      { id: 'a1', folderId: 'health', createdAt: at('2026-08-25T00:00:00Z') },
      { id: 'a2', folderId: 'health', createdAt: at('2026-08-31T00:00:00Z') },
      { id: 'a3', folderId: 'health', createdAt: at('2026-08-26T00:00:00Z') },
      { id: 'b1', folderId: 'login', createdAt: at('2026-07-01T00:00:00Z') },
    ]

    expect(supersededDocumentIds(rows)).toEqual(new Set(['a1', 'a3']))
  })

  it('폴더에 문서가 1건뿐이면 아무것도 고르지 않아야 한다', () => {
    const rows: LatestCandidate[] = [
      { id: 'a1', folderId: 'health', createdAt: at('2026-08-25T00:00:00Z') },
      { id: 'b1', folderId: 'login', createdAt: at('2026-07-01T00:00:00Z') },
      { id: 'n1', folderId: null, createdAt: at('2026-06-01T00:00:00Z') },
    ]

    expect(supersededDocumentIds(rows)).toEqual(new Set())
  })

  it('폴더가 다르면 서로 비교하지 않아야 한다', () => {
    const rows: LatestCandidate[] = [
      { id: 'a1', folderId: 'health', createdAt: at('2026-08-25T00:00:00Z') },
      { id: 'a2', folderId: 'health', createdAt: at('2026-08-26T00:00:00Z') },
      { id: 'b1', folderId: 'login', createdAt: at('2026-01-01T00:00:00Z') },
      { id: 'b2', folderId: 'login', createdAt: at('2026-01-02T00:00:00Z') },
    ]

    expect(supersededDocumentIds(rows)).toEqual(new Set(['a1', 'b1']))
  })

  it('입력 순서에 의존하지 않아야 한다', () => {
    const rows: LatestCandidate[] = [
      { id: 'a1', folderId: 'health', createdAt: at('2026-08-31T00:00:00Z') },
      { id: 'a2', folderId: 'health', createdAt: at('2026-08-25T00:00:00Z') },
    ]

    expect(supersededDocumentIds(rows)).toEqual(supersededDocumentIds([...rows].reverse()))
  })

  it('같은 시각이면 id 로 갈라 정확히 한 건만 최신으로 남겨야 한다', () => {
    const rows: LatestCandidate[] = [
      { id: 'b', folderId: 'health', createdAt: at('2026-08-31T00:00:00Z') },
      { id: 'a', folderId: 'health', createdAt: at('2026-08-31T00:00:00Z') },
    ]

    expect(supersededDocumentIds(rows)).toEqual(new Set(['b']))
  })

  it('미분류 문서는 서로 비교하지 않아야 한다', () => {
    // 자동 분류가 두 번 실패해 회의록과 예산안이 둘 다 미분류로 떨어진 상황.
    // 아무 관계가 없으므로 먼저 올린 쪽을 구버전으로 몰면 안 된다.
    const rows: LatestCandidate[] = [
      { id: 'meeting', folderId: null, createdAt: at('2026-08-20T00:00:00Z') },
      { id: 'budget', folderId: null, createdAt: at('2026-08-21T00:00:00Z') },
    ]

    expect(supersededDocumentIds(rows)).toEqual(new Set())
  })

  it('미분류 문서가 폴더 안 문서의 판정을 흔들지 않아야 한다', () => {
    // 미분류를 2건 넣는 것이 요점이다 — 1건이면 옛 구현(folderId ?? '')에서도 그 문서가
    // 혼자라 최신으로 남아 결과가 같아서, 회귀를 못 잡는 테스트가 된다.
    const rows: LatestCandidate[] = [
      { id: 'n1', folderId: null, createdAt: at('2026-09-01T00:00:00Z') },
      { id: 'n2', folderId: null, createdAt: at('2026-08-15T00:00:00Z') },
      { id: 'f1', folderId: 'health', createdAt: at('2026-08-20T00:00:00Z') },
      { id: 'f2', folderId: 'health', createdAt: at('2026-08-21T00:00:00Z') },
    ]

    // 미분류가 전체에서 제일 최신이어도 health 그룹 판정에는 안 끼어들고,
    // 미분류끼리도 서로 비교하지 않는다.
    expect(supersededDocumentIds(rows)).toEqual(new Set(['f1']))
  })

  it('빈 목록이면 빈 집합이어야 한다', () => {
    expect(supersededDocumentIds([])).toEqual(new Set())
  })
})

describe('latestCandidateQuery', () => {
  it('휴지통 문서를 비교 대상에서 빼야 한다', () => {
    expect(latestCandidateQuery().where).toEqual({ deletedAt: null })
  })
})

describe('documentListOrderBy', () => {
  it('목록 정렬은 구버전 판정과 같은 컬럼을 봐야 한다', () => {
    // 두 규칙이 갈리면 흐려진 구버전이 최신본보다 위에 놓인다 (2026-09-08 회귀).
    const orderKey = Object.keys(documentListOrderBy())[0]
    const candidateKeys = Object.keys(latestCandidateQuery().select)

    expect(candidateKeys).toContain(orderKey)
  })

  it('최근 올린 순이어야 한다', () => {
    expect(documentListOrderBy()).toEqual({ createdAt: 'desc' })
  })
})
