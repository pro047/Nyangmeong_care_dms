import { z } from 'zod'
import type { PrismaClient } from '@/generated/prisma/client'
import { canManageDocument, VERSION_FORBIDDEN, type Viewer } from '@/lib/ownership'
import { ACTIVE_DOCUMENT_NOT_FOUND, activeDocumentWhere } from '@/lib/trash'
import { S3_KEY_ALREADY_USED } from '@/lib/upload-guard'
import { MAX_UPLOAD_BYTES } from '@/lib/s3'
import { TITLE_MAX_LENGTH, retitleOnReupload } from '@/lib/title'
import {
  isMissingRelation,
  isS3KeyConflict,
  nextVersionNo,
  toChangeNote,
  versionCreateFailure,
  type VersionCreateInput,
} from '@/lib/version-create'

/**
 * 문서 생성 · 새 판 붙이기 · 업로드 폐기. `documents/route.ts`·`[id]/versions/route.ts`·
 * `uploads/discard/route.ts`(화면)와 MCP 올리기 도구(에이전트)가 이 세 함수를 공유한다.
 *
 * I/O 를 `deps` 로 주입받는 이유는 `mcp/server.ts` 와 같다 — 실제 DB·S3 없이
 * 순서와 분기를 테스트하기 위해서다.
 */

/** 올리는 사람. Viewer 에 알림용 username 을 더한 것. */
export type Uploader = Viewer & { username: string }

export type CommitDeps = {
  prisma: PrismaClient
  verifyUploadToken: (token: string, s3Key: string, userId: string) => Promise<{ s3Key: string } | null>
  headObjectSize: (key: string) => Promise<number | null>
  deleteObject: (key: string) => Promise<unknown>
  notifyUpload: (params: {
    documentId: string
    title: string
    versionNo: number
    fileName: string
    uploaderName: string
    changeNote?: string | null
  }) => Promise<void>
  /** `env.ADMIN_DISCORD_ID`. 비었으면 관리자 없음 (ownership.ts:29-31) */
  adminDiscordId: string | undefined
}

/**
 * 성공/실패를 상태 코드가 아니라 `ok` 로 가른다.
 * 라우트는 상태 코드를 그대로 쓰고, MCP 도구는 `ok` 만 보고 isError 를 정한다 —
 * 도구가 HTTP 코드를 해석하게 두면 두 소비자의 판정이 갈린다.
 */
export type CommitOutcome<T> =
  | { ok: true; status: 200 | 201; value: T }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string }

const UPLOAD_TOKEN_INVALID = '업로드 정보가 만료되었거나 올바르지 않습니다.'
const UPLOAD_OBJECT_NOT_FOUND = '업로드된 파일을 찾을 수 없습니다.'
const FOLDER_NOT_FOUND = '폴더를 찾을 수 없습니다. list_folders 로 확인한 folderId 를 쓰세요.'

function uploadTooLarge() {
  return `파일이 너무 큽니다. (최대 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)`
}

/** `documents/route.ts` 의 bodySchema 를 그대로 옮긴 것 */
export const documentCreateSchema = z.object({
  title: z.string().min(1).max(TITLE_MAX_LENGTH),
  description: z.string().max(2000).optional(),
  folderId: z.string().optional(),
  s3Key: z.string().min(1),
  keyToken: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
})
export type DocumentCreateInput = z.infer<typeof documentCreateSchema>

/** `uploads/discard/route.ts` 의 bodySchema 를 그대로 옮긴 것 */
export const discardUploadSchema = z.object({
  s3Key: z.string().min(1),
  keyToken: z.string().min(1),
})
export type DiscardUploadInput = z.infer<typeof discardUploadSchema>

/** `documents/route.ts:61-145` 와 한 단계도 다르지 않다 (알림 예외 처리만 감싸는 쪽으로 통일).
 *
 * `deleteObject` 는 안 쓴다 — 그건 `discardUpload` 전용이다. 여기서 요구하면
 * 문서 생성만 하는 호출부(`documents/route.ts`)가 안 쓰는 의존성까지 끌고 와야 한다. */
export async function createDocument(
  input: DocumentCreateInput,
  uploader: Uploader,
  deps: Omit<CommitDeps, 'deleteObject'>,
): Promise<CommitOutcome<{ id: string; title: string }>> {
  const { title, description, folderId, ...file } = input

  if (!(await deps.verifyUploadToken(file.keyToken, file.s3Key, uploader.id))) {
    return { ok: false, status: 400, error: UPLOAD_TOKEN_INVALID }
  }

  const reused = await deps.prisma.documentVersion.findFirst({
    where: { s3Key: file.s3Key },
    select: { id: true },
  })
  if (reused) {
    return { ok: false, status: 400, error: S3_KEY_ALREADY_USED }
  }

  const sizeBytes = await deps.headObjectSize(file.s3Key)
  if (sizeBytes === null) {
    return { ok: false, status: 400, error: UPLOAD_OBJECT_NOT_FOUND }
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 400, error: uploadTooLarge() }
  }

  let created: { id: string; title: string }
  try {
    created = await deps.prisma.document.create({
      data: {
        title,
        description,
        folderId,
        createdById: uploader.id,
        versions: {
          create: {
            versionNo: 1,
            s3Key: file.s3Key,
            fileName: file.fileName,
            mimeType: file.mimeType,
            sizeBytes,
            uploadedById: uploader.id,
          },
        },
      },
      select: { id: true, title: true },
    })
  } catch (err) {
    if (isS3KeyConflict(err)) {
      return { ok: false, status: 400, error: S3_KEY_ALREADY_USED }
    }
    // 없는 folderId 다. 500 으로 흘리면 호출자가 뒷정리할 실마리를 못 받는다.
    if (isMissingRelation(err)) {
      return { ok: false, status: 400, error: FOLDER_NOT_FOUND }
    }
    throw err
  }

  // 알림 실패가 이미 저장된 문서를 되돌리지 않는다. 도구 경로에서는 특히 —
  // 여기서 삼키지 않으면 "성공했는데 실패로 보이는 업로드"가 된다.
  try {
    await deps.notifyUpload({
      documentId: created.id,
      title: created.title,
      versionNo: 1,
      fileName: file.fileName,
      uploaderName: uploader.username,
    })
  } catch (err) {
    console.error('디스코드 알림 실패:', err)
  }

  return { ok: true, status: 201, value: created }
}

