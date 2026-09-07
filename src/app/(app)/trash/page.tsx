import { Trash2 } from 'lucide-react'
import { redirect } from 'next/navigation'
import { TrashRowActions } from '@/components/trash-row-actions'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { trashOwnerWhere, type Viewer } from '@/lib/ownership'
import { env } from '@/lib/env'
import { formatBytes, formatRelative, fileLabel } from '@/lib/format'
import { trashedDocumentWhere, trashOrderBy } from '@/lib/trash'

export const dynamic = 'force-dynamic'

/**
 * 내가 올린 문서만 보여준다 — 복구·영구삭제가 소유자 전용이 된 뒤로 남의 행은 손댈 수
 * 없는 노이즈다. 조건은 "지운 사람"이 아니라 "소유자"라, 권한이 없던 시절에 남이 지운
 * 내 문서도 여기 남는다. 관리자는 전체를 본다.
 */
async function getTrashedDocuments(viewer: Viewer) {
  return prisma.document.findMany({
    where: { ...trashedDocumentWhere(), ...trashOwnerWhere(viewer, env.ADMIN_DISCORD_ID) },
    orderBy: trashOrderBy(),
    include: {
      versions: {
        orderBy: { versionNo: 'desc' },
        take: 1,
      },
    },
  })
}

export default async function TrashPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const documents = await getTrashedDocuments(session)

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-ink">휴지통</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          {documents.length > 0
            ? `${documents.length}개 문서 · 복구하면 전체 문서로 돌아갑니다`
            : '삭제한 문서는 여기에 보관됩니다'}
        </p>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface py-20 text-center">
          <Trash2 className="mx-auto mb-3 h-8 w-8 text-ink-subtle" aria-hidden />
          <p className="text-sm font-medium text-ink">휴지통이 비어 있습니다</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-ink-muted">
                <th scope="col" className="px-4 py-2.5 font-medium">문서</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">크기</th>
                <th scope="col" className="px-4 py-2.5 font-medium">삭제</th>
                {/* 폭을 고정하지 않는다. 아이콘 전용 열(전체 문서의 w-12)과 달리 여기는
                    텍스트 버튼이 둘이라, 좁게 잡으면 한국어가 글자 단위로 줄바꿈된다. */}
                <th scope="col" className="px-4 py-2.5"><span className="sr-only">복구</span></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const latest = doc.versions[0]
                return (
                  <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-canvas">
                    {/* 다운로드 라우트가 휴지통 문서를 404로 막으므로 제목에 링크를 걸지 않는다. */}
                    <td className="max-w-0 px-4 py-3">
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded bg-canvas text-xs font-semibold text-ink-muted">
                          {latest ? fileLabel(latest.fileName) : '—'}
                        </span>
                        <span className="truncate-cell block min-w-0 font-medium text-ink">
                          {doc.title}
                        </span>
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 whitespace-nowrap text-ink-muted sm:table-cell">
                      {latest ? formatBytes(latest.sizeBytes) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                      {doc.deletedAt ? formatRelative(doc.deletedAt) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <TrashRowActions id={doc.id} title={doc.title} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
