import Link from 'next/link'
import { ChevronRight, Folder } from 'lucide-react'
import { DocumentRow } from '@/components/document-rows'
import type { DeletePermission } from '@/lib/ownership'
import type { DocumentListItem } from '@/lib/document-list'
import type { FolderChildCard } from '@/lib/folder'

export type { DocumentListItem }

/** 열 수. 폴더 행과 펼친 이력 행이 전체 폭을 쓰려면 이 값이 thead 와 맞아야 한다. */
const COLUMN_COUNT = 8

/**
 * folders 는 지금 열어 둔 폴더의 직계 자식이다. 문서 행 위에 같은 표로 그려서 탐색이
 * 목록 하나로 끝나게 한다 — 별도 카드 영역을 두면 테두리가 둘로 갈린다.
 * 검색 화면은 폴더 개념이 없어 넘기지 않는다.
 */
export function DocumentTable({
  documents,
  folders = [],
  supersededIds,
  permission,
}: {
  documents: DocumentListItem[]
  folders?: FolderChildCard[]
  /** 같은 폴더에 더 최신인 문서가 있는 문서 id. 화면에 그리는 집합이 아니라 전체 활성
      문서에서 뽑은 것이라 태그 필터·검색으로 목록이 좁아져도 판정이 흔들리지 않는다. */
  supersededIds?: ReadonlySet<string>
  /** 삭제 버튼 표시용. 실제 보호는 라우트의 denyIfNotOwner 가 한다 — 여기서 숨기는 것은
      누를 수 없는 버튼을 안 보여주기 위한 것이지 방어선이 아니다. */
  permission: DeletePermission
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
            {/* 숨기지 않는다 — 이 열을 보려고 만든 화면이고, 폭이 좁아 밀어내는 것도 없다. */}
            <th scope="col" className="w-20 px-3 py-2.5 font-medium">버전</th>
            <th scope="col" className="hidden w-28 px-3 py-2.5 font-medium md:table-cell">폴더</th>
            <th scope="col" className="hidden w-28 px-3 py-2.5 font-medium lg:table-cell">올린 사람</th>
            <th scope="col" className="hidden w-20 px-3 py-2.5 font-medium sm:table-cell">크기</th>
            <th scope="col" className="w-24 px-3 py-2.5 font-medium">올린 날짜</th>
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
          {/* 문서 행은 클라이언트 컴포넌트다 — 이력 펼치기에 상태가 필요하고, 펼친 내용이
              형제 `<tr>` 이라 셀 안에 못 넣는다. 경계를 행에서 자르면 여기 서버 컴포넌트가
              `supersededIds`(Set)를 그대로 들고 있을 수 있다. */}
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              superseded={supersededIds?.has(doc.id) ?? false}
              permission={permission}
              columnCount={COLUMN_COUNT}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
