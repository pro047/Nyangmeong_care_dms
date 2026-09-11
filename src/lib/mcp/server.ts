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
import type { presignDownload as presignDownloadFn } from '@/lib/s3'
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

type Deps = {
  prisma: PrismaClient
  presignDownload: typeof presignDownloadFn
}

/**
 * 1단계 도구 4개는 전원 동등(CLAUDE.md) — 사용자별 권한 분기가 없다.
 * `deps.prisma`·`deps.presignDownload` 를 주입받는 이유는 테스트에서 실제 DB·S3 없이
 * 순수 함수(tools.ts)만 검증하기 위해서다(이 파일 자체는 접착만 한다).
 */
export function registerDmsTools(server: McpServer, deps: Deps) {
  const { prisma, presignDownload } = deps

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
}
