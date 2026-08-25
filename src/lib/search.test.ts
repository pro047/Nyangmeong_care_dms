import { describe, expect, it } from 'vitest'
import {
  documentSearchWhere,
  folderFilterWhere,
  MAX_SEARCH_LENGTH,
  normalizeSearchQuery,
  tagFilterWhere,
} from '@/lib/search'

describe('normalizeSearchQuery', () => {
  it('앞뒤 공백을 잘라 돌려줘야 한다', () => {
    expect(normalizeSearchQuery('  기획안  ')).toBe('기획안')
  })

  it('빈 문자열·공백뿐이면 null 이어야 한다', () => {
    expect(normalizeSearchQuery('')).toBeNull()
    expect(normalizeSearchQuery('   ')).toBeNull()
  })

  it('배열(?q=a&q=b)과 undefined 는 null 이어야 한다', () => {
    expect(normalizeSearchQuery(['a', 'b'])).toBeNull()
    expect(normalizeSearchQuery(undefined)).toBeNull()
  })

  it('101자는 null, 100자는 통과해야 한다', () => {
    expect(normalizeSearchQuery('a'.repeat(MAX_SEARCH_LENGTH + 1))).toBeNull()
    expect(normalizeSearchQuery('a'.repeat(MAX_SEARCH_LENGTH))).toBe('a'.repeat(MAX_SEARCH_LENGTH))
  })
})

describe('documentSearchWhere', () => {
  it('제목·설명·태그명 OR 3절에 전부 insensitive contains 여야 한다', () => {
    expect(documentSearchWhere('기획')).toEqual({
      OR: [
        { title: { contains: '기획', mode: 'insensitive' } },
        { description: { contains: '기획', mode: 'insensitive' } },
        { tags: { some: { tag: { name: { contains: '기획', mode: 'insensitive' } } } } },
      ],
    })
  })
})

describe('folderFilterWhere', () => {
  it('값이 없거나 배열이거나 빈 문자열이면 필터 없음이어야 한다', () => {
    // 잘못된 링크가 빈 화면 대신 전체 목록으로 떨어져야 한다.
    expect(folderFilterWhere(undefined)).toEqual({})
    expect(folderFilterWhere(['f1', 'f2'])).toEqual({})
    expect(folderFilterWhere('')).toEqual({})
  })

  it('정상 값이면 folderId 완전일치여야 한다', () => {
    expect(folderFilterWhere('f1')).toEqual({ folderId: 'f1' })
  })
})

describe('tagFilterWhere', () => {
  it('값이 없거나 배열이거나 빈 문자열이면 필터 없음이어야 한다', () => {
    expect(tagFilterWhere(undefined)).toEqual({})
    expect(tagFilterWhere(['a', 'b'])).toEqual({})
    expect(tagFilterWhere('')).toEqual({})
  })

  it('정상 값이면 태그 이름 완전일치여야 한다 (contains 아님)', () => {
    expect(tagFilterWhere('기획')).toEqual({ tags: { some: { tag: { name: '기획' } } } })
  })
})
