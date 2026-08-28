import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Download } from 'lucide-react'
import { DocumentMetaEditor } from '@/components/document-meta-editor'
import { DocumentRowActions } from '@/components/document-row-actions'
import { DocumentFolderSelect } from '@/components/document-folder-select'
import { TagEditor } from '@/components/tag-editor'
import { SpreadsheetPreview } from '@/components/spreadsheet-preview'
import { VersionUploadDialog } from '@/components/version-upload-dialog'
import { prisma } from '@/lib/prisma'
import { formatBytes, formatDateTime, fileLabel } from '@/lib/format'
import { activeDocumentWhere } from '@/lib/trash'
import { buildFolderTree, flattenFolderTree } from '@/lib/folder'
import { previewKind } from '@/lib/preview'

export const dynamic = 'force-dynamic'

async function getDocument(id: string) {
  return prisma.document.findFirst({
    where: { id, ...activeDocumentWhere() },
    include: {
      folder: { select: { name: true } },
      createdBy: { select: { username: true } },
      tags: { include: { tag: true }, orderBy: { tag: { name: 'asc' } } },
      // 타임라인은 전 버전을 보여준다. 최신은 versions[0] 이다 (versionNo desc).
      versions: {
        orderBy: { versionNo: 'desc' },
        include: { uploadedBy: { select: { username: true } } },
      },
    },
  })
}

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // 폴더 목록은 이동 셀렉트의 선택지다. 문서 조회와 서로 기다릴 이유가 없다.
  const [document, folders] = await Promise.all([
    getDocument(id),
    prisma.folder.findMany({ select: { id: true, name: true, parentId: true } }),
  ])
  // 휴지통 문서도 여기로 온다. 보여줘 봐야 다운로드가 전부 404라 깨진 페이지가 된다.
  if (!document) notFound()

  const latest = document.versions[0]
  const folderOptions = flattenFolderTree(buildFolderTree(folders))
  const kind = latest ? previewKind(latest.mimeType) : 'none'
  // versionNo 를 URL 에 박는다. 라우트는 ?v 없이도 최신을 주지만 그러면 v1 과 v2 의
  // 주소가 같아서, 재업로드 후 router.refresh() 로 이 컴포넌트가 다시 그려져도
  // src 가 안 바뀌어 브라우저가 캐시된 v1 을 계속 보여준다 (2026-08-28 실측).
  // 번호를 넣으면 주소가 달라져 다시 받고, 표에 보이는 버전과도 어긋나지 않는다.
  // inline=1 이어야 브라우저가 내려받지 않고 연다.
  const previewSrc = latest
    ? `/api/documents/${document.id}/download?inline=1&v=${latest.versionNo}`
    : ''

  return (
    <div>
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        전체 문서
      </Link>

      <div className="rounded-xl border border-border bg-surface p-5">
        <DocumentMetaEditor
          id={document.id}
          title={document.title}
          description={document.description}
        />

        <TagEditor documentId={document.id} tags={document.tags.map(({ tag }) => tag.name)} />

        <dl className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-4 text-xs text-ink-muted">
          <div className="flex items-center gap-1.5">
            <dt>폴더</dt>
            <dd>
              <DocumentFolderSelect
                documentId={document.id}
                currentFolderId={document.folderId}
                options={folderOptions}
              />
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>만든 사람</dt>
            <dd className="text-ink">{document.createdBy.username}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>만든 날짜</dt>
            <dd className="text-ink">{formatDateTime(document.createdAt)}</dd>
          </div>
          {latest && (
            <>
              <div className="flex gap-1.5">
                <dt>최신</dt>
                <dd className="text-ink">v{latest.versionNo}</dd>
              </div>
              <div className="flex min-w-0 gap-1.5">
                <dt>파일</dt>
                <dd className="truncate-cell text-ink">{latest.fileName}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>크기</dt>
                <dd className="text-ink">{formatBytes(latest.sizeBytes)}</dd>
              </div>
            </>
          )}
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {latest && (
            <a
              href={`/api/documents/${document.id}/download`}
              className="flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm text-ink transition-colors hover:bg-canvas"
            >
              <Download className="h-4 w-4" />
              다운로드
            </a>
          )}
          <VersionUploadDialog
            documentId={document.id}
            title={document.title}
            latestVersionNo={latest?.versionNo ?? 0}
          />
          <div className="ml-auto">
            <DocumentRowActions id={document.id} title={document.title} redirectTo="/" />
          </div>
        </div>
      </div>

      {latest && (
        <section>
          <h2 className="mt-6 mb-2.5 text-sm font-semibold text-ink">미리보기</h2>
          {/* html 도 같은 iframe 이다. sandbox 를 안 거는 이유 — 문서는 S3 오리진에서
              실행되므로 앱 쿠키·DOM 에 원리상 닿지 못하고, 팀 화면설계서는 인터랙티브라
              스크립트를 막으면 정적 껍데기가 된다 (MILESTONES 미리보기 행). */}
          {(kind === 'pdf' || kind === 'html') && (
            <iframe
              src={previewSrc}
              title={`${latest.fileName} 미리보기`}
              className="h-[70vh] w-full rounded-xl border border-border bg-surface"
            />
          )}
          {kind === 'image' && (
            <div className="flex justify-center rounded-xl border border-border bg-surface p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- 서명 URL 로 307 되는
                  라우트라 next/image 의 최적화 대상이 아니다 */}
              <img
                src={previewSrc}
                alt={latest.fileName}
                className="max-h-[70vh] max-w-full object-contain"
              />
            </div>
          )}
          {kind === 'xlsx' && (
            <SpreadsheetPreview
              // 재업로드하면 src 의 ?v 가 바뀐다. key 로 갈아끼워야 이전 버전의
              // 시트가 남지 않는다 — 상태를 effect 안에서 되돌리는 것보다 싸다.
              key={previewSrc}
              src={previewSrc}
              fileName={latest.fileName}
              sizeBytes={latest.sizeBytes}
              downloadHref={`/api/documents/${document.id}/download`}
            />
          )}
          {kind === 'none' && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-5">
              <span className="flex h-9 w-11 shrink-0 items-center justify-center rounded bg-canvas text-xs font-semibold text-ink-muted">
                {fileLabel(latest.fileName)}
              </span>
              <p className="min-w-0 text-sm text-ink-muted">
                이 형식은 미리보기를 지원하지 않습니다. 내려받아서 여세요.
              </p>
              <a
                href={`/api/documents/${document.id}/download`}
                className="ml-auto flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm text-ink transition-colors hover:bg-canvas"
              >
                <Download className="h-4 w-4" />
                다운로드
              </a>
            </div>
          )}
        </section>
      )}

      <h2 className="mt-6 mb-2.5 text-sm font-semibold text-ink">버전 이력</h2>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-ink-muted">
              <th scope="col" className="w-20 px-4 py-2.5 font-medium">버전</th>
              <th scope="col" className="px-4 py-2.5 font-medium">파일</th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">크기</th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">올린 사람</th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">올린 시각</th>
              <th scope="col" className="px-4 py-2.5 font-medium">변경 메모</th>
              <th scope="col" className="w-12 px-4 py-2.5"><span className="sr-only">다운로드</span></th>
            </tr>
          </thead>
          <tbody>
            {document.versions.map((version) => (
              <tr key={version.id} className="border-b border-border last:border-0 hover:bg-canvas">
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="font-medium text-ink">v{version.versionNo}</span>
                  {version.versionNo === latest?.versionNo && (
                    <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">
                      최신
                    </span>
                  )}
                </td>
                <td className="max-w-0 px-4 py-3">
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded bg-canvas text-xs font-semibold text-ink-muted">
                      {fileLabel(version.fileName)}
                    </span>
                    <span className="truncate-cell block min-w-0 text-ink">{version.fileName}</span>
                  </span>
                </td>
                <td className="hidden px-4 py-3 whitespace-nowrap text-ink-muted sm:table-cell">
                  {formatBytes(version.sizeBytes)}
                </td>
                <td className="hidden px-4 py-3 text-ink-muted lg:table-cell">
                  {version.uploadedBy.username}
                </td>
                <td className="hidden px-4 py-3 whitespace-nowrap text-ink-muted md:table-cell">
                  {formatDateTime(version.createdAt)}
                </td>
                <td className="max-w-0 px-4 py-3 text-ink-muted">
                  <span className="truncate-cell block">{version.changeNote ?? '—'}</span>
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`/api/documents/${document.id}/download?v=${version.versionNo}`}
                    aria-label={`v${version.versionNo} 다운로드`}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-accent-soft hover:text-accent"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
