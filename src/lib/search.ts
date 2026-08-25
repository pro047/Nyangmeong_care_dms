import type { Prisma } from '@/generated/prisma/client'

export const MAX_SEARCH_LENGTH = 100

/**
 * `?q=a&q=b` 면 Next 가 배열을 준다 — 검색어가 아니므로 page-error.ts 와 같이 여기서 걸린다.
 * null 은 "검색하지 않는다"는 뜻이고, 호출자가 안내 문구를 띄운다.
 */
export function normalizeSearchQuery(raw: string | string[] | undefined): string | null {
  if (typeof raw !== 'string') return null
  const q = raw.trim()
  if (q === '' || q.length > MAX_SEARCH_LENGTH) return null
  return q
}

/** 제목·설명·태그 이름 중 하나라도 걸리면 결과. 휴지통 제외는 호출부가 AND 로 결합한다. */
export function documentSearchWhere(q: string): Prisma.DocumentWhereInput {
  return {
    OR: [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { tags: { some: { tag: { name: { contains: q, mode: 'insensitive' } } } } },
    ],
  }
}

/** 값이 없거나 배열이면 필터 없음. 잘못된 링크가 빈 화면 대신 전체 목록으로 떨어진다. */
export function folderFilterWhere(raw: string | string[] | undefined): Prisma.DocumentWhereInput {
  if (typeof raw !== 'string' || raw === '') return {}
  return { folderId: raw }
}

/** 태그는 이름 완전일치. URL 에 id 대신 이름이 실려야 링크가 읽힌다. */
export function tagFilterWhere(raw: string | string[] | undefined): Prisma.DocumentWhereInput {
  if (typeof raw !== 'string' || raw === '') return {}
  return { tags: { some: { tag: { name: raw } } } }
}
