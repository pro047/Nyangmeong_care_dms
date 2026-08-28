import Link from 'next/link'
import type { SessionUser } from '@/lib/session'
import { MAX_SEARCH_LENGTH } from '@/lib/search'
import { Search, LogOut } from 'lucide-react'

export function AppHeader({ user }: { user: SessionUser }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
      <Link href="/" className="flex shrink-0 items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white">
          D
        </span>
        <span className="hidden text-sm font-semibold text-ink sm:inline">팀 문서 관리</span>
      </Link>

      {/* GET 폼이라 제출하면 ?q= 가 붙은 채 /search 로 이동한다 — 별도 핸들러가 필요 없다. */}
      <form action="/search" className="relative mx-auto w-full max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-subtle"
          aria-hidden
        />
        <input
          type="search"
          name="q"
          maxLength={MAX_SEARCH_LENGTH}
          placeholder="문서 검색"
          aria-label="문서 검색"
          className="w-full rounded-lg border border-border bg-canvas py-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/15 focus:outline-none"
        />
      </form>

      <div className="flex shrink-0 items-center gap-3">
        <div className="flex items-center gap-2">
          {/* 디스코드 CDN 이미지라 next/image 최적화 없이 직접 렌더 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={user.avatarUrl ?? '/avatar-fallback.svg'}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-full bg-canvas object-cover"
          />
          <span className="hidden text-sm text-ink md:inline">{user.username}</span>
        </div>

        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            aria-label="로그아웃"
            title="로그아웃"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  )
}
