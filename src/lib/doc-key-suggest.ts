import type { PrismaClient } from '@/generated/prisma/client'
import { ENGINE_MAX_BYTES } from '@/lib/consistency-engine'
import { definedIdCounts, suggestDocKey } from '@/lib/consistency-engine/suggest'
import { DOC_KEY_FORBIDDEN } from '@/lib/doc-key-update'
import { isAdmin, type Viewer } from '@/lib/ownership'
import { ACTIVE_DOCUMENT_NOT_FOUND } from '@/lib/trash'

/**
 * 최신판 본문을 읽어 docKey 를 제안한다. **제안만 한다** — 다는 것은 관리자가 확인하고
 * `PUT …/doc-key` 로 한다. 버튼을 누를 때만 계산한다(S3 읽기 + 파싱이라 페이지마다 낼 비용이 아니다).
 */

export const SUGGEST_UNREADABLE = '파일을 읽지 못해 제안할 수 없습니다.'

export type SuggestDeps = {
  prisma: PrismaClient
  getObjectBytes: (key: string, maxBytes: number) => Promise<Uint8Array | null>
  adminDiscordId: string | undefined
}

export type SuggestOutcome =
  | { ok: true; suggested: string | null; counts: { key: string; count: number; registered: boolean }[] }
  | { ok: false; status: 403 | 404 | 422; error: string }

export async function suggestForDocument(documentId: string, viewer: Viewer, deps: SuggestDeps): Promise<SuggestOutcome> {
  if (!isAdmin(viewer, deps.adminDiscordId)) return { ok: false, status: 403, error: DOC_KEY_FORBIDDEN }

  const [latest, keys] = await Promise.all([
    deps.prisma.documentVersion.findFirst({
      where: { documentId, document: { deletedAt: null } },
      orderBy: { versionNo: 'desc' },
      select: { s3Key: true, fileName: true },
    }),
    deps.prisma.docKey.findMany({ select: { key: true } }),
  ])
  if (!latest) return { ok: false, status: 404, error: ACTIVE_DOCUMENT_NOT_FOUND }

  const bytes = await deps.getObjectBytes(latest.s3Key, ENGINE_MAX_BYTES)
  if (!bytes || bytes.byteLength > ENGINE_MAX_BYTES) return { ok: false, status: 422, error: SUGGEST_UNREADABLE }

  let counts
  try {
    counts = await definedIdCounts({ fileName: latest.fileName, bytes })
  } catch {
    return { ok: false, status: 422, error: SUGGEST_UNREADABLE }
  }
  const registered = new Set(keys.map((k) => k.key))
  return {
    ok: true,
    suggested: suggestDocKey(counts, registered),
    counts: counts.map((c) => ({ ...c, registered: registered.has(c.key) })),
  }
}
