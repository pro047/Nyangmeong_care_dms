import { describe, expect, it } from 'vitest'
import {
  buildFolderTree,
  flattenFolderTree,
  folderCreateSchema,
  folderMutationFailure,
  folderPatchSchema,
  FOLDER_NAME_CONFLICT,
  FOLDER_NOT_FOUND,
  MAX_ALIAS_LENGTH,
  MAX_ALIASES_PER_FOLDER,
  normalizeAliases,
  PARENT_FOLDER_NOT_FOUND,
  type FolderRow,
} from '@/lib/folder'

describe('buildFolderTree', () => {
  it('평면 3층을 중첩 트리로 접고 각 층을 한국어 이름순으로 정렬해야 한다', () => {
    // 일부러 정렬 반대·뒤섞인 순서로 넣는다. ㄱ < ㅁ < ㅎ 순으로 나와야 한다.
    const rows: FolderRow[] = [
      { id: 'r2', name: '회의', parentId: null },
      { id: 'c2', name: '하반기', parentId: 'r1' },
      { id: 'r1', name: '계약', parentId: null },
      { id: 'g1', name: '초안', parentId: 'c1' },
      { id: 'c1', name: '상반기', parentId: 'r1' },
    ]

    const tree = buildFolderTree(rows)

    expect(tree.map((n) => n.name)).toEqual(['계약', '회의'])
    expect(tree[0].children.map((n) => n.name)).toEqual(['상반기', '하반기'])
    expect(tree[0].children[0].children.map((n) => n.name)).toEqual(['초안'])
    expect(tree[1].children).toEqual([])
  })

  it('부모가 목록에 없는 행은 하위까지 통째로 버려야 한다 (루트 승격 금지)', () => {
    // 조상이 방금 지워진 경합 상황. 고아를 루트로 올리면 없는 곳에 폴더가 생긴 것처럼 보인다.
    const rows: FolderRow[] = [
      { id: 'a', name: '남는 폴더', parentId: null },
      { id: 'x', name: '고아', parentId: 'missing' },
      { id: 'y', name: '고아의 자식', parentId: 'x' },
    ]

    const tree = buildFolderTree(rows)

    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe('a')
  })

  it('빈 입력은 빈 트리여야 한다', () => {
    expect(buildFolderTree([])).toEqual([])
  })
})

describe('flattenFolderTree', () => {
  it('깊이 우선 순서로 펴고 depth 를 정확히 붙여야 한다', () => {
    const tree = buildFolderTree([
      { id: 'r1', name: '계약', parentId: null },
      { id: 'r2', name: '회의', parentId: null },
      { id: 'c1', name: '상반기', parentId: 'r1' },
      { id: 'g1', name: '초안', parentId: 'c1' },
    ])

    const flat = flattenFolderTree(tree)

    // 깊이 우선: 계약 → 그 하위 전부 → 다음 루트(회의).
    expect(flat).toEqual([
      { id: 'r1', name: '계약', depth: 0 },
      { id: 'c1', name: '상반기', depth: 1 },
      { id: 'g1', name: '초안', depth: 2 },
      { id: 'r2', name: '회의', depth: 0 },
    ])
  })
})

