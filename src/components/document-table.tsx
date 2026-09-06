import Link from 'next/link'
import { ChevronRight, Download, Folder } from 'lucide-react'
import { DocumentRowActions } from '@/components/document-row-actions'
import { formatBytes, formatRelative, fileLabel } from '@/lib/format'
import type { FolderChildCard } from '@/lib/folder'

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

/** 열 수. 폴더 행이 전체 폭을 쓰려면 이 값이 thead 와 맞아야 한다. */
const COLUMN_COUNT = 7

/**
 * folders 는 지금 열어 둔 폴더의 직계 자식이다. 문서 행 위에 같은 표로 그려서 탐색이
 * 목록 하나로 끝나게 한다 — 별도 카드 영역을 두면 테두리가 둘로 갈린다.
 * 검색 화면은 폴더 개념이 없어 넘기지 않는다.
 */
export function DocumentTable({
  documents,
  folders = [],
  supersededIds,
}: {
  documents: DocumentListItem[]
  folders?: FolderChildCard[]
  /** 같은 폴더에 더 최신인 문서가 있는 문서 id. 화면에 그리는 집합이 아니라 전체 활성
      문서에서 뽑은 것이라 태그 필터·검색으로 목록이 좁아져도 판정이 흔들리지 않는다. */
  supersededIds?: ReadonlySet<string>
}) {
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
          {folders.map((folder) => (
            <tr key={folder.id} className="border-b border-border last:border-0 hover:bg-canvas">
              {/* 폴더에는 올린 사람·크기·수정일이 없다. 빈 칸을 늘어놓는 대신 한 칸으로
                  합치고 행 전체를 링크로 만든다. */}
              <td colSpan={COLUMN_COUNT} className="p-0">
                <Link
                  href={`/?folder=${encodeURIComponent(folder.id)}`}
                  className="flex items-center gap-2.5 px-4 py-3"
                >
                  {/* 문서 행의 확장자 배지와 같은 크기다 — 왼쪽 끝이 어긋나면 한 목록으로 안 읽힌다. */}
                  <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded bg-canvas text-ink-muted">
                    <Folder className="h-4 w-4" />
                  </span>
                  <span className="truncate-cell min-w-0 flex-1 font-medium text-ink">
                    {folder.name}
                  </span>
                  <span className="shrink-0 text-ink-muted">
                    {folder.documentCount > 0 ? `${folder.documentCount}개 문서` : '문서 없음'}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
                </Link>
              </td>
            </tr>
          ))}
          {documents.map((doc) => {
            const latest = doc.versions[0]
            // 구버전은 강조를 빼는 방식으로 구분한다 — 표시를 최신 쪽에 붙이면 거의 전
            // 행에 달린다. 행 배경은 건드리지 않는다. 배경까지 바꾸면 휴지통 행처럼 읽힌다.
            //
            // 색을 개별로 낮추지 않고 opacity 로 셀을 통째로 내리는 이유: 이 표의 본문 색
            // (#666666)이 이미 폴더·올린사람·크기·수정 열의 기본색이라, 제목만 그 색으로
            // 바꾸면 "흐려졌다"가 아니라 "제목이 다른 열과 같아졌다"로 읽힌다. 대조는 행
            // 단위로 생겨야 한다. 다운로드·삭제 칸에는 안 건다 — 구버전도 받아 갈 문서다.
            const superseded = supersededIds?.has(doc.id) ?? false
            const dim = superseded ? 'opacity-45' : ''
            return (
              <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-canvas">
                <td className={`max-w-0 px-4 py-3 ${dim}`}>
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
                <td className={`truncate-cell hidden w-28 px-3 py-3 text-ink-muted md:table-cell ${dim}`}>
                  {doc.folder?.name ?? '—'}
                </td>
                <td className={`truncate-cell hidden w-28 px-3 py-3 text-ink-muted lg:table-cell ${dim}`}>
                  {latest?.uploadedBy.username ?? '—'}
                </td>
                <td className={`hidden w-20 px-3 py-3 whitespace-nowrap text-ink-muted sm:table-cell ${dim}`}>
                  {latest ? formatBytes(latest.sizeBytes) : '—'}
                </td>
                <td className={`w-24 px-3 py-3 whitespace-nowrap text-ink-muted ${dim}`}>
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
