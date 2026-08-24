import { z } from 'zod'
import { ACTIVE_DOCUMENT_NOT_FOUND } from '@/lib/trash'

export const VERSION_CONFLICT =
  '같은 문서에 다른 버전이 동시에 올라왔습니다. 새로고침 후 다시 시도해 주세요.'

/** 재업로드 본문. 문서 생성 본문에서 title·description·folderId 를 빼고 changeNote 를 넣은 것. */
export const versionCreateSchema = z.object({
  s3Key: z.string().min(1),
  // presign 이 함께 내려준 표. 이게 있어야 s3Key 를 믿을 수 있다 (upload-token.ts).
  keyToken: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  changeNote: z.string().trim().max(500).optional(),
})

export type VersionCreateInput = z.infer<typeof versionCreateSchema>

/** 메모를 안 썼든 공백만 썼든 "메모 없음"은 하나여야 한다. */
export function toChangeNote(raw: string | undefined): string | null {
  return raw ? raw : null
}

/** 최신이 없으면 1. v1 없는 문서는 만들어지지 않으므로 이론상 도달하지 않는다. */
export function nextVersionNo(latestVersionNo: number | null): number {
  return latestVersionNo === null ? 1 : latestVersionNo + 1
}

export type VersionCreateFailure = { status: 404 | 409; error: string }

/**
 * Prisma 오류를 HTTP 결과로 해석한다. 오류 클래스를 import 하지 않고 code 속성만 보는 이유:
 * 실제로 판단에 쓰는 것은 코드 문자열뿐이고, 생성 클라이언트를 테스트로 끌어올 필요가 없다.
 *
 * P2002 는 @@unique([documentId, versionNo]) 충돌 = 같은 번호를 동시에 올린 것,
 * P2025 는 update 대상 없음 = 조회와 수정 사이에 문서가 휴지통으로 갔다는 뜻이다.
 * 그 외는 null 을 돌려 호출자가 rethrow 하게 둔다 — 모르는 오류를 404/409로 뭉개지 않는다.
 */
export function versionCreateFailure(err: unknown): VersionCreateFailure | null {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined
  if (code === 'P2002') return { status: 409, error: VERSION_CONFLICT }
  if (code === 'P2025') return { status: 404, error: ACTIVE_DOCUMENT_NOT_FOUND }
  return null
}
