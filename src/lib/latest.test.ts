import { describe, expect, it } from 'vitest'
import { latestCandidateQuery, latestDocumentIds, type LatestCandidate } from '@/lib/latest'

const at = (iso: string) => new Date(iso)

describe('latestDocumentIds', () => {
  it('폴더마다 가장 최근 문서 하나씩만 골라야 한다', () => {
    const rows: LatestCandidate[] = [
      { id: 'a1', folderId: 'health', updatedAt: at('2026-08-25T00:00:00Z') },
      { id: 'a2', folderId: 'health', updatedAt: at('2026-08-31T00:00:00Z') },
      { id: 'a3', folderId: 'health', updatedAt: at('2026-08-26T00:00:00Z') },
      { id: 'b1', folderId: 'login', updatedAt: at('2026-07-01T00:00:00Z') },
    ]

    expect(latestDocumentIds(rows)).toEqual(new Set(['a2', 'b1']))
  })

  it('입력 순서에 의존하지 않아야 한다', () => {
    const rows: LatestCandidate[] = [
      { id: 'a1', folderId: 'health', updatedAt: at('2026-08-31T00:00:00Z') },
      { id: 'a2', folderId: 'health', updatedAt: at('2026-08-25T00:00:00Z') },
    ]

    expect(latestDocumentIds(rows)).toEqual(latestDocumentIds([...rows].reverse()))
  })

  it('같은 시각이면 id 로 갈라 한 건만 남겨야 한다', () => {
    const rows: LatestCandidate[] = [
      { id: 'b', folderId: 'health', updatedAt: at('2026-08-31T00:00:00Z') },
      { id: 'a', folderId: 'health', updatedAt: at('2026-08-31T00:00:00Z') },
    ]

    expect(latestDocumentIds(rows)).toEqual(new Set(['a']))
  })

  it('폴더 없는 문서끼리도 한 그룹으로 봐야 한다', () => {
    const rows: LatestCandidate[] = [
      { id: 'n1', folderId: null, updatedAt: at('2026-08-20T00:00:00Z') },
      { id: 'n2', folderId: null, updatedAt: at('2026-08-21T00:00:00Z') },
      { id: 'f1', folderId: 'health', updatedAt: at('2026-01-01T00:00:00Z') },
    ]

    expect(latestDocumentIds(rows)).toEqual(new Set(['n2', 'f1']))
  })

  it('빈 목록이면 빈 집합이어야 한다', () => {
    expect(latestDocumentIds([])).toEqual(new Set())
  })
})

describe('latestCandidateQuery', () => {
  it('휴지통 문서를 후보에서 빼야 한다', () => {
    expect(latestCandidateQuery().where).toEqual({ deletedAt: null })
  })
})
