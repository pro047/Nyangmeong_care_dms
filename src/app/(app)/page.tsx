import { FileText, Download } from 'lucide-react'
import { UploadDialog } from '@/components/upload-dialog'
import { DocumentRowActions } from '@/components/document-row-actions'
import { prisma } from '@/lib/prisma'
import { formatBytes, formatRelative, fileLabel } from '@/lib/format'
import { activeDocumentWhere } from '@/lib/trash'

export const dynamic = 'force-dynamic'

async function getDocuments() {
  return prisma.document.findMany({
    where: activeDocumentWhere(),
    orderBy: { updatedAt: 'desc' },
    include: {
      folder: { select: { name: true } },
      // 목록에는 최신 버전 정보만 필요하다.
      versions: {
        orderBy: { versionNo: 'desc' },
        take: 1,
        include: { uploadedBy: { select: { username: true } } },
      },
    },
  })
}

export default async function DocumentsPage() {
  const documents = await getDocuments()

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-ink">전체 문서</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {documents.length > 0 ? `${documents.length}개 문서` : '최근 수정순으로 표시됩니다'}
          </p>
        </div>
        <UploadDialog />
      </div>

      {documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface py-20 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-ink-subtle" aria-hidden />
          <p className="text-sm font-medium text-ink">아직 문서가 없습니다</p>
          <p className="mt-1 text-sm text-ink-muted">오른쪽 위 업로드 버튼으로 첫 문서를 올려보세요.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-ink-muted">
                <th scope="col" className="px-4 py-2.5 font-medium">문서</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">폴더</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">올린 사람</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">크기</th>
                <th scope="col" className="px-4 py-2.5 font-medium">수정</th>
                <th scope="col" className="w-12 px-4 py-2.5"><span className="sr-only">다운로드</span></th>
                <th scope="col" className="w-12 px-4 py-2.5"><span className="sr-only">삭제</span></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const latest = doc.versions[0]
                return (
                  <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-canvas">
                    <td className="max-w-0 px-4 py-3">
                      <a href={`/api/documents/${doc.id}/download`} className="flex items-center gap-2.5">
                        <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded bg-canvas text-[10px] font-bold text-ink-muted">
                          {latest ? fileLabel(latest.fileName) : '—'}
                        </span>
                        <span className="min-w-0">
                          <span className="truncate-cell block font-medium text-ink">{doc.title}</span>
                          {latest && latest.versionNo > 1 && (
                            <span className="text-xs text-ink-subtle">v{latest.versionNo}</span>
                          )}
                        </span>
                      </a>
                    </td>
                    <td className="hidden px-4 py-3 text-ink-muted md:table-cell">
                      {doc.folder?.name ?? '—'}
                    </td>
                    <td className="hidden px-4 py-3 text-ink-muted lg:table-cell">
                      {latest?.uploadedBy.username ?? '—'}
                    </td>
                    <td className="hidden px-4 py-3 whitespace-nowrap text-ink-muted sm:table-cell">
                      {latest ? formatBytes(latest.sizeBytes) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                      {formatRelative(doc.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/api/documents/${doc.id}/download`}
                        aria-label={`${doc.title} 다운로드`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-accent-soft hover:text-accent"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      {/* 상세 페이지가 아직 없어 삭제 진입점을 행에 둔다. M3에서 상세에도 붙인다. */}
                      <DocumentRowActions id={doc.id} title={doc.title} />
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
