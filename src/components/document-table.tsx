import Link from 'next/link'
import { Download } from 'lucide-react'
import { DocumentRowActions } from '@/components/document-row-actions'
import { formatBytes, formatRelative, fileLabel } from '@/lib/format'

/** 목록·검색이 같은 표를 쓰므로 두 쿼리의 include 가 이 모양을 만족해야 한다. */
export type DocumentListItem = {
  id: string
  title: string
  updatedAt: Date
  folder: { name: string } | null
  tags: { tag: { name: string } }[]
  versions: {
    versionNo: number
    fileName: string
    sizeBytes: number
    uploadedBy: { username: string }
  }[]
}

export function DocumentTable({ documents }: { documents: DocumentListItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-ink-muted">
            {/* 제목 칸에 폭을 주지 않는 것이 핵심이다 — 나머지를 고정하면 남는 폭이 전부
                제목으로 간다. 제목이 이 제품에서 가장 정보량이 큰 칸이고, 파일명이
                "01_요구사항 정의서_v0.3_2026_08_17" 처럼 뒤쪽(버전·날짜)에 구별점이 몰려 있어
                잘리면 앞부분만 남아 서로 구분이 안 된다. */}
            <th scope="col" className="px-4 py-2.5 font-medium">문서</th>
            <th scope="col" className="hidden w-28 px-3 py-2.5 font-medium md:table-cell">폴더</th>
            <th scope="col" className="hidden w-28 px-3 py-2.5 font-medium lg:table-cell">올린 사람</th>
            <th scope="col" className="hidden w-20 px-3 py-2.5 font-medium sm:table-cell">크기</th>
            <th scope="col" className="w-24 px-3 py-2.5 font-medium">수정</th>
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
                  {/* 제목은 상세로 간다. 바로 받고 싶으면 오른쪽 다운로드 아이콘. */}
                  <Link href={`/documents/${doc.id}`} className="flex items-center gap-2.5">
                    <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded bg-canvas text-xs font-semibold text-ink-muted">
                      {latest ? fileLabel(latest.fileName) : '—'}
                    </span>
                    <span className="min-w-0">
                      <span className="truncate-cell block font-medium text-ink">{doc.title}</span>
                      {latest && latest.versionNo > 1 && (
                        <span className="text-xs text-ink-subtle">v{latest.versionNo}</span>
                      )}
                    </span>
                  </Link>
                  {/* 칩은 제목 링크 바깥에 둔다 — a 안에 a 는 유효하지 않다. */}
                  {doc.tags.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1 pl-[46px]">
                      {doc.tags.map(({ tag }) => (
                        <Link
                          key={tag.name}
                          href={`/?tag=${encodeURIComponent(tag.name)}`}
                          className="rounded bg-canvas px-1.5 py-0.5 text-xs text-ink-muted transition-colors hover:bg-accent-soft hover:text-accent"
                        >
                          {tag.name}
                        </Link>
                      ))}
                    </span>
                  )}
                </td>
                <td className="truncate-cell hidden w-28 px-3 py-3 text-ink-muted md:table-cell">
                  {doc.folder?.name ?? '—'}
                </td>
                <td className="truncate-cell hidden w-28 px-3 py-3 text-ink-muted lg:table-cell">
                  {latest?.uploadedBy.username ?? '—'}
                </td>
                <td className="hidden w-20 px-3 py-3 whitespace-nowrap text-ink-muted sm:table-cell">
                  {latest ? formatBytes(latest.sizeBytes) : '—'}
                </td>
                <td className="w-24 px-3 py-3 whitespace-nowrap text-ink-muted">
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
                  {/* 상세 페이지에도 같은 버튼이 있다. 목록에서도 바로 지울 수 있게 둔다. */}
                  <DocumentRowActions id={doc.id} title={doc.title} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
