import { z } from 'zod'
import { TITLE_MAX_LENGTH } from '@/lib/title'

export const MOVE_FOLDER_NOT_FOUND = '이동할 폴더를 찾을 수 없습니다.'

/** 제목·설명·폴더 수정 본문. 전부 선택이지만 하나도 없으면 수정할 것이 없다 — 빈 요청은 400. */
export const documentPatchSchema = z
  .object({
    // trim 을 min/max 앞에 둔다. 뒤에 두면 공백뿐인 제목이 min(1)을 통과한다.
    title: z.string().trim().min(1).max(TITLE_MAX_LENGTH).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    // description 과 같은 3상: 문자열이면 그 폴더로, null 이면 미분류로, 생략이면 그대로 둔다.
    folderId: z.string().min(1).nullable().optional(),
  })
  .refine(
    (v) => v.title !== undefined || v.description !== undefined || v.folderId !== undefined,
  )

export type DocumentPatchInput = z.infer<typeof documentPatchSchema>

/**
 * 빈 설명을 빈 문자열로 저장하면 "설명 없음" 판정이 표시하는 쪽마다 갈린다('' 인가 null 인가).
 * 저장 시점에 null 하나로 모은다.
 */
export function toDocumentPatchData(input: DocumentPatchInput) {
  const data: { title?: string; description?: string | null; folderId?: string | null } = {}
  if (input.title !== undefined) data.title = input.title
  if (input.description !== undefined) {
    data.description = input.description === '' ? null : input.description
  }
  if (input.folderId !== undefined) data.folderId = input.folderId
  return data
}

export type DocumentPatchFailure = { status: 404; error: string }

/**
 * version-create.ts 와 같이 code 문자열만 본다. P2003 은 folder FK 위반 = 없는 폴더로
 * 옮기려 했다는 뜻이다(조회와 수정 사이에 남이 폴더를 지운 경우 포함).
 */
export function documentPatchFailure(err: unknown): DocumentPatchFailure | null {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined
  if (code === 'P2003') return { status: 404, error: MOVE_FOLDER_NOT_FOUND }
  return null
}
