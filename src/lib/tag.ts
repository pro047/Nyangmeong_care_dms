import { z } from 'zod'
import { ACTIVE_DOCUMENT_NOT_FOUND } from '@/lib/trash'

export const MAX_TAGS_PER_DOCUMENT = 10
export const MAX_TAG_LENGTH = 30

export const TAG_CONFLICT = '태그가 동시에 수정되었습니다. 잠시 후 다시 시도해 주세요.'

/**
 * 앞뒤 공백 제거 → 빈 항목 제거 → 대소문자 무시 중복 제거(먼저 온 표기를 남긴다).
 * 저장 표기를 소문자로 강제하지 않는 이유: 팀 태그가 한글 위주라 얻는 것이 없고,
 * 사용자가 쓴 대로 보이는 편이 낫다.
 */
export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []

  for (const item of raw) {
    const name = item.trim()
    if (name === '') continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }

  return names
}

/**
 * 태그 교체 본문. 개수·길이 검사보다 정규화를 먼저 돌린다 — 공백·중복 때문에 11개가 된
 * 요청까지 400 으로 떨구면 사용자 눈에는 10개도 안 되는데 거절당한 것으로 보인다.
 */
export const tagsPutSchema = z
  .object({ tags: z.array(z.string()) })
  .transform((body) => ({ tags: normalizeTags(body.tags) }))
  .refine(
    (body) =>
      body.tags.length <= MAX_TAGS_PER_DOCUMENT &&
      body.tags.every((name) => name.length <= MAX_TAG_LENGTH),
  )

export type TagsPutInput = z.infer<typeof tagsPutSchema>

export type TagUpdateFailure = { status: 404 | 409; error: string }

/**
 * folder.ts 와 같은 방식으로 code 문자열만 본다. P2025 는 문서가 없거나 휴지통에 있다는 뜻,
 * P2002 는 같은 태그 이름을 두 요청이 동시에 만들려 한 경합이다.
 */
export function tagUpdateFailure(err: unknown): TagUpdateFailure | null {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined
  if (code === 'P2025') return { status: 404, error: ACTIVE_DOCUMENT_NOT_FOUND }
  if (code === 'P2002') return { status: 409, error: TAG_CONFLICT }
  return null
}
