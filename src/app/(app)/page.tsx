import { FileText } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { UploadDialog } from '@/components/upload-dialog'
import { DocumentTable } from '@/components/document-table'
import { ConsistencyPanel } from '@/components/consistency-panel'
import { measuredAgo } from '@/lib/consistency-view'
import { formatDateTime } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { activeDocumentWhere } from '@/lib/trash'
import { folderFilterWhere, tagFilterWhere } from '@/lib/search'
import {
  childFolderCards,
  emptyListKind,
  folderBreadcrumb,
  folderSummaryLine,
} from '@/lib/folder'
import {
  documentListOrderBy,
  latestCandidateQuery,
  supersededDocumentIds,
} from '@/lib/latest'
import { pageErrorMessage } from '@/lib/page-error'
import { similarCandidateQuery, toSimilarCandidates } from '@/lib/similar-document'
import { getSession } from '@/lib/session'
import { deletePermission } from '@/lib/ownership'
import { env } from '@/lib/env'
import type { Prisma } from '@/generated/prisma/client'

export const dynamic = 'force-dynamic'

async function getDocuments(where: Prisma.DocumentWhereInput) {
  return prisma.document.findMany({
    where,
    orderBy: documentListOrderBy(),
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

/**
 * 최신 측정 1건. **`measuredAt` 으로 고른다 — `createdAt` 이 아니다.** 전송 시각과 측정
 * 시각은 다르고, 저쪽이 오래된 측정을 뒤늦게 보내면 순서가 뒤집힌다.
 *
 * `findings` 149행이 그대로 HTML 에 실린다. 필터를 클라이언트에서 하기 때문인데, 여기가
 * 메인이라 searchParams 로 거르면 필터 한 번에 문서 목록까지 전부 다시 조회된다.
 */
async function latestConsistencySnapshot() {
  return prisma.consistencySnapshot.findFirst({
    orderBy: { measuredAt: 'desc' },
    include: {
      // **셋 다 orderBy 를 건다.** `ORDER BY` 가 없으면 순서는 실행계획에 달린다 —
      // 지금은 행이 적어 Seq Scan 이라 삽입 순서로 나오지만, 스냅샷이 쌓이면 플래너가
      // `@@index([snapshotId, level])` 을 타서 **등급별로 묶여** 나온다. 그러면 저쪽
      // 보고서와 대조가 안 되고 새로고침마다 순서가 흔들릴 수 있다.
      //
      // `id` 로 거는 이유: cuid 는 시각 접두사라 한 번의 중첩 create 안에서 삽입 순으로
      // 정렬된다(실측). 축 순서는 의미가 있어 axis 로 따로 건다 — 저쪽이 보낸 순서와 같다.
      metrics: { orderBy: [{ axis: 'asc' }, { fromKind: 'asc' }, { toKind: 'asc' }] },
      findings: { orderBy: { id: 'asc' } },
      docs: { orderBy: { key: 'asc' } },
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
  // 레이아웃도 같은 검사를 하지만 여기서 또 본다 — 삭제 버튼 표시에 세션이 필요하고,
  // 없을 때 빈 permission 으로 그리면 "내 문서인데 버튼이 없다"가 된다.
  const session = await getSession()
  if (!session) redirect('/login')
  const permission = deletePermission(session, env.ADMIN_DISCORD_ID)

  // 다운로드 라우트가 내비게이션 404 를 여기로 돌려보낸다. 아는 코드만 문구가 된다.
  const { error, folder, tag } = await searchParams
  const errorMessage = pageErrorMessage(error)

  // 제목에 폴더 이름이 필요하고, 없는 폴더면 필터 자체를 걸지 않는다 — 죽은 링크가
  // 빈 화면이 아니라 전체 목록으로 떨어지는 쪽이 덜 놀랍다.
  const folderId = typeof folder === 'string' && folder !== '' ? folder : null

  // 업로드 모달의 셀렉트·자동 분류(aliases), 자식 폴더 행(_count), 브레드크럼(parentId)이
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

  // 순수 함수가 조회 행의 모양을 모르게 Map 으로 넘긴다 — 카운트 조회 방식이 바뀌어도
  // 그쪽은 안 깨진다.
  const documentCounts = new Map(folderRows.map((row) => [row.id, row._count.documents]))
  const activeFolder = folderId ? (folderRows.find((row) => row.id === folderId) ?? null) : null

  // 구버전 판정은 화면에 그릴 집합과 따로 읽는다(latest.ts 참고). 목록 조회와 서로
  // 기다릴 이유가 없어 같이 보낸다 — 함수 리전이 서울이라 왕복 하나가 95ms 다.
  // 붙이기 후보도 같이 읽는다. 업로드 모달이 파일을 담는 순간 판정해야 하는데, 그 시점에
  // 왕복을 하나 내면 사람이 기다린다 — 활성 25건이라 페이로드는 무시할 수 있다.
  // **필터와 무관하게 전량을 내린다.** 폴더를 열어 둬도 다른 폴더 문서의 파일명이 HTML 에
  // 실린다는 뜻인데, 조회는 전원 동등이고 createdById 는 이미 표에 내려가 있어 새 노출이
  // 아니다. 후보를 화면에 그린 집합에서 뽑으면 필터가 좁힌 만큼 판정이 빠진다.
  // 구버전 판정(latestCandidateQuery)과 조회를 합치지 않는 이유는 latest.ts 주석에 있다:
  // 두 판정이 한 조회를 공유하면 한쪽 요구로 컬럼을 고칠 때 다른 쪽이 조용히 따라 바뀐다.
  // 정합성 스냅샷도 같이 읽는다. 측정이 한 번도 안 왔으면 null 이고 그때는 아무것도 안 그린다 —
  // 빈 상자를 띄우면 "지표가 0" 으로 읽힌다.
  const [documents, latestRows, similarRows, snapshot, activeRows] = await Promise.all([
    getDocuments({
      AND: [
        activeDocumentWhere(),
        activeFolder ? folderFilterWhere(folder) : {},
        tagFilterWhere(tag),
      ],
    }),
    prisma.document.findMany(latestCandidateQuery()),
    prisma.document.findMany(similarCandidateQuery()),
    latestConsistencySnapshot(),
    // 링크를 걸 수 있는지 판정할 집합. dmsId 에 FK 가 없어 사라진 문서가 섞여 있다.
    // **`latestCandidateQuery()` 를 재사용하지 않는다** — 그쪽은 폴더 기반 구버전 판정용이고
    // `latest.ts` 가 "두 판정이 한 조회를 공유하면 한쪽 요구로 컬럼을 고칠 때 다른 쪽이
    // 조용히 따라 바뀐다"고 못박아 뒀다. 실제로 그 조회에 `folderId: { not: null }` 을
    // 더하는 것이 당연한 다음 수인데, 공유했다면 미분류 문서의 링크가 말없이 사라진다.
    prisma.document.findMany({ where: activeDocumentWhere(), select: { id: true } }),
  ])
  const supersededIds = supersededDocumentIds(latestRows)
  const activeDocumentIds = new Set(activeRows.map((row) => row.id))

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
            // 스크린리더가 읽는 제목이 길어진다. 경로는 한 줄로 읽혀야 하므로 크기를 섞지
            // 않고 굵기·색으로만 현재 위치를 구분한다.
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
              <h1 className="truncate-cell text-sm font-semibold text-ink">
                {crumbs[crumbs.length - 1].name}
              </h1>
            </nav>
          ) : (
            <h1 className="text-sm font-semibold text-ink">{heading}</h1>
          )}
          <p className="mt-0.5 text-sm text-ink-muted">
            {summary ?? '최근 올린 순으로 표시됩니다'}
          </p>
        </div>
        {/* 폴더를 열어 둔 채 업로드하면 그 폴더가 기본값이 된다. activeFolder 로 가드하는
            이유는 위에서 없는 폴더면 필터를 안 걸기 때문이다 — 죽은 링크에서 올린 문서가
            존재하지 않는 폴더를 참조해 FK 위반이 나면 안 된다. */}
        <UploadDialog
          defaultFolderId={activeFolder ? folderId : null}
          folders={folderRows}
          candidates={toSimilarCandidates(similarRows)}
          permission={permission}
        />
      </div>

      {errorMessage && (
        <p className="mb-5 rounded-lg border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {errorMessage}
        </p>
      )}

      {/* 필터를 걸어도 그대로 둔다 — 측정은 폴더·태그와 무관하게 전체 문서를 본 결과라
          목록이 좁아졌다고 지표를 감추면 숫자가 그 폴더 것으로 읽힌다. */}
      {snapshot && (
        <ConsistencyPanel
          snapshot={{
            ...snapshot,
            // 시각 포매팅은 서버에서 끝낸다 — 패널이 클라이언트라 여기서 안 하면
            // 하이드레이션에서 TZ 와 Date.now() 가 갈린다.
            measuredLabel: formatDateTime(snapshot.measuredAt),
            agoLabel: measuredAgo(snapshot.measuredAt, new Date()),
          }}
          activeDocumentIds={activeDocumentIds}
        />
      )}

      {/* 문서가 없어도 자식 폴더가 있으면 표를 그린다 — 자식이 있는데 점선 박스를 띄우면
          카테고리를 열었을 때 빈 화면이 나오던 그 증상 그대로다. */}
      {documents.length > 0 || emptyKind === 'children-only' ? (
        <DocumentTable
          documents={documents}
          folders={children}
          supersededIds={supersededIds}
          permission={permission}
        />
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
