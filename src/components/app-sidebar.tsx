'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef, useState, useSyncExternalStore } from 'react'
import { Files, Trash2 } from 'lucide-react'
import { FolderTree } from '@/components/folder-tree'
import type { FolderAliasRow } from '@/lib/folder'

const NAV = [
  { href: '/', label: '전체 문서', icon: Files },
  { href: '/trash', label: '휴지통', icon: Trash2 },
]

/** 기존 w-56 과 같은 값. 저장된 값이 없거나 못 읽으면 여기로 떨어진다. */
const DEFAULT_WIDTH = 224
// 아래는 폴더 이름이 두 글자만 남는 폭, 위는 본문 표를 밀어내기 시작하는 폭이다.
const MIN_WIDTH = 176
const MAX_WIDTH = 400
const WIDTH_KEY = 'dms.sidebarWidth'
/** 키보드 화살표 한 번의 이동량. 트리 들여쓰기 한 단(14px)보다 커야 체감된다. */
const STEP = 16

const clampWidth = (px: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(px)))

// localStorage 를 useState 초기화에서 읽으면 서버가 그린 224px 와 어긋나 하이드레이션
// 불일치가 난다. useSyncExternalStore 는 서버 스냅샷을 따로 받아 이 경우를 정상 처리한다.
// 다른 탭에서 바꾼 값까지 따라가려고 storage 이벤트를 구독한다.
const subscribeWidth = (onChange: () => void) => {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}
const readWidth = () => {
  try {
    return window.localStorage.getItem(WIDTH_KEY)
  } catch {
    // 사파리 프라이빗 모드 등에서 접근 자체가 던진다. 기본값으로 떨어지면 된다.
    return null
  }
}

/** folders 가 null 이면 레이아웃의 폴더 조회가 실패한 것이다 (layout.tsx 의 try/catch). */
export function AppSidebar({ folders }: { folders: FolderAliasRow[] | null }) {
  const pathname = usePathname()

  const stored = useSyncExternalStore(subscribeWidth, readWidth, () => null)
  // 드래그 중에는 저장된 값을 보지 않는다 — 손이 움직이는 동안 storage 이벤트가 끼어들어
  // 폭이 튀면 안 된다.
  const [dragged, setDragged] = useState<number | null>(null)
  // 드래그 여부를 ref 로 두면 렌더에서 못 읽는다(react-hooks/refs). 클래스에 쓰이므로 상태다.
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)

  const width = dragged ?? (stored === null ? DEFAULT_WIDTH : clampWidth(Number(stored)))

  const commitWidth = (px: number) => {
    try {
      window.localStorage.setItem(WIDTH_KEY, String(px))
    } catch {
      // 저장에 실패해도 이번 세션의 폭은 유지된다. 알릴 만한 실패가 아니다.
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // 포인터를 캡처하면 커서가 핸들 밖으로 나가도 move/up 이 이 요소로 온다.
    // window 리스너를 useEffect 로 붙였다 떼는 것보다 상태 관리가 단순하다.
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, startWidth: width }
    setDragged(width)
    setDragging(true)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current === null) return
    setDragged(clampWidth(drag.current.startWidth + e.clientX - drag.current.startX))
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current === null) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    drag.current = null
    setDragging(false)
    commitWidth(width)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowLeft' ? -STEP : e.key === 'ArrowRight' ? STEP : 0
    if (delta === 0) return
    // 화살표로 사이드바를 줄이는 동안 페이지가 같이 스크롤되면 안 된다.
    e.preventDefault()
    const next = clampWidth(width + delta)
    setDragged(next)
    commitWidth(next)
  }

  return (
    <nav
      aria-label="주요 메뉴"
      style={{ width }}
      className={`relative hidden shrink-0 border-r border-border bg-surface p-3 md:block ${
        dragging ? 'select-none' : ''
      }`}
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

      {/* 경계선 위에 걸치도록 절반을 밖으로 뺀다 — 테두리 1px 만 잡게 하면 못 잡는다.
          본문 위로 4px 만 침범하므로 표의 클릭을 가리지 않는다. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="사이드바 너비 조절"
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        // touch-none 이 없으면 터치 드래그가 페이지 스크롤로 먹힌다.
        className="absolute inset-y-0 -right-1 w-2 cursor-col-resize touch-none hover:bg-border-strong focus-visible:bg-accent focus-visible:outline-none"
      />
    </nav>
  )
}
