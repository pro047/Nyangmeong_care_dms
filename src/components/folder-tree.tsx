'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Folder, FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { buildFolderTree, type FolderNode, type FolderRow } from '@/lib/folder'

async function errorMessage(res: Response, fallback: string) {
  const body = await res.json().catch(() => null)
  return body?.error ?? fallback
}

export function FolderTree({ folders }: { folders: FolderRow[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [busy, setBusy] = useState(false)

  // (app) 전 구간이 force-dynamic 이라 Suspense 경계 없이도 서버 렌더에서 값이 온다.
  const activeId = searchParams.get('folder')
  const tree = buildFolderTree(folders)

  const send = async (fallback: string, request: () => Promise<Response>) => {
    setBusy(true)
    try {
      const res = await request()
      if (!res.ok) throw new Error(await errorMessage(res, fallback))
      // 트리는 layout(서버)이 그린다. 다시 렌더해야 화면이 따라온다.
      router.refresh()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '알 수 없는 오류')
    } finally {
      setBusy(false)
    }
  }

  // 모달을 새로 만드는 대신 prompt/confirm 을 쓴다 — 삭제 확인이 이미 confirm 이고
  // 7인 내부 도구에는 이 정도가 맞다.
  const handleCreate = (parentId: string | null) => {
    const name = window.prompt(parentId === null ? '새 폴더 이름' : '하위 폴더 이름')
    if (name === null) return
    if (name.trim() === '') {
      window.alert('폴더 이름을 입력해 주세요.')
      return
    }
    void send('폴더를 만들지 못했습니다.', () =>
      fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parentId === null ? { name } : { name, parentId }),
      }),
    )
  }

  const handleRename = (folder: FolderNode) => {
    const name = window.prompt('폴더 이름', folder.name)
    if (name === null || name.trim() === folder.name) return
    if (name.trim() === '') {
      window.alert('폴더 이름을 입력해 주세요.')
      return
    }
    void send('이름을 바꾸지 못했습니다.', () =>
      fetch(`/api/folders/${folder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    )
  }

  const handleDelete = (folder: FolderNode) => {
    const confirmed = window.confirm(
      `"${folder.name}" 폴더를 삭제할까요?\n하위 폴더도 함께 삭제되고, 안에 있던 문서는 미분류로 남습니다.`,
    )
    if (!confirmed) return
    void send('폴더를 삭제하지 못했습니다.', () =>
      fetch(`/api/folders/${folder.id}`, { method: 'DELETE' }),
    )
  }

  const renderNodes = (nodes: FolderNode[], depth: number) =>
    nodes.map((node) => {
      const active = activeId === node.id
      return (
        <li key={node.id}>
          <div
            className={`group flex items-center rounded-lg pr-1 ${
              active ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-canvas'
            }`}
          >
            <Link
              href={`/?folder=${encodeURIComponent(node.id)}`}
              aria-current={active ? 'page' : undefined}
              style={{ paddingLeft: `${12 + depth * 14}px` }}
              className={`flex min-w-0 flex-1 items-center gap-2 py-2 text-sm ${
                active ? 'font-medium' : 'hover:text-ink'
              }`}
            >
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate-cell">{node.name}</span>
            </Link>
            {/* 좁은 사이드바라 평소에는 감춘다. 키보드 초점에도 나타나야 한다. */}
            <span className="flex shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleCreate(node.id)}
                aria-label={`${node.name} 하위 폴더 추가`}
                title="하위 폴더 추가"
                className="flex h-6 w-6 items-center justify-center rounded text-ink-subtle hover:text-ink disabled:opacity-40"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleRename(node)}
                aria-label={`${node.name} 이름 바꾸기`}
                title="이름 바꾸기"
                className="flex h-6 w-6 items-center justify-center rounded text-ink-subtle hover:text-ink disabled:opacity-40"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDelete(node)}
                aria-label={`${node.name} 삭제`}
                title="폴더 삭제"
                className="flex h-6 w-6 items-center justify-center rounded text-ink-subtle hover:text-danger disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
          {node.children.length > 0 && <ul>{renderNodes(node.children, depth + 1)}</ul>}
        </li>
      )
    })

  return (
    <>
      {tree.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs leading-relaxed text-ink-subtle">
          아직 폴더가 없습니다
        </p>
      ) : (
        <ul className="space-y-0.5">{renderNodes(tree, 0)}</ul>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => handleCreate(null)}
        className="mt-2 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-canvas hover:text-ink disabled:opacity-40"
      >
        <FolderPlus className="h-4 w-4 shrink-0" />새 폴더
      </button>
    </>
  )
}
