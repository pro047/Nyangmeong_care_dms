'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Files, Trash2 } from 'lucide-react'
import { FolderTree } from '@/components/folder-tree'
import type { FolderAliasRow } from '@/lib/folder'

const NAV = [
  { href: '/', label: '전체 문서', icon: Files },
  { href: '/trash', label: '휴지통', icon: Trash2 },
]

/** folders 가 null 이면 레이아웃의 폴더 조회가 실패한 것이다 (layout.tsx 의 try/catch). */
export function AppSidebar({ folders }: { folders: FolderAliasRow[] | null }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="주요 메뉴"
      className="hidden w-56 shrink-0 border-r border-border bg-surface p-3 md:block"
    >
      <ul className="space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-accent-soft font-medium text-accent'
                    : 'text-ink-muted hover:bg-canvas hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>

      <div className="mt-6">
        <p className="px-3 pb-2 text-xs font-medium tracking-wide text-ink-subtle">폴더</p>
        {folders === null ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs leading-relaxed text-ink-subtle">
            폴더를 불러오지 못했습니다
          </p>
        ) : (
          <FolderTree folders={folders} />
        )}
      </div>
    </nav>
  )
}
