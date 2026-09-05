import { FileText } from 'lucide-react'
import Link from 'next/link'
import { UploadDialog } from '@/components/upload-dialog'
import { DocumentTable } from '@/components/document-table'
import { FolderChildren } from '@/components/folder-children'
import { prisma } from '@/lib/prisma'
import { activeDocumentWhere } from '@/lib/trash'
import { folderFilterWhere, tagFilterWhere } from '@/lib/search'
import {
  childFolderCards,
  emptyListKind,
  folderBreadcrumb,
  folderSummaryLine,
} from '@/lib/folder'
import { pageErrorMessage } from '@/lib/page-error'
import type { Prisma } from '@/generated/prisma/client'

export const dynamic = 'force-dynamic'

async function getDocuments(where: Prisma.DocumentWhereInput) {
  return prisma.document.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      folder: { select: { name: true } },
      // 순서를 정해 두지 않으면 같은 문서의 칩 순서가 요청마다 흔들린다.
      tags: { include: { tag: true }, orderBy: { tag: { name: 'asc' } } },
      // 목록에는 최신 버전 정보만 필요하다.
      versions: {
        orderBy: { versionNo: 'desc' },
        take: 1,
        include: { uploadedBy: { select: { username: true } } },
      },
    },
  })
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[]
    folder?: string | string[]
    tag?: string | string[]
  }>
}) {
  // 다운로드 라우트가 내비게이션 404 를 여기로 돌려보낸다. 아는 코드만 문구가 된다.
  const { error, folder, tag } = await searchParams
  const errorMessage = pageErrorMessage(error)

  // 제목에 폴더 이름이 필요하고, 없는 폴더면 필터 자체를 걸지 않는다 — 죽은 링크가
  // 빈 화면이 아니라 전체 목록으로 떨어지는 쪽이 덜 놀랍다.
  const folderId = typeof folder === 'string' && folder !== '' ? folder : null

  // 업로드 모달의 셀렉트·자동 분류(aliases), 자식 폴더 카드(_count), 브레드크럼(parentId)이
  // 전부 이 한 조회에서 나온다. 폴더 이름만 따로 읽던 findUnique 를 없앤 이유가 그것이다 —
  // 어차피 표를 통째로 읽는데 왕복을 하나 더 쓸 이유가 없고, 함수 리전이 서울이라 그 한 번이
  // 95ms 다 (`HANDOFF.md` "배포 성능 실측").
  const folderRows = await prisma.folder.findMany({
    select: {
      id: true,
      name: true,
      parentId: true,
      aliases: true,
      // 휴지통 제외 조건은 목록·다운로드·삭제가 쓰는 것과 같은 함수에서 가져온다.
      _count: { select: { documents: { where: activeDocumentWhere() } } },
    },
  })

  // 카드가 행 모양을 모르게 Map 으로 넘긴다 — 카운트 조회 방식이 바뀌어도 순수 함수 쪽은
  // 그대로다.
  const documentCounts = new Map(folderRows.map((row) => [row.id, row._count.documents]))
  const activeFolder = folderId ? (folderRows.find((row) => row.id === folderId) ?? null) : null

  const documents = await getDocuments({
    AND: [
      activeDocumentWhere(),
      activeFolder ? folderFilterWhere(folder) : {},
      tagFilterWhere(tag),
    ],
  })

  const activeTag = typeof tag === 'string' && tag !== '' ? tag : null
  const filtered = activeFolder !== null || activeTag !== null

  const children = activeFolder
    ? childFolderCards(activeFolder.id, folderRows, documentCounts)
    : []
  const crumbs = activeFolder ? folderBreadcrumb(activeFolder.id, folderRows) : []
  const summary = folderSummaryLine(children.length, documents.length)
  const emptyKind = emptyListKind({ hasChildren: children.length > 0, filtered })

  const heading = activeTag ? `태그: ${activeTag}` : '전체 문서'

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          {crumbs.length > 0 ? (
            // 조상은 링크로 두되 제목은 마지막 세그먼트만 담는다 — 경로 전체를 h1 에 넣으면
            // 스크린리더가 읽는 제목이 길어진다.
            <nav aria-label="폴더 경로" className="flex min-w-0 flex-wrap items-center gap-1.5">
              {crumbs.slice(0, -1).map((crumb) => (
                <span key={crumb.id} className="flex items-center gap-1.5 text-sm text-ink-muted">
                  <Link
                    href={`/?folder=${encodeURIComponent(crumb.id)}`}
                    className="hover:text-ink"
                  >
                    {crumb.name}
                  </Link>
                  <span aria-hidden>›</span>
                </span>
              ))}
              <h1 className="truncate-cell text-xl font-semibold text-ink">
                {crumbs[crumbs.length - 1].name}
              </h1>
            </nav>
          ) : (
            <h1 className="text-xl font-semibold text-ink">{heading}</h1>
          )}
          <p className="mt-0.5 text-sm text-ink-muted">
            {summary ?? '최근 수정순으로 표시됩니다'}
          </p>
        </div>
        {/* 폴더를 열어 둔 채 업로드하면 그 폴더가 기본값이 된다. activeFolder 로 가드하는
            이유는 위에서 없는 폴더면 필터를 안 걸기 때문이다 — 죽은 링크에서 올린 문서가
            존재하지 않는 폴더를 참조해 FK 위반이 나면 안 된다. */}
        <UploadDialog defaultFolderId={activeFolder ? folderId : null} folders={folderRows} />
      </div>

      {errorMessage && (
        <p className="mb-5 rounded-lg border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {errorMessage}
        </p>
      )}

      {children.length > 0 && <FolderChildren cards={children} />}

      {documents.length > 0 ? (
        <DocumentTable documents={documents} />
      ) : emptyKind === 'children-only' ? (
        // 자식 폴더를 이미 그렸으니 점선 박스까지 띄우면 화면이 "비었다"로만 읽힌다.
        <p className="text-sm text-ink-muted">
          이 폴더에 직접 담긴 문서는 없습니다. 위 하위 폴더에서 찾아보세요.
        </p>
      ) : (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface py-20 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-ink-subtle" aria-hidden />
          {emptyKind === 'filtered' ? (
            <>
              <p className="text-sm font-medium text-ink">조건에 맞는 문서가 없습니다</p>
              <p className="mt-1 text-sm text-ink-muted">
                상세 페이지에서 문서의 폴더와 태그를 지정할 수 있습니다.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">아직 문서가 없습니다</p>
              <p className="mt-1 text-sm text-ink-muted">
                오른쪽 위 업로드 버튼으로 첫 문서를 올려보세요.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
