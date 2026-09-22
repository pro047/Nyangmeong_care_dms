'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Download } from 'lucide-react'
import { DocumentRowActions } from '@/components/document-row-actions'
import { fileVersionLabel } from '@/lib/file-version'
import { lastActivityAt } from '@/lib/latest'
import { canDeleteRow, type DeletePermission } from '@/lib/ownership'
import { formatBytes, formatDateTime, formatRelative, fileLabel } from '@/lib/format'
import type { DocumentListItem } from '@/lib/document-list'

/**
 * 문서 행과 그 아래 펼쳐지는 이력. **클라이언트 경계를 여기서 자른다.**
 *
 * 표 전체를 `'use client'` 로 올리면 `supersededIds` 가 `Set` 이라 RSC 경계를 넘는데,
 * 되는지 확인 안 했고 확인 비용을 쓰느니 경계를 작게 두는 편이 낫다. 여기는 `superseded`
 * 불리언 하나만 받는다.
 *
 * 이력을 셀 안에 못 넣는 이유: 펼친 내용이 **형제 `<tr>`** 이라 `<td>` 밑에 올 수 없다.
 * 그래서 한 문서가 Fragment 로 행 둘을 낸다.
 */
export function DocumentRow({
  doc,
  superseded,
  permission,
  columnCount,
}: {
  doc: DocumentListItem
  /** 같은 폴더에 더 최신인 문서가 있다. 표시는 구버전 쪽에 붙는다(latest.ts). */
  superseded: boolean
  permission: DeletePermission
  /** 펼친 행이 표 전체 폭을 쓰려면 thead 와 맞아야 한다. */
  columnCount: number
}) {
  const [open, setOpen] = useState(false)
  const latest = doc.versions[0]
  // 구버전은 강조를 빼는 방식으로 구분한다 — 표시를 최신 쪽에 붙이면 거의 전 행에 달린다.
  // 행 배경은 건드리지 않는다. 배경까지 바꾸면 휴지통 행처럼 읽힌다.
  const dim = superseded ? 'opacity-45' : ''
  const label = (latest && fileVersionLabel(latest.fileName)) ?? '—'
  const times = doc.versions.length

  return (
    <>
      <tr className="border-b border-border last:border-0 hover:bg-canvas">
        <td className={`max-w-0 px-4 py-3 ${dim}`}>
          {/* 제목은 상세로 간다. 바로 받고 싶으면 오른쪽 다운로드 아이콘. */}
          <Link href={`/documents/${doc.id}`} className="flex items-center gap-2.5">
            <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded bg-canvas text-xs font-semibold text-ink-muted">
              {latest ? fileLabel(latest.fileName) : '—'}
            </span>
            <span className="min-w-0">
              <span className="truncate-cell block font-medium text-ink">{doc.title}</span>
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
        {/*
          숫자가 둘이고 **서로 관계가 없다.** `v0.6` 은 팀이 문서에 매긴 번호(파일명에서
          읽는다)이고 `5회` 는 이 문서에 파일을 올린 횟수(앱이 센다)다. 둘 다 "판"이라
          부르면 `v0.6 의 5판` 처럼 읽혀서 낱말을 갈랐다 — 세는 것이 횟수라 `회` 다.

          **1회면 안 붙인다.** 운영 33건 중 23건이 1회인데 전부에 `1회` 를 달면 이력이
          있다는 신호가 아니라 배경이 된다.
        */}
        <td className={`w-24 px-3 py-3 whitespace-nowrap text-ink-muted ${dim}`}>
          {times > 1 ? (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label={`${doc.title} 올린 기록 ${times}회 ${open ? '접기' : '펼치기'}`}
              className="flex items-center gap-1 rounded hover:text-ink"
            >
              <span>{label}</span>
              <span className="text-ink-subtle">·</span>
              <span className="tabular-nums">{times}회</span>
              <ChevronDown className={`h-3 w-3 ${open ? 'rotate-180' : ''}`} aria-hidden />
            </button>
          ) : (
            label
          )}
        </td>
        <td className={`truncate-cell hidden w-28 px-3 py-3 text-ink-muted md:table-cell ${dim}`}>
          {doc.folder?.name ?? '—'}
        </td>
        <td className={`truncate-cell hidden w-28 px-3 py-3 text-ink-muted lg:table-cell ${dim}`}>
          {latest?.uploadedBy.username ?? '—'}
        </td>
        <td
          className={`hidden w-20 px-3 py-3 whitespace-nowrap text-ink-muted sm:table-cell ${dim}`}
        >
          {latest ? formatBytes(latest.sizeBytes) : '—'}
        </td>
        <td className={`w-24 px-3 py-3 whitespace-nowrap text-ink-muted ${dim}`}>
          {/* "올린 날짜" 가 아니라 "최근 업로드" 다 — 최신 버전이 들어온 시각이지 문서가
              처음 만들어진 시각이 아니다(latest.ts 의 lastActivityAt). */}
          {formatRelative(lastActivityAt(doc))}
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
          {/* 상세 페이지에도 같은 버튼이 있다. 목록에서도 바로 지울 수 있게 둔다.
              남의 문서면 칸을 비운다 — 비활성 버튼을 두면 누를 수 있어 보이고,
              매번 403 토스트를 띄우는 것보다 안 보이는 편이 조용하다. */}
          {canDeleteRow(permission, doc) && <DocumentRowActions id={doc.id} title={doc.title} />}
        </td>
      </tr>

      {open && (
        <tr className="border-b border-border last:border-0">
          <td colSpan={columnCount} className="bg-canvas px-4 py-2">
            <ul className="grid gap-1">
              {doc.versions.map((version) => (
                <li
                  key={version.id}
                  className="flex items-center gap-3 text-xs text-ink-muted"
                >
                  <span className="w-10 shrink-0 tabular-nums text-ink">
                    {version.versionNo}회
                  </span>
                  <span className="truncate-cell min-w-0 flex-1 text-ink">{version.fileName}</span>
                  <span className="hidden w-16 shrink-0 text-right tabular-nums sm:block">
                    {formatBytes(version.sizeBytes)}
                  </span>
                  <span className="hidden w-24 shrink-0 truncate lg:block">
                    {version.uploadedBy.username}
                  </span>
                  <span className="hidden w-40 shrink-0 whitespace-nowrap md:block">
                    {formatDateTime(version.createdAt)}
                  </span>
                  {/* 라우트가 `?v=N` 으로 그 회차를 그대로 준다 — 최신만 받는 위 아이콘과 다르다. */}
                  <a
                    href={`/api/documents/${doc.id}/download?v=${version.versionNo}`}
                    aria-label={`${doc.title} ${version.versionNo}회차 다운로드`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-subtle transition-colors hover:bg-accent-soft hover:text-accent"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}
