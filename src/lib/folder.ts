import { z } from 'zod'
import { normalizeTags } from '@/lib/tag'

export const FOLDER_NAME_CONFLICT = '같은 위치에 같은 이름의 폴더가 이미 있습니다.'
export const FOLDER_NOT_FOUND = '폴더를 찾을 수 없습니다.'
export const PARENT_FOLDER_NOT_FOUND = '상위 폴더를 찾을 수 없습니다.'

/** 태그와 같은 상한. 성격이 같고(짧은 한글 라벨) 셀렉트·Dialog 표시 폭도 같다. */
export const MAX_ALIASES_PER_FOLDER = 10
export const MAX_ALIAS_LENGTH = 30

/**
 * 자동 분류용 별칭 정규화. 앞뒤 공백 제거 → 빈 항목 제거 → 대소문자 무시 중복 제거로
 * 태그와 의미론이 같으므로 구현을 재사용한다. 저장 표기를 소문자로 강제하지 않는 이유도
 * 같다 — 매칭은 어차피 normalizeForMatch 를 거치므로 얻는 것이 없다.
 */
export function normalizeAliases(raw: string[]): string[] {
  return normalizeTags(raw)
}

/** 정규화 뒤에 개수·길이를 본다 (tagsPutSchema 와 같은 이유 — 공백·중복 때문에 11개가 된
    요청까지 400 으로 떨구면 사용자 눈에는 10개도 안 되는데 거절당한 것으로 보인다). */
function refineAliases(aliases: string[] | undefined): boolean {
  if (aliases === undefined) return true
  return (
    aliases.length <= MAX_ALIASES_PER_FOLDER &&
    aliases.every((alias) => alias.length <= MAX_ALIAS_LENGTH)
  )
}

/** 폴더 생성 본문. document-edit.ts 와 같은 이유로 trim 을 min/max 앞에 둔다. */
export const folderCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    parentId: z.string().min(1).optional(),
    aliases: z.array(z.string()).optional(),
  })
  .transform((body) => ({
    ...body,
    aliases: body.aliases === undefined ? undefined : normalizeAliases(body.aliases),
  }))
  .refine((body) => refineAliases(body.aliases))

/**
 * 폴더 이름 검증. 통과면 null, 아니면 사용자에게 보일 한국어 메시지.
 * 기준은 folderCreateSchema 와 같다(trim 후 1~100자) — 보내고 나서 400 을 받아야
 * 알게 되는 자리를 화면에서 먼저 막는다.
 */
export function folderNameError(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return '폴더 이름을 입력하세요.'
  if (trimmed.length > 100) return '폴더 이름은 100자까지입니다.'
  return null
}

/** aliases 를 생략하면 undefined 다 — 이름만 바꾸던 기존 호출이 별칭을 지우면 안 된다. */
export const folderPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    aliases: z.array(z.string()).optional(),
  })
  .transform((body) => ({
    ...body,
    aliases: body.aliases === undefined ? undefined : normalizeAliases(body.aliases),
  }))
  .refine((body) => refineAliases(body.aliases))

export type FolderCreateInput = z.infer<typeof folderCreateSchema>
export type FolderPatchInput = z.infer<typeof folderPatchSchema>

export type FolderRow = { id: string; name: string; parentId: string | null }
export type FolderNode = FolderRow & { children: FolderNode[] }

/** 별칭이 필요한 자리만 이 타입을 쓴다. FolderRow 자체를 넓히면 상세 페이지처럼
    별칭이 필요 없는 조회까지 컬럼을 더 읽어야 한다. */
export type FolderAliasRow = FolderRow & { aliases: string[] }

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