/** `[id]/versions/route.ts:26-142` 와 동일한 순서 — 소유자 검사가 맨 앞이다.
 *
 * `deleteObject` 는 안 쓴다 (createDocument 와 같은 이유). */
export async function addVersion(
  documentId: string,
  input: VersionCreateInput,
  uploader: Uploader,
  deps: Omit<CommitDeps, 'deleteObject'>,
): Promise<CommitOutcome<{ id: string; title: string; versionNo: number }>> {
  const owned = await deps.prisma.document.findUnique({
    where: { id: documentId },
    select: { createdById: true },
  })
  if (owned && !canManageDocument(uploader, owned, deps.adminDiscordId)) {
    return { ok: false, status: 403, error: VERSION_FORBIDDEN }
  }

  const { s3Key, keyToken, fileName, mimeType, changeNote } = input

  if (!(await deps.verifyUploadToken(keyToken, s3Key, uploader.id))) {
    return { ok: false, status: 400, error: UPLOAD_TOKEN_INVALID }
  }

  const reused = await deps.prisma.documentVersion.findFirst({
    where: { s3Key },
    select: { id: true },
  })
  if (reused) {
    return { ok: false, status: 400, error: S3_KEY_ALREADY_USED }
  }

  const sizeBytes = await deps.headObjectSize(s3Key)
  if (sizeBytes === null) {
    return { ok: false, status: 400, error: UPLOAD_OBJECT_NOT_FOUND }
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 400, error: uploadTooLarge() }
  }

  // fileName·title 도 같이 집는다 — 제목 판정용 쿼리를 따로 내지 않는다는 불변식 (CLAUDE.md).
  const latest = await deps.prisma.documentVersion.findFirst({
    where: { documentId, document: activeDocumentWhere() },
    orderBy: { versionNo: 'desc' },
    select: { versionNo: true, fileName: true, document: { select: { title: true } } },
  })
  if (!latest) {
    return { ok: false, status: 404, error: ACTIVE_DOCUMENT_NOT_FOUND }
  }

  const versionNo = nextVersionNo(latest.versionNo)
  const note = toChangeNote(changeNote)
  const nextTitle = retitleOnReupload(latest.document.title, latest.fileName, fileName)

  let updated: { id: string; title: string }
  try {
    updated = await deps.prisma.document.update({
      where: { id: documentId, deletedAt: null },
      data: {
        ...(nextTitle ? { title: nextTitle } : {}),
        versions: {
          create: {
            versionNo,
            s3Key,
            fileName,
            mimeType,
            sizeBytes,
            changeNote: note,
            uploadedById: uploader.id,
          },
        },
      },
      select: { id: true, title: true },
    })
  } catch (err) {
    const failure = versionCreateFailure(err)
    if (!failure) throw err
    return { ok: false, status: failure.status, error: failure.error }
  }

  try {
    await deps.notifyUpload({
      documentId: updated.id,
      title: updated.title,
      versionNo,
      fileName,
      uploaderName: uploader.username,
      changeNote: note,
    })
  } catch (err) {
    console.error('디스코드 알림 실패:', err)
  }

  return { ok: true, status: 201, value: { id: updated.id, title: updated.title, versionNo } }
}

/** `uploads/discard/route.ts:23-57` 와 동일한 순서.
 *
 * `headObjectSize` 는 안 쓴다 — 삭제 판정은 재사용 여부만 보고, 크기는 상관없다. */
export async function discardUpload(
  input: DiscardUploadInput,
  viewer: Viewer,
  deps: Omit<CommitDeps, 'headObjectSize'>,
): Promise<CommitOutcome<{ deleted: boolean }>> {
  const { s3Key, keyToken } = input

  if (!(await deps.verifyUploadToken(keyToken, s3Key, viewer.id))) {
    return { ok: false, status: 400, error: UPLOAD_TOKEN_INVALID }
  }

  const used = await deps.prisma.documentVersion.count({ where: { s3Key } })
  if (used > 0) {
    return { ok: true, status: 200, value: { deleted: false } }
  }

  try {
    await deps.deleteObject(s3Key)
  } catch (err) {
    console.error('업로드 정리: S3 객체 삭제 실패 (고아로 남음):', s3Key, err)
    return { ok: true, status: 200, value: { deleted: false } }
  }

  return { ok: true, status: 200, value: { deleted: true } }
}
