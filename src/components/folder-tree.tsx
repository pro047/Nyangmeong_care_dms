'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Folder, FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { buildFolderTree, type FolderNode, type FolderRow } from '@/lib/folder'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/** folderCreateSchema 와 같은 값. 서버가 튕기기 전에 여기서 먼저 막는다. */
const MAX_NAME = 100

/** 열려 있는 이름 입력 창이 무엇을 하려는 것인지. null 이면 닫혀 있다. */
type NameDialog =
  | { mode: 'create'; parentId: string | null }
  | { mode: 'rename'; folder: FolderNode }

async function errorMessage(res: Response, fallback: string) {
  const body = await res.json().catch(() => null)
  return body?.error ?? fallback
}

export function FolderTree({ folders }: { folders: FolderRow[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null)
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState<FolderNode | null>(null)

  // (app) 전 구간이 force-dynamic 이라 Suspense 경계 없이도 서버 렌더에서 값이 온다.
  const activeId = searchParams.get('folder')
  const tree = buildFolderTree(folders)

  /** 성공 여부를 돌려준다 — 호출부가 입력 창을 닫을지 남길지 정한다. */
  const send = async (fallback: string, request: () => Promise<Response>) => {
    setBusy(true)
    try {
      const res = await request()
      if (!res.ok) throw new Error(await errorMessage(res, fallback))
      // 트리는 layout(서버)이 그린다. 다시 렌더해야 화면이 따라온다.
      router.refresh()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '알 수 없는 오류')
      return false
    } finally {
      setBusy(false)
    }
  }

  const openCreate = (parentId: string | null) => {
    setNameDialog({ mode: 'create', parentId })
    setName('')
  }

  const openRename = (folder: FolderNode) => {
    setNameDialog({ mode: 'rename', folder })
    setName(folder.name)
  }

  // 생성과 이름변경은 입력이 같아서 창 하나를 돌려 쓴다. 노드마다 Dialog 를 두면
  // 폴더 수만큼 인스턴스가 생긴다.
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nameDialog) return

    const trimmed = name.trim()
    if (trimmed === '') return
    // 이름이 그대로면 요청을 아낀다. 서버는 같은 이름도 성공으로 처리한다.
    if (nameDialog.mode === 'rename' && trimmed === nameDialog.folder.name) {
      setNameDialog(null)
      return
    }

    const request =
      nameDialog.mode === 'create'
        ? () =>
            fetch('/api/folders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(
                nameDialog.parentId === null
                  ? { name: trimmed }
                  : { name: trimmed, parentId: nameDialog.parentId },
              ),
            })
        : () =>
            fetch(`/api/folders/${nameDialog.folder.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: trimmed }),
            })

    const fallback =
      nameDialog.mode === 'create' ? '폴더를 만들지 못했습니다.' : '이름을 바꾸지 못했습니다.'

    // 실패하면 토스트가 뜨는데 창이 이미 닫혀 있다. 이름 충돌(409)이 잦은 자리라
    // 창을 닫기 전에 결과를 보고, 실패면 입력을 남겨 고쳐 쓰게 한다.
    void send(fallback, request).then((ok) => {
      if (ok) setNameDialog(null)
    })
  }

  const handleDelete = () => {
    if (!deleting) return
    const folder = deleting
    setDeleting(null)
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
                onClick={() => openCreate(node.id)}
                aria-label={`${node.name} 하위 폴더 추가`}
                title="하위 폴더 추가"
                className="flex h-6 w-6 items-center justify-center rounded text-ink-subtle hover:text-ink disabled:opacity-40"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => openRename(node)}
                aria-label={`${node.name} 이름 바꾸기`}
                title="이름 바꾸기"
                className="flex h-6 w-6 items-center justify-center rounded text-ink-subtle hover:text-ink disabled:opacity-40"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleting(node)}
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
        onClick={() => openCreate(null)}
        className="mt-2 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-canvas hover:text-ink disabled:opacity-40"
      >
        <FolderPlus className="h-4 w-4 shrink-0" />새 폴더
      </button>

      {/* 생성·이름변경 공용. window.prompt 는 길이 검증을 못 붙여서, 서버가 100자로
          튕길 때까지 사용자가 알 방법이 없었다. */}
      <Dialog open={nameDialog !== null} onOpenChange={(open) => !open && setNameDialog(null)}>
        <DialogContent>
          <form onSubmit={handleNameSubmit}>
            <DialogHeader>
              <DialogTitle>
                {nameDialog?.mode === 'rename'
                  ? '폴더 이름 바꾸기'
                  : nameDialog?.parentId === null
                    ? '새 폴더'
                    : '하위 폴더 추가'}
              </DialogTitle>
              <DialogDescription>
                같은 위치에 같은 이름은 쓸 수 없습니다. 최대 {MAX_NAME}자.
              </DialogDescription>
            </DialogHeader>

            <input
              // 창이 열릴 때마다 새로 마운트돼야 autoFocus 가 다시 걸린다.
              key={nameDialog?.mode === 'rename' ? nameDialog.folder.id : 'create'}
              autoFocus
              value={name}
              maxLength={MAX_NAME}
              onChange={(e) => setName(e.target.value)}
              placeholder="폴더 이름"
              aria-label="폴더 이름"
              className="my-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNameDialog(null)}>
                취소
              </Button>
              <Button type="submit" disabled={busy || name.trim() === ''}>
                {nameDialog?.mode === 'rename' ? '이름 바꾸기' : '만들기'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>폴더를 삭제할까요?</AlertDialogTitle>
            {/* 문서가 같이 지워지지 않는다는 것을 반드시 알린다 — 여기서 겁먹고 못 지운다. */}
            <AlertDialogDescription>
              &ldquo;{deleting?.name}&rdquo; 폴더를 삭제합니다. 하위 폴더도 함께 삭제되고, 안에
              있던 문서는 미분류로 남습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-danger text-white hover:bg-danger/90">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
