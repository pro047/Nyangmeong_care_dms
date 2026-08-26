import { FileText } from 'lucide-react'
import { UploadDialog } from '@/components/upload-dialog'
import { DocumentTable } from '@/components/document-table'
import { prisma } from '@/lib/prisma'
import { activeDocumentWhere } from '@/lib/trash'
import { folderFilterWhere, tagFilterWhere } from '@/lib/search'
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

  // 업로드 모달이 쓰는 목록이다. 셀렉트 옵션과 자동 분류 둘 다 여기서 나오므로 aliases 까지
  // 읽는다. activeFolder 조회와 서로 의존하지 않으므로 같이 띄운다 — 순차로 두면 DB 왕복
  // 깊이가 하나 늘고, 함수 리전이 서울이라 그 한 번이 95ms 다 (`HANDOFF.md` "배포 성능 실측").
  const [activeFolder, folderRows] = await Promise.all([
    folderId
      ? prisma.folder.findUnique({ where: { id: folderId }, select: { name: true } })
      : Promise.resolve(null),
    prisma.folder.findMany({ select: { id: true, name: true, parentId: true, aliases: true } }),
  ])

  const documents = await getDocuments({
    AND: [
      activeDocumentWhere(),
      activeFolder ? folderFilterWhere(folder) : {},
      tagFilterWhere(tag),
    ],
  })

  const activeTag = typeof tag === 'string' && tag !== '' ? tag : null
  const filtered = activeFolder !== null || activeTag !== null
  const heading = activeFolder
    ? `폴더: ${activeFolder.name}`
    : activeTag
      ? `태그: ${activeTag}`
      : '전체 문서'

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-ink">{heading}</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {documents.length > 0 ? `${documents.length}개 문서` : '최근 수정순으로 표시됩니다'}
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

      {documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface py-20 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-ink-subtle" aria-hidden />
          {filtered ? (
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
      ) : (
        <DocumentTable documents={documents} />
      )}
    </div>
  )
}
