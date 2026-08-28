import { Search } from 'lucide-react'
import { DocumentTable } from '@/components/document-table'
import { prisma } from '@/lib/prisma'
import { activeDocumentWhere } from '@/lib/trash'
import { documentSearchWhere, normalizeSearchQuery } from '@/lib/search'

export const dynamic = 'force-dynamic'

async function searchDocuments(q: string) {
  return prisma.document.findMany({
    where: { AND: [activeDocumentWhere(), documentSearchWhere(q)] },
    orderBy: { updatedAt: 'desc' },
    include: {
      folder: { select: { name: true } },
      tags: { include: { tag: true }, orderBy: { tag: { name: 'asc' } } },
      versions: {
        orderBy: { versionNo: 'desc' },
        take: 1,
        include: { uploadedBy: { select: { username: true } } },
      },
    },
  })
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const { q: raw } = await searchParams
  const q = normalizeSearchQuery(raw)

  // 헤더 폼을 빈 칸으로 제출하면 여기로 온다. 500 대신 안내를 띄운다.
  if (q === null) {
    return (
      <div>
        <h1 className="mb-5 text-xl font-semibold text-ink">검색</h1>
        <div className="rounded-xl border border-dashed border-border-strong bg-surface py-20 text-center">
          <Search className="mx-auto mb-3 h-8 w-8 text-ink-subtle" aria-hidden />
          <p className="text-sm font-medium text-ink">검색어를 입력하세요</p>
          <p className="mt-1 text-sm text-ink-muted">제목·설명·태그에서 찾습니다.</p>
        </div>
      </div>
    )
  }

  const documents = await searchDocuments(q)

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-ink">‘{q}’ 검색 결과</h1>
        <p className="mt-0.5 text-sm text-ink-muted">{documents.length}건</p>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface py-20 text-center">
          <Search className="mx-auto mb-3 h-8 w-8 text-ink-subtle" aria-hidden />
          <p className="text-sm font-medium text-ink">검색 결과가 없습니다</p>
          <p className="mt-1 text-sm text-ink-muted">제목·설명·태그에서만 찾습니다.</p>
        </div>
      ) : (
        <DocumentTable documents={documents} />
      )}
    </div>
  )
}
