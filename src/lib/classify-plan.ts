import { normalizeForMatch, type ClassifyFolder, type ClassifyResult } from '@/lib/classify'

/**
 * 미리보기에서 사람이 확인한 뒤의 절차. upload-flow.ts 와 같은 이유로 컴포넌트가 아니라
 * 여기 있다 — 폴더 선생성과 취소 정리는 순서 문제라 컴포넌트 안에 두면 고정할 수단이 없다.
 */

/** 한 파일의 최종 목적지. */
export type Destination =
  | { kind: 'folder'; folderId: string }
  | { kind: 'new'; name: string }
  | { kind: 'none' }

export function defaultDestination(result: ClassifyResult): Destination {
  if (result.kind === 'match') return { kind: 'folder', folderId: result.folderId }
  if (result.kind === 'propose') return { kind: 'new', name: result.proposedName }
  return { kind: 'none' }
}

/**
 * 만들어야 할 폴더 이름. 정규화 기준으로 같은 이름은 하나로 합치고 먼저 나온 표기를 남긴다
 * (태그·별칭 정규화와 같은 규칙). 이렇게 합쳐야 제안 이름이 같은 파일들이 한 폴더로 간다.
 */
export function plannedFolderNames(destinations: Destination[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []

  for (const dest of destinations) {
    if (dest.kind !== 'new') continue
    const key = normalizeForMatch(dest.name)
    if (seen.has(key)) continue
    seen.add(key)
    names.push(dest.name)
  }

  return names
}

/**
 * 사람이 고친 새 폴더 이름이 기존 폴더의 이름·별칭과 정규화 기준으로 **정확히** 같으면
 * 그 폴더 id 를 돌려준다. 이게 없으면 두 가지로 샌다 — 표기까지 같으면 생성이 409 로
 * 튕겨 미분류가 되고(사용자 의도 배반), 표기만 다르면(`요구사항 정의서` vs
 * `요구사항정의서`) 유사 중복 폴더가 조용히 생긴다.
 *
 * classifyFileName 의 부분 문자열 매칭과 달리 정확일치인 이유: 이 이름은 파일명이
 * 아니라 사람이 폴더 이름으로 직접 적은 값이라 `설계` 가 `화면설계서` 를 뜻하지 않는다.
 * 서로 다른 폴더 여러 개에 걸리면(부모만 다른 동명) 고를 수 없으므로 흡수하지 않는다.
 */
export function findExistingFolderByName(
  name: string,
  folders: ClassifyFolder[],
): string | null {
  const key = normalizeForMatch(name)
  if (key === '') return null

  const matched = new Set<string>()
  for (const folder of folders) {
    for (const candidate of [folder.name, ...folder.aliases]) {
      if (normalizeForMatch(candidate) === key) {
        matched.add(folder.id)
        break
      }
    }
  }

  if (matched.size !== 1) return null
  return matched.values().next().value ?? null
}

export type FolderCreateOutcome = { ok: true; id: string } | { ok: false; conflict: boolean }

/**
 * 업로드를 시작하기 **전에** 폴더를 순차로 전부 만든다. 워커 3개가 같은 이름을 동시에
 * 만들려는 상황 자체를 없애는 것이 목적이다 — 루트 폴더는 `@@unique([parentId, name])` 가
 * 못 막아서(Postgres 는 NULL 끼리 다른 값으로 본다) 동시 생성의 결과가 오류가 아니라
 * 조용한 중복 폴더다. 순서를 바꾸는 편이 동시성 처리보다 싸다.
 *
 * 실패(409 포함)는 null 로 남긴다 — 그 이름을 고른 파일들은 미분류로 폴백한다.
 */
export async function createPlannedFolders(
  names: string[],
  createFolder: (name: string) => Promise<FolderCreateOutcome>,
): Promise<Map<string, string | null>> {
  const created = new Map<string, string | null>()

  for (const name of names) {
    try {
      const outcome = await createFolder(name)
      created.set(name, outcome.ok ? outcome.id : null)
    } catch {
      created.set(name, null)
    }
  }

  return created
}

/** 업로드 1건이 실제로 보낼 folderId. null 이면 body 에서 folderId 키를 뺀다(미분류). */
export function resolveDestination(
  dest: Destination,
  created: Map<string, string | null>,
): string | null {
  if (dest.kind === 'folder') return dest.folderId
  if (dest.kind === 'none') return null

  if (created.has(dest.name)) return created.get(dest.name) ?? null

  // plannedFolderNames 가 중복을 합치면서 다른 표기를 남겼을 수 있다. 표기가 달라도
  // 같은 폴더로 가야 하므로 정규화해서 다시 찾는다.
  const key = normalizeForMatch(dest.name)
  for (const [name, id] of created) {
    if (normalizeForMatch(name) === key) return id
  }

  return null
}

/**
 * 배치가 끝난 뒤 지울 자동 생성 폴더. 문서가 하나도 안 들어간 것만 고른다 —
 * "문서가 0건인 자동 생성 폴더는 지운다" 하나로 취소와 전건 실패를 같이 덮는다.
 */
export function emptyCreatedFolders(
  createdIds: string[],
  doneFolderIds: Iterable<string>,
): string[] {
  const used = new Set(doneFolderIds)
  return createdIds.filter((id) => !used.has(id))
}