describe('folderCreateSchema', () => {
  it('공백뿐인 이름은 거부해야 한다 (trim 이 min 앞)', () => {
    expect(folderCreateSchema.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('101자는 거부하고 100자는 통과해야 한다', () => {
    expect(folderCreateSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
    expect(folderCreateSchema.safeParse({ name: 'a'.repeat(100) }).success).toBe(true)
  })

  it('이름 앞뒤 공백을 잘라내야 한다', () => {
    expect(folderCreateSchema.parse({ name: ' 기획 ' }).name).toBe('기획')
  })

  it('parentId 는 생략할 수 있고, 빈 문자열이면 거부해야 한다', () => {
    const parsed = folderCreateSchema.parse({ name: '기획' })
    expect(parsed.parentId).toBeUndefined()
    expect(folderCreateSchema.safeParse({ name: '기획', parentId: 'f1' }).success).toBe(true)
    expect(folderCreateSchema.safeParse({ name: '기획', parentId: '' }).success).toBe(false)
  })
})

describe('folderPatchSchema', () => {
  it('생성과 같은 이름 규칙을 적용해야 한다', () => {
    expect(folderPatchSchema.parse({ name: ' 새 이름 ' }).name).toBe('새 이름')
    expect(folderPatchSchema.safeParse({ name: '  ' }).success).toBe(false)
    expect(folderPatchSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
  })
})

describe('normalizeAliases', () => {
  it('앞뒤 공백을 자르고 빈 항목을 버려야 한다', () => {
    expect(normalizeAliases([' 와이어프레임 ', '', '   ', 'WF'])).toEqual(['와이어프레임', 'WF'])
  })

  it('대소문자 무시 중복은 먼저 온 표기를 남겨야 한다', () => {
    expect(normalizeAliases(['Wireframe', 'wireframe', 'WIREFRAME', '기획'])).toEqual([
      'Wireframe',
      '기획',
    ])
  })
})

describe('folderCreateSchema — aliases', () => {
  it('생략하면 undefined 여야 한다', () => {
    expect(folderCreateSchema.parse({ name: '화면설계서' }).aliases).toBeUndefined()
  })

  it('보내면 정규화되어 통과해야 한다', () => {
    const parsed = folderCreateSchema.parse({
      name: '화면설계서',
      aliases: [' 와이어프레임 ', '와이어프레임', 'WF'],
    })
    expect(parsed.aliases).toEqual(['와이어프레임', 'WF'])
  })

  it('11개는 거부하고 10개는 통과해야 한다', () => {
    const eleven = Array.from({ length: MAX_ALIASES_PER_FOLDER + 1 }, (_, i) => `별칭${i}`)
    expect(folderCreateSchema.safeParse({ name: '기획', aliases: eleven }).success).toBe(false)
    expect(
      folderCreateSchema.safeParse({ name: '기획', aliases: eleven.slice(0, 10) }).success,
    ).toBe(true)
  })

  it('31자는 거부하고 30자는 통과해야 한다', () => {
    expect(
      folderCreateSchema.safeParse({ name: '기획', aliases: ['a'.repeat(MAX_ALIAS_LENGTH + 1)] })
        .success,
    ).toBe(false)
    expect(
      folderCreateSchema.safeParse({ name: '기획', aliases: ['a'.repeat(MAX_ALIAS_LENGTH)] })
        .success,
    ).toBe(true)
  })

  it('개수 검사는 정규화 뒤에 해야 한다 — 중복 때문에 11개가 된 요청은 통과', () => {
    const raw = [...Array.from({ length: 10 }, (_, i) => `별칭${i}`), ' 별칭0 ']
    expect(raw).toHaveLength(11)
    const parsed = folderCreateSchema.parse({ name: '기획', aliases: raw })
    expect(parsed.aliases).toHaveLength(10)
  })
})

describe('folderPatchSchema — aliases', () => {
  it('생략하면 undefined 여야 한다 (별칭을 건드리지 않는다는 의미)', () => {
    expect(folderPatchSchema.parse({ name: '새 이름' }).aliases).toBeUndefined()
  })

  it('보내면 정규화되어 통과하고, 11개는 거부해야 한다', () => {
    expect(
      folderPatchSchema.parse({ name: '새 이름', aliases: [' 와이어프레임 '] }).aliases,
    ).toEqual(['와이어프레임'])

    const eleven = Array.from({ length: MAX_ALIASES_PER_FOLDER + 1 }, (_, i) => `별칭${i}`)
    expect(folderPatchSchema.safeParse({ name: '새 이름', aliases: eleven }).success).toBe(false)
  })
})

describe('folderMutationFailure', () => {
  const withCode = (code: string) => Object.assign(new Error('prisma'), { code })

  it('P2002 는 409 이름 충돌이어야 한다', () => {
    expect(folderMutationFailure(withCode('P2002'))).toEqual({
      status: 409,
      error: FOLDER_NAME_CONFLICT,
    })
  })

  it('P2025 는 404 폴더 없음이어야 한다', () => {
    expect(folderMutationFailure(withCode('P2025'))).toEqual({
      status: 404,
      error: FOLDER_NOT_FOUND,
    })
  })

  it('P2003 은 404 상위 폴더 없음이어야 한다', () => {
    expect(folderMutationFailure(withCode('P2003'))).toEqual({
      status: 404,
      error: PARENT_FOLDER_NOT_FOUND,
    })
  })

  it('그 외에는 null 을 돌려 호출자가 rethrow 하게 해야 한다', () => {
    expect(folderMutationFailure(new Error('네트워크'))).toBeNull()
    expect(folderMutationFailure(withCode('P9999'))).toBeNull()
    expect(folderMutationFailure(null)).toBeNull()
    expect(folderMutationFailure(undefined)).toBeNull()
  })
})
