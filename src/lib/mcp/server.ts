import type { McpServer } from '@modelcontextprotocol/server'
import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import { activeDocumentWhere } from '@/lib/trash'
import { documentListOrderBy } from '@/lib/latest'
import {
  documentSearchWhere,
  folderFilterWhere,
  normalizeSearchQuery,
  tagFilterWhere,
} from '@/lib/search'
import { ACTIVE_DOCUMENT_NOT_FOUND } from '@/lib/trash'
import type {
  presignDownload as presignDownloadFn,
  presignUpload as presignUploadFn,
  buildS3Key as buildS3KeyFn,
  getObjectBytes as getObjectBytesFn,
} from '@/lib/s3'
import type { signUploadToken as signUploadTokenFn } from '@/lib/upload-token'
import { classifyFileName } from '@/lib/classify'
import { deletePermission, type Viewer } from '@/lib/ownership'
import { similarCandidateQuery, toSimilarCandidates, findSimilarDocuments } from '@/lib/similar-document'
import type {
  CommitOutcome,
  DocumentCreateInput,
  DiscardUploadInput,
  Uploader,
} from '@/lib/upload-commit'
import type { VersionCreateInput } from '@/lib/version-create'
import {
  searchDocumentsInputSchema,
  listFoldersInputSchema,
  getDocumentInputSchema,
  getDownloadUrlInputSchema,
  toDocumentSummary,
  toDocumentDetail,
  toFolderRow,
  toDownloadResult,
} from './tools'
import {
  viewerFromAuthInfo,
  findSimilarDocumentsInputSchema,
  requestUploadInputSchema,
  createDocumentInputSchema,
  addVersionInputSchema,
  discardUploadInputSchema,
  toSimilarMatches,
  toSuggestedFolder,
  similarRejection,
  toRequestUploadResult,
  toolTitle,
  uploadFailure,
} from './upload-tools'
import {
  readDocumentInputSchema,
  readVersionQuery,
  readDocumentContent,
} from './read-tools'
import { parseXlsx } from './xlsx-text'

type Deps = {
  prisma: PrismaClient
  presignDownload: typeof presignDownloadFn
  // ↓ 2단계에서 추가
  presignUpload: typeof presignUploadFn
  buildS3Key: typeof buildS3KeyFn
  signUploadToken: typeof signUploadTokenFn
  adminDiscordId: string | undefined
  // ↓ 3단계에서 추가
  getObjectBytes: typeof getObjectBytesFn
  /** upload-commit 의 세 함수를 CommitDeps 로 미리 묶어 넘긴다 — 도구 테스트가
      커밋 계층(prisma·S3 목)까지 끌고 오지 않게 하려는 것이다. */
  commit: {
    createDocument: (
      i: DocumentCreateInput,
      u: Uploader,
    ) => Promise<CommitOutcome<{ id: string; title: string }>>
    addVersion: (
      documentId: string,
      i: VersionCreateInput,
      u: Uploader,
    ) => Promise<CommitOutcome<{ id: string; title: string; versionNo: number }>>
    discardUpload: (i: DiscardUploadInput, v: Viewer) => Promise<CommitOutcome<{ deleted: boolean }>>
  }
}

const AUTH_INFO_MISSING = '인증 정보를 읽을 수 없습니다.'

function authRequiredError() {
  return { content: [{ type: 'text' as const, text: AUTH_INFO_MISSING }], isError: true as const }
}

/**
 * 1단계 도구 4개와 3단계 `read_document` 는 전원 동등(CLAUDE.md) — 사용자별 권한
 * 분기가 없다. 2단계 도구 5개는 액세스 토큰의 sub 를 올린 사람으로 쓴다(§올리기 도구,
 * 삭제·재업로드 예외).
 * `deps.prisma`·`deps.presignDownload` 등을 주입받는 이유는 테스트에서 실제 DB·S3 없이
 * 순수 함수(tools.ts·upload-tools.ts·read-tools.ts)만 검증하기 위해서다(이 파일 자체는
 * 접착만 한다).
 */
