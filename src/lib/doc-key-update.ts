import { z } from 'zod'
import type { PrismaClient } from '@/generated/prisma/client'
import { DOC_KEY_RE } from '@/lib/doc-key'
import { isAdmin, type Viewer } from '@/lib/ownership'
import { ACTIVE_DOCUMENT_NOT_FOUND } from '@/lib/trash'

/**
 * docKey 달기 · 옮기기 · 떼기. **`ADMIN_DISCORD_ID` 만** 한다(2026-09-27 결정, CLAUDE.md 예외) —
 * docKey 는 "어느 문서가 측정의 정본인가" 라서 문서 소유가 아니라 프로젝트 판단이다.
 * 올린 사람도 못 한다.
 *
 * 바뀌면 다음 측정 결과가 바로 달라지므로 측정을 예약한다(떼는 것도 같다).
 */

export const DOC_KEY_FORBIDDEN = '관리자만 docKey 를 바꿀 수 있습니다.'
export const DOC_KEY_TAKEN = '이 docKey 는 이미 다른 문서에 달려 있습니다.'
export const DOC_KEY_UNKNOWN = '등록되지 않은 docKey 입니다.'

export const docKeyPutSchema = z.object({
  docKey: z.string().regex(DOC_KEY_RE, 'docKey 는 REQ · SCR-XXX · FN-XXX 모양이어야 합니다').nullable(),
  // 다른 문서가 쓰는 키를 가져올 때만 true. 없으면 409 로 멈춘다 — 조용히 옮기면
  // 그 문서가 측정에서 빠진 것을 아무도 모른다.
  move: z.boolean().optional(),
})
export type DocKeyPutInput = z.infer<typeof docKeyPutSchema>

export type DocKeyDeps = {
  prisma: PrismaClient
  adminDiscordId: string | undefined
  scheduleMeasure: () => void
}

export type DocKeyOutcome =
  | { ok: true; docKey: string | null; movedFrom: string | null }
  | { ok: false; status: 400 | 403 | 404; error: string }
  | { ok: false; status: 409; error: string; holder?: { id: string; title: string } }

export async function updateDocKey(
  documentId: string,
  input: DocKeyPutInput,
  viewer: Viewer,
  deps: DocKeyDeps,
): Promise<DocKeyOutcome> {
  if (!isAdmin(viewer, deps.adminDiscordId)) return { ok: false, status: 403, error: DOC_KEY_FORBIDDEN }

  const target = await deps.prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    select: { id: true, docKey: true },
  })
  if (!target) return { ok: false, status: 404, error: ACTIVE_DOCUMENT_NOT_FOUND }

  const { docKey, move } = input
  if (target.docKey === docKey) return { ok: true, docKey, movedFrom: null }

  const holder = docKey
    ? await deps.prisma.document.findFirst({
        where: { docKey, id: { not: documentId } },
        select: { id: true, title: true },
      })
    : null
  if (holder && !move) return { ok: false, status: 409, error: DOC_KEY_TAKEN, holder }

  try {
    await deps.prisma.$transaction([
      ...(holder ? [deps.prisma.document.update({ where: { id: holder.id }, data: { docKey: null } })] : []),
      deps.prisma.document.update({ where: { id: documentId }, data: { docKey } }),
    ])
  } catch (err) {
    // 조회와 쓰기 사이에 누가 같은 키를 달았다. 유일 제약이 막았으니 다시 보게 한다
    if (errorCode(err) === 'P2002') return { ok: false, status: 409, error: DOC_KEY_TAKEN }
    // 외래키 — `doc_keys` 에 없는 키다. 키는 관리자가 요청할 때 스크립트로만 늘어난다
    if (errorCode(err) === 'P2003') return { ok: false, status: 400, error: DOC_KEY_UNKNOWN }
    throw err
  }

  try {
    deps.scheduleMeasure()
  } catch (err) {
    console.error('정합성 측정 예약 실패:', err)
  }
  return { ok: true, docKey, movedFrom: holder?.id ?? null }
}

function errorCode(err: unknown): unknown {
  return typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined
}
