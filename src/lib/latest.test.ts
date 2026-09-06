import { describe, expect, it } from 'vitest'
import { latestCandidateQuery, supersededDocumentIds, type LatestCandidate } from '@/lib/latest'

const at = (iso: string) => new Date(iso)

describe('supersededDocumentIds', () => {
  it('폴더마다 최신 하나만 빼고 나머지를 골라야 한다', () => {
    const rows: LatestCandidate[] = [
      { id: 'a1', folderId: 'health', updatedAt: at('2026-08-25T00:00:00Z') },
      { id: 'a2', folderId: 'health', updatedAt: at('2026-08-31T00:00:00Z') },
      { id: 'a3', folderId: 'health', updatedAt: at('2026-08-26T00:00:00Z') },
      { id: 'b1', folderId: 'login', updatedAt: at('2026-07-01T00:00:00Z') },
    ]

    expect(supersededDocumentIds(rows)).toEqual(new Set(['a1', 'a3']))
  })

  it('폴더에 문서가 1건뿐이면 아무것도 고르지 않아야 한다', () => {
    const rows: LatestCandidate[] = [
      { id: 'a1', folderId: 'health', updatedAt: at('2026-08-25T00:00:00Z') },
      { id: 'b1', folderId: 'login', updatedAt: at('2026-07-01T00:00:00Z') },
      { id: 'n1', folderId: null, updatedAt: at('2026-06-01T00:00:00Z') },
    ]

    expect(supersededDocumentIds(rows)).toEqual(new Set())
  })

  it('입력 순서에 의존하지 않아야 한다', () => {
    const rows: LatestCandidate[] = [
      { id: 'a1', folderId: 'health', updatedAt: at('2026-08-31T00:00:00Z') },
      { id: 'a2', folderId: 'health', updatedAt: at('2026-08-25T00:00:00Z') },
    ]

    expect(supersededDocumentIds(rows)).toEqual(supersededDocumentIds([...rows].reverse()))
  })

  it('같은 시각이면 id 로 갈라 정확히 한 건만 최신으로 남겨야 한다', () => {
    const rows: LatestCandidate[] = [
      { id: 'b', folderId: 'health', updatedAt: at('2026-08-31T00:00:00Z') },
      { id: 'a', folderId: 'health', updatedAt: at('2026-08-31T00:00:00Z') },
    ]

    expect(supersededDocumentIds(rows)).toEqual(new Set(['b']))
  })

  it('폴더 없는 문서끼리도 한 그룹으로 봐야 한다', () => {
    const rows: LatestCandidate[] = [
      { id: 'n1', folderId: null, updatedAt: at('2026-08-20T00:00:00Z') },
      { id: 'n2', folderId: null, updatedAt: at('2026-08-21T00:00:00Z') },
      { id: 'f1', folderId: 'health', updatedAt: at('2026-01-01T00:00:00Z') },
    ]

    // n1 만 흐려진다. f1 은 폴더에 혼자라 최신이다.
    expect(supersededDocumentIds(rows)).toEqual(new Set(['n1']))
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