export function registerDmsTools(server: McpServer, deps: Deps) {
  const {
    prisma,
    presignDownload,
    presignUpload,
    buildS3Key,
    signUploadToken,
    adminDiscordId,
    commit,
    getObjectBytes,
  } = deps

  server.registerTool(
    'search_documents',
    {
      title: '문서 검색',
      description: '제목·설명·태그로 검색하고 폴더·태그로 좁힌다. 휴지통 문서는 제외한다.',
      inputSchema: searchDocumentsInputSchema,
    },
    async ({ q, folderId, tag, take }) => {
      const wheres: Prisma.DocumentWhereInput[] = [
        activeDocumentWhere(),
        folderFilterWhere(folderId),
        tagFilterWhere(tag),
      ]

      const normalizedQ = normalizeSearchQuery(q)
      if (normalizedQ !== null) wheres.push(documentSearchWhere(normalizedQ))

      const rows = await prisma.document.findMany({
        where: { AND: wheres },
        orderBy: documentListOrderBy(),
        take,
        select: {
          id: true,
          title: true,
          description: true,
          createdAt: true,
          folder: { select: { id: true, name: true } },
          createdBy: { select: { username: true } },
          tags: { select: { tag: { select: { name: true } } } },
          versions: {
            select: {
              versionNo: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
              createdAt: true,
            },
          },
        },
      })

      const documents = rows.map(toDocumentSummary)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ documents }) }],
        structuredContent: { documents },
      }
    },
  )

  server.registerTool(
    'list_folders',
    {
      title: '폴더 목록',
      description: '전체 폴더를 평면 배열로 돌려준다. 트리는 parentId 로 클라이언트가 조립한다.',
      inputSchema: listFoldersInputSchema,
    },
    async () => {
      const rows = await prisma.folder.findMany({
        select: {
          id: true,
          name: true,
          parentId: true,
          _count: { select: { documents: { where: activeDocumentWhere() } } },
        },
      })

      const folders = rows.map(toFolderRow)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ folders }) }],
        structuredContent: { folders },
      }
    },
  )

  server.registerTool(
    'get_document',
    {
      title: '문서 상세',
      description: '문서 메타데이터와 전체 버전 이력(최신 우선)을 돌려준다.',
      inputSchema: getDocumentInputSchema,
    },
    async ({ id }) => {
      const row = await prisma.document.findFirst({
        where: { id, ...activeDocumentWhere() },
        select: {
          id: true,
          title: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          folder: { select: { id: true, name: true } },
          createdBy: { select: { username: true } },
          tags: { select: { tag: { select: { name: true } } } },
          versions: {
            select: {
              versionNo: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
              changeNote: true,
              createdAt: true,
              uploadedBy: { select: { username: true } },
            },
          },
        },
      })

      if (!row) {
        return { content: [{ type: 'text' as const, text: ACTIVE_DOCUMENT_NOT_FOUND }], isError: true }
      }

      const detail = toDocumentDetail(row)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(detail) }],
        structuredContent: detail,
      }
    },
  )

  server.registerTool(
    'get_download_url',
    {
      title: '다운로드 URL 발급',
      description: '문서(버전)의 5분짜리 presigned 다운로드 URL을 돌려준다. 파일은 서버를 거치지 않는다.',
      inputSchema: getDownloadUrlInputSchema,
    },
    async ({ id, versionNo }) => {
      const document = await prisma.document.findFirst({
        where: { id, ...activeDocumentWhere() },
        select: {
          versions:
            versionNo === undefined
              ? {
                  orderBy: { versionNo: 'desc' },
                  take: 1,
                  select: { versionNo: true, fileName: true, mimeType: true, sizeBytes: true, s3Key: true },
                }
              : {
                  where: { versionNo },
                  select: { versionNo: true, fileName: true, mimeType: true, sizeBytes: true, s3Key: true },
                },
        },
      })

      const version = document?.versions[0]
      if (!version) {
        return { content: [{ type: 'text' as const, text: ACTIVE_DOCUMENT_NOT_FOUND }], isError: true }
      }

      const url = await presignDownload(version.s3Key, version.fileName, false)
      const result = toDownloadResult(version, url)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result,
      }
    },
  )

  server.registerTool(
    'find_similar_documents',
    {
      title: '비슷한 문서 찾기',
      description:
        '올리려는 파일이 기존 문서의 새 판일 후보를 찾는다. folderId 가 없으면(미분류) 후보는 항상 없다.',
      inputSchema: findSimilarDocumentsInputSchema,
    },
    async ({ fileName, folderId }, ctx) => {
      const viewer = viewerFromAuthInfo(ctx.http?.authInfo)
      if (!viewer) return authRequiredError()

      // 미분류는 findSimilarDocuments 가 항상 빈 배열을 내므로 조회 자체를 안 한다
      // (커넥션 상한 5, similar-document.ts:120).
      if (folderId === undefined || folderId === null) {
        const result = { candidates: [] as ReturnType<typeof toSimilarMatches> }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        }
      }

      const rows = await prisma.document.findMany(similarCandidateQuery())
      const candidates = toSimilarCandidates(rows)
      const matched = findSimilarDocuments(fileName, folderId, candidates, deletePermission(viewer, adminDiscordId))
      const result = { candidates: toSimilarMatches(fileName, matched) }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result,
      }
    },
  )

  server.registerTool(
    'request_upload',
    {
      title: '업로드 URL 발급',
      description:
        '5분짜리 presigned PUT URL 과 keyToken, 자동 분류 제안을 돌려준다. 파일은 서버를 거치지 않는다.',
      inputSchema: requestUploadInputSchema,
    },
    async ({ fileName, contentType }, ctx) => {
      const viewer = viewerFromAuthInfo(ctx.http?.authInfo)
      if (!viewer) return authRequiredError()

      const folders = await prisma.folder.findMany({
        select: { id: true, name: true, parentId: true, aliases: true },
      })
      const suggestedFolder = toSuggestedFolder(classifyFileName(fileName, folders), folders)

      const s3Key = buildS3Key(fileName)
      const url = await presignUpload(s3Key, contentType)
      const keyToken = await signUploadToken(s3Key, viewer.id)

      const result = toRequestUploadResult({ s3Key, url, keyToken, contentType, suggestedFolder })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result,
      }
    },
  )

  server.registerTool(
    'create_document',
    {
      title: '문서 생성',
      description:
        '업로드한 파일로 새 문서(v1)를 만든다. folderId 에 비슷한 문서 후보가 있으면 ignoreSimilar 없이는 거절한다.',
      inputSchema: createDocumentInputSchema,
    },
    async ({ folderId, ignoreSimilar, title, ...file }, ctx) => {
      const viewer = viewerFromAuthInfo(ctx.http?.authInfo)
      if (!viewer) return authRequiredError()

      // request_upload 의 suggestedFolder.folderId 는 분류 실패 시 null 이다. 미분류와
      // 같은 뜻이므로 여기서 undefined 로 모은다 — 아래 분기와 prisma 가 한 모양만 본다.
      const folder = folderId ?? undefined

      // 화면 업로드는 후보를 보여주고 사람이 고르지만, 도구 경로에는 사람이 없다 —
      // 여기서 막지 않으면 붙이기 스트림이 닫은 문서 갈라짐(운영 7그룹)이 다시 열린다.
      // 토큰 검증(S3 왕복) 전에 거절해 헛수고를 없앤다.
      // ignoreSimilar 면 결과를 버릴 조회라 아예 내지 않는다 (커넥션 상한 5).
      if (folder !== undefined && !ignoreSimilar) {
        const rows = await prisma.document.findMany(similarCandidateQuery())
        const candidates = toSimilarCandidates(rows)
        const matched = findSimilarDocuments(file.fileName, folder, candidates, deletePermission(viewer, adminDiscordId))
        const rejection = similarRejection(toSimilarMatches(file.fileName, matched), ignoreSimilar)
        if (rejection) {
          const payload = uploadFailure(rejection.error, file.s3Key, { candidates: rejection.candidates })
          return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], isError: true }
        }
      }

      const outcome = await commit.createDocument(
        { ...file, folderId: folder, title: toolTitle(file.fileName, title) },
        viewer,
      )
      if (!outcome.ok) {
        const payload = uploadFailure(outcome.error, file.s3Key)
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], isError: true }
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(outcome.value) }],
        structuredContent: outcome.value,
      }
    },
  )

  server.registerTool(
    'add_version',
    {
      title: '새 버전 올리기',
      description: '기존 문서에 새 판을 붙인다. 올린 사람과 관리자만 할 수 있다.',
      inputSchema: addVersionInputSchema,
    },
    async ({ documentId, ...file }, ctx) => {
      const viewer = viewerFromAuthInfo(ctx.http?.authInfo)
      if (!viewer) return authRequiredError()

      const outcome = await commit.addVersion(documentId, file, viewer)
      if (!outcome.ok) {
        const payload = uploadFailure(outcome.error, file.s3Key)
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], isError: true }
      }
      const result = { id: outcome.value.id, versionNo: outcome.value.versionNo }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result,
      }
    },
  )

  server.registerTool(
    'discard_upload',
    {
      title: '업로드 취소',
      description: 'S3 에는 올라갔지만 문서가 되지 못한 객체를 지운다 (취소·생성 실패의 뒷정리).',
      inputSchema: discardUploadInputSchema,
    },
    async (input, ctx) => {
      const viewer = viewerFromAuthInfo(ctx.http?.authInfo)
      if (!viewer) return authRequiredError()

      const outcome = await commit.discardUpload(input, viewer)
      if (!outcome.ok) {
        return { content: [{ type: 'text' as const, text: outcome.error }], isError: true }
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(outcome.value) }],
        structuredContent: outcome.value,
      }
    },
  )

  server.registerTool(
    'read_document',
    {
      title: '문서 본문 읽기',
      description:
        '문서(버전)의 본문을 텍스트로 돌려준다. 읽을 수 있는 형식: html·md·csv·txt·xlsx, ' +
        '원본 1MB 이하. 본문이 길면 nextOffset 으로 이어 읽는다. 그 밖의 형식이거나 원본 ' +
        '파일 자체가 필요하면 get_download_url 을 쓴다.',
      inputSchema: readDocumentInputSchema,
    },
    async ({ id, versionNo, offset, limit, format }) => {
      const document = await prisma.document.findFirst(readVersionQuery(id, versionNo))
      const version = document?.versions[0]
      if (!version) {
        return { content: [{ type: 'text' as const, text: ACTIVE_DOCUMENT_NOT_FOUND }], isError: true }
      }

      const outcome = await readDocumentContent(
        { documentId: id, title: document.title, ...version },
        { offset, limit, format },
        { getObjectBytes, parseXlsx },
      )

      if (!outcome.ok) {
        return { content: [{ type: 'text' as const, text: JSON.stringify(outcome.failure) }], isError: true }
      }
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(outcome.meta) },
          { type: 'text' as const, text: outcome.chunk },
        ],
        structuredContent: outcome.meta,
      }
    },
  )
}
