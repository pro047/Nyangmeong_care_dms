import type { Prisma } from '@/generated/prisma/client'

export const TRASH_NOT_FOUND = '문서를 찾을 수 없거나 이미 휴지통에 있습니다.'
export const RESTORE_NOT_FOUND = '휴지통에 없는 문서입니다.'
// 영구삭제도 같은 조건을 본다 — 활성 문서는 영구삭제 대상이 아니다(먼저 휴지통으로 보내야 한다).
export const PURGE_NOT_FOUND = '휴지통에 없는 문서입니다.'
// 활성 문서를 고쳐 쓰는 쪽(제목 수정·재업로드)이 공유한다. "없는 문서"와 "휴지통 문서"를
// 구분하지 않는 이유는 outcomeFromCount 와 같다 — 둘 다 사용자에겐 404다.
export const ACTIVE_DOCUMENT_NOT_FOUND = '문서를 찾을 수 없거나 휴지통에 있습니다.'

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

/**
 * 영구삭제가 지울 S3 키 목록. 한 문서 안에서 같은 키가 여러 버전에 걸릴 수 있어
 * 중복을 없앤다 — `keyToken` 이 5분간 재사용 가능해서(HANDOFF "미룬 항목") 같은 객체를
 * 가리키는 버전이 실제로 생길 수 있다.
 *
 * **이 목록을 그대로 지우면 안 된다.** 다른 문서가 같은 키를 가리키고 있을 수 있으므로,
 * 호출부가 DB 삭제 후 남은 참조 수를 확인하고 0 인 것만 지운다.
 */
export function purgeCandidateKeys(versions: { s3Key: string }[]): string[] {
  return [...new Set(versions.map((v) => v.s3Key))]
}
