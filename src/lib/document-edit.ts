import { z } from 'zod'

/** 제목·설명 수정 본문. 둘 다 선택이지만 하나도 없으면 수정할 것이 없다 — 빈 요청은 400. */
export const documentPatchSchema = z
  .object({
    // trim 을 min/max 앞에 둔다. 뒤에 두면 공백뿐인 제목이 min(1)을 통과한다.
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => v.title !== undefined || v.description !== undefined)

export type DocumentPatchInput = z.infer<typeof documentPatchSchema>

/**
 * 빈 설명을 빈 문자열로 저장하면 "설명 없음" 판정이 표시하는 쪽마다 갈린다('' 인가 null 인가).
 * 저장 시점에 null 하나로 모은다.
 */
export function toDocumentPatchData(input: DocumentPatchInput) {
  const data: { title?: string; description?: string | null } = {}
  if (input.title !== undefined) data.title = input.title
  if (input.description !== undefined) {
    data.description = input.description === '' ? null : input.description
  }
  return data
}
