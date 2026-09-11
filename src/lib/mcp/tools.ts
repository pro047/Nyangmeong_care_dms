import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'

export const searchDocumentsInputSchema = z.object({
  q: z.string().max(100).optional(),
  folderId: z.string().optional(),
  tag: z.string().optional(),
  take: z.number().int().min(1).max(50).default(20),
})

export const listFoldersInputSchema = z.object({})

export const getDocumentInputSchema = z.object({
  id: z.string().min(1),
})

export const getDownloadUrlInputSchema = z.object({
  id: z.string().min(1),
  versionNo: z.number().int().min(1).optional(),
})

/** 정렬된 입력을 요구하지 않는다 — 조회 orderBy 가 바뀌어도 이 함수가 안 깨진다. */
function pickLatestVersion<V extends { versionNo: number }>(versions: V[]): V | null {
  if (versions.length === 0) return null
  return versions.reduce((best, version) => (version.versionNo > best.versionNo ? version : best))
}

export type DocumentSummaryRow = Prisma.DocumentGetPayload<{
  select: {
    id: true
    title: true
    description: true
    createdAt: true
    folder: { select: { id: true; name: true } }
    createdBy: { select: { username: true } }
    tags: { select: { tag: { select: { name: true } } } }
    versions: {
      select: {
        versionNo: true
        fileName: true
        mimeType: true
        sizeBytes: true
        createdAt: true
      }
    }
  }
}>

export function toDocumentSummary(row: DocumentSummaryRow) {
  const latest = pickLatestVersion(row.versions)
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    folder: row.folder ? { id: row.folder.id, name: row.folder.name } : null,
    latest: latest
      ? {
          versionNo: latest.versionNo,
          fileName: latest.fileName,
          mimeType: latest.mimeType,
          sizeBytes: latest.sizeBytes,
          createdAt: latest.createdAt,
        }
      : null,
    tags: row.tags.map((t) => t.tag.name),
    createdBy: row.createdBy.username,
    createdAt: row.createdAt,
  }
}

export type DocumentDetailRow = Prisma.DocumentGetPayload<{
  select: {
    id: true
    title: true
    description: true
    createdAt: true
    updatedAt: true
    folder: { select: { id: true; name: true } }
    createdBy: { select: { username: true } }
    tags: { select: { tag: { select: { name: true } } } }
    versions: {
      select: {
        versionNo: true
        fileName: true
        mimeType: true
        sizeBytes: true
        changeNote: true
        createdAt: true
        uploadedBy: { select: { username: true } }
      }
    }
  }
}>

export function toDocumentDetail(row: DocumentDetailRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    folder: row.folder ? { id: row.folder.id, name: row.folder.name } : null,
    tags: row.tags.map((t) => t.tag.name),
    createdBy: row.createdBy.username,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    versions: [...row.versions]
      .sort((a, b) => b.versionNo - a.versionNo)
      .map((version) => ({
        versionNo: version.versionNo,
        fileName: version.fileName,
        mimeType: version.mimeType,
        sizeBytes: version.sizeBytes,
        changeNote: version.changeNote,
        uploadedBy: version.uploadedBy.username,
        createdAt: version.createdAt,
      })),
  }
}

export type FolderCountRow = {
  id: string
  name: string
  parentId: string | null
  _count: { documents: number }
}

export function toFolderRow(row: FolderCountRow) {
  return { id: row.id, name: row.name, parentId: row.parentId, documentCount: row._count.documents }
}

export type DownloadVersion = {
  versionNo: number
  fileName: string
  mimeType: string
  sizeBytes: number
}

export function toDownloadResult(version: DownloadVersion, url: string) {
  return {
    url,
    fileName: version.fileName,
    mimeType: version.mimeType,
    sizeBytes: version.sizeBytes,
    expiresInSeconds: 300,
    versionNo: version.versionNo,
  }
}
