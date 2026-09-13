import { z } from 'zod'
import type { AuthInfo } from '@modelcontextprotocol/server'
import { MAX_UPLOAD_BYTES } from '@/lib/s3'
import { TITLE_MAX_LENGTH, titleFromFileName } from '@/lib/title'
import { attachVersionWarning } from '@/lib/attach-plan'
import type { SimilarCandidate } from '@/lib/similar-document'
import type { ClassifyFolder, ClassifyResult } from '@/lib/classify'

/**
 * 올리기 도구 5개의 입력 스키마와 순수 직렬화·판정 함수. `mcp/tools.ts` 와 같은 층이다 —
 * DB·S3 접근은 없고 `mcp/server.ts` 가 접착만 한다.
 */

/** 토큰의 sub 를 도구가 쓰는 사용자로 옮긴다. 하나라도 없으면 null — 호출부는 isError. */
export type ToolViewer = { id: string; discordId: string; username: string }

export function viewerFromAuthInfo(authInfo: AuthInfo | undefined): ToolViewer | null {
  const extra = authInfo?.extra
  const userId = extra?.userId
  const discordId = extra?.discordId
  const username = extra?.username
  if (typeof userId !== 'string' || typeof discordId !== 'string' || typeof username !== 'string') {
    return null
  }
  return { id: userId, discordId, username }
}

export const findSimilarDocumentsInputSchema = z.object({
  fileName: z.string().min(1).max(255),
  // 없으면 미분류 → findSimilarDocuments 가 후보 없음으로 떨어뜨린다 (similar-document.ts:120).
  // null 도 받는다 — request_upload 의 suggestedFolder.folderId 가 분류 실패 시 null 이고,
  // 에이전트는 그 값을 그대로 넘긴다.
  folderId: z.string().nullish(),
})

export const requestUploadInputSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  // presign 은 content-length 를 서명하지 않는다 — 이 값은 **미리 거르는 용도**이고
  // 실제 상한 검사는 create_document·add_version 의 HeadObject 다 (upload-commit.ts).
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
})

export const createDocumentInputSchema = z.object({
  s3Key: z.string().min(1),
  keyToken: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  // 없으면 titleFromFileName 을 쓴다 (화면과 같은 규칙).
  title: z.string().min(1).max(TITLE_MAX_LENGTH).optional(),
  description: z.string().max(2000).optional(),
  // null 을 받는 이유는 findSimilarDocumentsInputSchema 와 같다.
  folderId: z.string().nullish(),
  ignoreSimilar: z.boolean().default(false),
})

export const addVersionInputSchema = z.object({
  documentId: z.string().min(1),
  s3Key: z.string().min(1),
  keyToken: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  changeNote: z.string().trim().max(500).optional(),
})

export const discardUploadInputSchema = z.object({
  s3Key: z.string().min(1),
  keyToken: z.string().min(1),
})

/** 후보 1건 = 문서 id + 그 문서의 현재 파일명 + 붙였을 때의 경고(없으면 null) */
export type SimilarMatch = {
  documentId: string
  latestFileName: string
  warning: { level: 'danger' | 'notice'; message: string } | null
}

export function toSimilarMatches(uploadFileName: string, candidates: SimilarCandidate[]): SimilarMatch[] {
  return candidates.map((candidate) => ({
    documentId: candidate.id,
    latestFileName: candidate.latestFileName,
    warning: attachVersionWarning(uploadFileName, candidate.latestFileName),
  }))
}

export type SuggestedFolder = { folderId: string | null; name: string | null; reason: string }

/** classifyFileName 의 결과를 도구 응답으로. 'match' 가 아니면 folderId 는 null 이다. */
export function toSuggestedFolder(result: ClassifyResult, folders: ClassifyFolder[]): SuggestedFolder {
  if (result.kind === 'match') {
    const folder = folders.find((f) => f.id === result.folderId)
    return { folderId: result.folderId, name: folder?.name ?? null, reason: result.reason }
  }
  if (result.kind === 'propose') {
    return {
      folderId: null,
      name: null,
      reason: `${result.reason} — '${result.proposedName}' 폴더는 없습니다. 폴더 생성은 화면에서 합니다.`,
    }
  }
  return { folderId: null, name: null, reason: result.reason }
}

/**
 * title 을 안 주면 화면과 같은 규칙으로 만들되 상한에서 자른다.
 * fileName 은 255자까지 허용이라 그대로 두면 화면(zod max)이 거부하는 제목이 저장된다.
 */
export function toolTitle(fileName: string, title: string | undefined): string {
  return title ?? titleFromFileName(fileName).slice(0, TITLE_MAX_LENGTH)
}

export const SIMILAR_CANDIDATES_EXIST = '비슷한 문서가 이미 있습니다. 기존 문서의 새 판인지 확인하세요.'

/**
 * 올리기 실패 응답. **s3Key 와 뒷정리 안내를 반드시 싣는다** — 화면 경로는 실패·취소 때
 * upload-flow.ts 가 항상 discard 를 쏘지만(`upload-flow.ts:88`) 도구 경로에는 그 자리가
 * 없다. 안 실으면 최대 100MB 객체가 S3 에 고아로 남는다.
 */
export function uploadFailure(error: string, s3Key: string, extra?: Record<string, unknown>) {
  return {
    error,
    s3Key,
    hint: `이 업로드를 계속하지 않으려면 discard_upload({ s3Key, keyToken }) 로 올라간 파일을 지우세요.`,
    ...extra,
  }
}

/** 후보가 있고 ignoreSimilar 가 아니면 거절 페이로드, 아니면 null. */
export function similarRejection(
  matches: SimilarMatch[],
  ignoreSimilar: boolean,
): { error: string; candidates: SimilarMatch[] } | null {
  if (matches.length === 0 || ignoreSimilar) return null
  return { error: SIMILAR_CANDIDATES_EXIST, candidates: matches }
}

export function toRequestUploadResult(args: {
  s3Key: string
  url: string
  keyToken: string
  contentType: string
  suggestedFolder: SuggestedFolder
}) {
  return {
    s3Key: args.s3Key,
    url: args.url,
    keyToken: args.keyToken,
    contentType: args.contentType,
    method: 'PUT' as const,
    expiresInSeconds: 300 as const,
    suggestedFolder: args.suggestedFolder,
    // presign 이 Content-Type 을 서명에서 제외하므로(unsignable header) 다르게 보내도
    // PUT 자체는 성공한다 — 그래서 "403" 이 아니라 "미리보기가 깨진다"로 안내한다.
    instructions: `이 URL 에 PUT 할 때 Content-Type 헤더를 반드시 "${args.contentType}" 로 그대로 보내세요. 다르게 보내도 업로드는 성공하지만, S3 에 저장되는 실제 타입이 문서에 기록된 mimeType 과 달라져 미리보기가 깨집니다.`,
  }
}
