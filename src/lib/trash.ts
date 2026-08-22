import type { Prisma } from '@/generated/prisma/client'

export const TRASH_NOT_FOUND = '문서를 찾을 수 없거나 이미 휴지통에 있습니다.'
export const RESTORE_NOT_FOUND = '휴지통에 없는 문서입니다.'

// 목록·다운로드·삭제가 같은 조건을 봐야 한다. 한 곳에 두어 필터 누락을 막는다.
// 호출마다 새 객체를 만드는 이유: 공유 상수를 spread로 변형하다 오염되는 사고를 막는다.
export function activeDocumentWhere(): Prisma.DocumentWhereInput {
  return { deletedAt: null }
}

export function trashedDocumentWhere(): Prisma.DocumentWhereInput {
  return { deletedAt: { not: null } }
}

/** 최근 지운 것이 위로. 위 where 헬퍼와 같은 이유로 호출마다 새 객체를 만든다. */
export function trashOrderBy(): Prisma.DocumentOrderByWithRelationInput {
  return { deletedAt: 'desc' }
}

export type MutationOutcome = { ok: true } | { ok: false; status: 404; error: string }

/** count 0은 "없는 문서"와 "이미 그 상태"를 구분하지 않는다 — 둘 다 사용자에겐 404다. */
export function outcomeFromCount(count: number, notFoundMessage: string): MutationOutcome {
  return count > 0 ? { ok: true } : { ok: false, status: 404, error: notFoundMessage }
}
