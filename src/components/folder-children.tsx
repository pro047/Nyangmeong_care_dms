import Link from 'next/link'
import { Folder } from 'lucide-react'
import type { FolderChildCard } from '@/lib/folder'

// 상태·핸들러가 없어 서버 컴포넌트로 둔다 — 'use client' 를 붙이면 번들만 는다.
export function FolderChildren({ cards }: { cards: FolderChildCard[] }) {
  return (
    <section aria-label="하위 폴더" className="mb-5">
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <li key={card.id}>
            <Link
              href={`/?folder=${encodeURIComponent(card.id)}`}
              className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-3 text-sm hover:bg-canvas"
            >
              <Folder className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
              <span className="min-w-0 flex-1 truncate-cell font-medium text-ink">
                {card.name}
              </span>
              <span className="shrink-0 text-xs text-ink-muted">
                {card.documentCount > 0 ? `${card.documentCount}개 문서` : '문서 없음'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
