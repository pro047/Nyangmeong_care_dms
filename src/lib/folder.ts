import { z } from 'zod'

export const FOLDER_NAME_CONFLICT = '같은 위치에 같은 이름의 폴더가 이미 있습니다.'
export const FOLDER_NOT_FOUND = '폴더를 찾을 수 없습니다.'
export const PARENT_FOLDER_NOT_FOUND = '상위 폴더를 찾을 수 없습니다.'

/** 폴더 생성 본문. document-edit.ts 와 같은 이유로 trim 을 min/max 앞에 둔다. */
export const folderCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  parentId: z.string().min(1).optional(),
})

export const folderPatchSchema = z.object({
  name: z.string().trim().min(1).max(100),
})

export type FolderCreateInput = z.infer<typeof folderCreateSchema>
export type FolderPatchInput = z.infer<typeof folderPatchSchema>

export type FolderRow = { id: string; name: string; parentId: string | null }
export type FolderNode = FolderRow & { children: FolderNode[] }

/** 평면 행을 트리로 접는다. 같은 층은 이름 오름차순(한국어 정렬). */
export function buildFolderTree(rows: FolderRow[]): FolderNode[] {
  const byId = new Map<string, FolderNode>()
  for (const row of rows) {
    byId.set(row.id, { id: row.id, name: row.name, parentId: row.parentId, children: [] })
  }

  const roots: FolderNode[] = []
  for (const node of byId.values()) {
    if (node.parentId === null) {
      roots.push(node)
      continue
    }
    const parent = byId.get(node.parentId)
    // 부모가 목록에 없는 행(조상이 방금 지워진 경합)은 버린다. 루트로 올리면 없는 곳에
    // 폴더가 새로 생긴 것처럼 보인다.
    if (parent) parent.children.push(node)
  }

  const sortDeep = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    for (const node of nodes) sortDeep(node.children)
  }
  sortDeep(roots)

  return roots
}

/** 트리를 깊이 우선으로 펴서 들여쓰기용 depth 를 붙인다 (셀렉트 옵션). */
export function flattenFolderTree(nodes: FolderNode[]): { id: string; name: string; depth: number }[] {
  const flat: { id: string; name: string; depth: number }[] = []

  const walk = (list: FolderNode[], depth: number) => {
    for (const node of list) {
      flat.push({ id: node.id, name: node.name, depth })
      walk(node.children, depth + 1)
    }
  }
  walk(nodes, 0)

  return flat
}

export type FolderMutationFailure = { status: 404 | 409; error: string }

/**
 * version-create.ts 의 versionCreateFailure 와 같은 방식 — 오류 클래스를 import 하지 않고
 * code 문자열만 본다. P2002 는 @@unique([parentId, name]) 충돌, P2025 는 대상 폴더 없음,
 * P2003 은 지정한 상위 폴더가 없다는 뜻이다. 그 외는 null 을 돌려 호출자가 rethrow 하게 둔다.
 */
export function folderMutationFailure(err: unknown): FolderMutationFailure | null {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined
  if (code === 'P2002') return { status: 409, error: FOLDER_NAME_CONFLICT }
  if (code === 'P2025') return { status: 404, error: FOLDER_NOT_FOUND }
  if (code === 'P2003') return { status: 404, error: PARENT_FOLDER_NOT_FOUND }
  return null
}
