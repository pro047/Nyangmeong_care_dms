import { describe, expect, it } from 'vitest'
import {
  buildFolderTree,
  childFolderCards,
  descendantFolderCount,
  emptyListKind,
  flattenFolderTree,
  folderBreadcrumb,
  folderCreateSchema,
  folderDeleteWarning,
  folderMutationFailure,
  folderNameError,
  folderPatchSchema,
  folderPath,
  folderSummaryLine,
  FOLDER_NAME_CONFLICT,
  FOLDER_NOT_FOUND,
  MAX_ALIAS_LENGTH,
  MAX_ALIASES_PER_FOLDER,
  normalizeAliases,
  PARENT_FOLDER_NOT_FOUND,
  type FolderNode,
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

describe('childFolderCards', () => {
  // 직계 2개(건강기록·마이페이지) · 손자 1개 · 다른 루트의 자식 1개를 일부러 섞는다.
  const rows: FolderRow[] = [
    { id: 'r1', name: '화면설계서', parentId: null },
    { id: 'r2', name: '기능명세서', parentId: null },
    { id: 'c-mypage', name: '마이페이지', parentId: 'r1' },
    { id: 'c-health', name: '건강기록', parentId: 'r1' },
    { id: 'g-draft', name: '초안', parentId: 'c-mypage' },
    { id: 'c-community', name: '커뮤니티', parentId: 'r2' },
  ]
  const counts = new Map([
    ['c-mypage', 2],
    ['c-health', 0],
    ['g-draft', 5],
    ['c-community', 7],
  ])

  it('직계 자식만 한국어 이름순으로 돌려야 한다 — 손자와 다른 루트의 자식은 빼야 한다', () => {
    const cards = childFolderCards('r1', rows, counts)

    expect(cards).toEqual([
      { id: 'c-health', name: '건강기록', documentCount: 0 },
      { id: 'c-mypage', name: '마이페이지', documentCount: 2 },
    ])
  })

  it('자식이 없는 폴더는 빈 배열이어야 한다', () => {
    expect(childFolderCards('g-draft', rows, counts)).toEqual([])
    expect(childFolderCards('없는id', rows, counts)).toEqual([])
  })

  it('카운트 Map 에 없는 자식은 0 이어야 한다 — 예외로 화면을 죽이지 않는다', () => {
    // 카운트 조회 방식이 바뀌어 일부 폴더가 Map 에서 빠져도 카드가 그려져야 한다.
    const cards = childFolderCards('r1', rows, new Map([['c-mypage', 2]]))

    expect(cards.map((card) => card.documentCount)).toEqual([0, 2])
  })

  it('입력 배열의 순서를 바꾸지 않아야 한다 — 같은 배열을 다른 곳에서도 쓴다', () => {
    // sort 는 제자리 정렬이다. filter 로 복사하지 않고 folders.sort 로 고치면 같은 요청의
    // 업로드 셀렉트·브레드크럼이 함께 뒤집힌다.
    const before = rows.map((row) => row.id)

    childFolderCards('r1', rows, counts)

    expect(rows.map((row) => row.id)).toEqual(before)
  })
})

describe('folderBreadcrumb', () => {
  const rows: FolderRow[] = [
    { id: 'f-screen', name: '화면설계서', parentId: null },
    { id: 'f-screen-mypage', name: '마이페이지', parentId: 'f-screen' },
  ]

  it('2뎁스 폴더는 루트가 먼저 오는 조상 사슬이어야 한다', () => {
    expect(folderBreadcrumb('f-screen-mypage', rows).map((row) => row.id)).toEqual([
      'f-screen',
      'f-screen-mypage',
    ])
  })

  it('루트 폴더는 자기 자신 하나여야 한다', () => {
    expect(folderBreadcrumb('f-screen', rows).map((row) => row.name)).toEqual(['화면설계서'])
  })

  it('목록에 없는 id 는 빈 배열이어야 한다', () => {
    expect(folderBreadcrumb('ghost', rows)).toEqual([])
  })

  it('부모가 목록에 없으면 거기서 끊어야 한다 (buildFolderTree 의 고아 판단과 같다)', () => {
    const orphan: FolderRow[] = [{ id: 'x', name: '고아', parentId: 'missing' }]

    expect(folderBreadcrumb('x', orphan).map((row) => row.name)).toEqual(['고아'])
  })

  it('순환이 있어도 끝나고 방문한 두 개만 돌려야 한다 — 무한 루프면 화면이 멈춘다', () => {
    const cycle: FolderRow[] = [
      { id: 'a', name: 'A', parentId: 'b' },
      { id: 'b', name: 'B', parentId: 'a' },
    ]

    const chain = folderBreadcrumb('a', cycle)

    expect(chain).toHaveLength(2)
    expect(chain.map((row) => row.name)).toEqual(['B', 'A'])
  })
})

describe('folderPath', () => {
  const rows: FolderRow[] = [
    { id: 'f-screen', name: '화면설계서', parentId: null },
    { id: 'f-spec', name: '기능명세서', parentId: null },
    { id: 'f-screen-mypage', name: '마이페이지', parentId: 'f-screen' },
    { id: 'f-spec-mypage', name: '마이페이지', parentId: 'f-spec' },
  ]

  it('2뎁스 폴더는 "부모 > 이름" 경로여야 한다', () => {
    expect(folderPath('f-screen-mypage', rows)).toBe('화면설계서 > 마이페이지')
    // 동명이라도 부모가 다르면 경로가 다르다 — 이름만으로는 못 가리는 것이 이 함수의 존재 이유다.
    expect(folderPath('f-spec-mypage', rows)).toBe('기능명세서 > 마이페이지')
  })

  it('루트 폴더는 이름 하나여야 한다', () => {
    expect(folderPath('f-screen', rows)).toBe('화면설계서')
  })

  it('부모가 목록에 없으면 거기서 끊어야 한다 (buildFolderTree 의 고아 판단과 같다)', () => {
    const orphan: FolderRow[] = [{ id: 'x', name: '고아', parentId: 'missing' }]
    expect(folderPath('x', orphan)).toBe('고아')
  })

  it('목록에 없는 id 는 빈 문자열이어야 한다', () => {
    expect(folderPath('ghost', rows)).toBe('')
  })

  it('구분자를 바꿀 수 있어야 한다', () => {
    expect(folderPath('f-screen-mypage', rows, '/')).toBe('화면설계서/마이페이지')
  })

  it('순환이 있어도 끝나야 한다 — 무한 루프면 화면이 멈춘다', () => {
    const cycle: FolderRow[] = [
      { id: 'a', name: 'A', parentId: 'b' },
      { id: 'b', name: 'B', parentId: 'a' },
    ]
    expect(folderPath('a', cycle)).toBe('B > A')
  })

  it('folderBreadcrumb 의 이름을 이은 것과 같아야 한다 — 걷기 로직이 두 벌이면 안 된다', () => {
    // 위 6건이 folderPath 의 계약이고, 이 케이스가 두 함수가 같은 걷기를 쓰는지를 못박는다.
    const orphan: FolderRow[] = [{ id: 'x', name: '고아', parentId: 'missing' }]

    for (const [id, list] of [
      ['f-screen-mypage', rows],
      ['f-screen', rows],
      ['ghost', rows],
      ['x', orphan],
    ] as const) {
      expect(folderPath(id, list)).toBe(
        folderBreadcrumb(id, list)
          .map((row) => row.name)
          .join(' > '),
      )
    }
  })
})

describe('folderSummaryLine', () => {
  it('자식도 문서도 없으면 null 이어야 한다 — 호출부가 기존 안내 문구로 떨어진다', () => {
    expect(folderSummaryLine(0, 0)).toBeNull()
  })

  it('자식이 없으면 지금까지의 문서 수 문구 그대로여야 한다', () => {
    expect(folderSummaryLine(0, 2)).toBe('2개 문서')
  })

  it('자식만 있으면 하위 폴더 수만 보여야 한다', () => {
    expect(folderSummaryLine(3, 0)).toBe('하위 폴더 3개')
  })

  it('둘 다 있으면 가운뎃점으로 이어야 한다', () => {
    expect(folderSummaryLine(3, 2)).toBe('하위 폴더 3개 · 2개 문서')
  })
})

describe('emptyListKind', () => {
  it('자식 폴더가 있으면 필터 중이어도 children-only 여야 한다', () => {
    // 이 우선순위가 뒤집히면 카드를 그려 놓고 그 아래 "조건에 맞는 문서가 없습니다" 점선
    // 박스가 떠서 오늘 고친 빈 화면이 그대로 재현된다.
    expect(emptyListKind({ hasChildren: true, filtered: true })).toBe('children-only')
    expect(emptyListKind({ hasChildren: true, filtered: false })).toBe('children-only')
  })

  it('자식이 없고 필터 중이면 filtered 여야 한다', () => {
    expect(emptyListKind({ hasChildren: false, filtered: true })).toBe('filtered')
  })

  it('자식도 필터도 없으면 none 이어야 한다', () => {
    expect(emptyListKind({ hasChildren: false, filtered: false })).toBe('none')
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

describe('folderNameError', () => {
  it('빈 이름·공백뿐인 이름은 메시지를 돌려야 한다', () => {
    expect(folderNameError('')).toEqual(expect.any(String))
    expect(folderNameError('   ')).toEqual(expect.any(String))
  })

  it('1자와 100자는 통과(null), 101자는 메시지여야 한다', () => {
    expect(folderNameError('a')).toBeNull()
    expect(folderNameError('a'.repeat(100))).toBeNull()
    expect(folderNameError('a'.repeat(101))).toEqual(expect.any(String))
  })

  it('folderCreateSchema 와 판정이 같아야 한다 — trim 후 길이를 본다', () => {
    // 화면 가드가 통과시킨 이름이 서버에서 400 으로 튕기면(또는 그 반대) 가드의 의미가 없다.
    for (const name of ['', '   ', 'a', ` ${'a'.repeat(100)} `, 'a'.repeat(100), 'a'.repeat(101)]) {
      expect(folderNameError(name) === null).toBe(folderCreateSchema.safeParse({ name }).success)
    }
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

describe('descendantFolderCount', () => {
  const leaf = (id: string): FolderNode => ({ id, name: id, parentId: 'root', children: [] })

  it('자식이 없으면 0 이어야 한다', () => {
    expect(descendantFolderCount(leaf('a'))).toBe(0)
  })

  it('손자까지 세야 한다', () => {
    // cascade 는 재귀적이라 직계만 세면 실제로 사라지는 수보다 적게 말한다.
    const tree: FolderNode = {
      id: 'root',
      name: '화면설계서',
      parentId: null,
      children: [
        { id: 'c1', name: '마이페이지', parentId: 'root', children: [leaf('g1'), leaf('g2')] },
        leaf('c2'),
      ],
    }

    expect(descendantFolderCount(tree)).toBe(4)
  })
})

describe('folderDeleteWarning', () => {
  it('하위 폴더가 없으면 개수를 말하지 않아야 한다', () => {
    const node: FolderNode = { id: 'a', name: '기타', parentId: null, children: [] }

    expect(folderDeleteWarning(node)).toBe(
      '“기타” 폴더를 삭제합니다. 안에 있던 문서는 미분류로 남습니다.',
    )
  })

  it('하위 폴더가 있으면 총 개수를 말해야 한다', () => {
    const node: FolderNode = {
      id: 'a',
      name: '화면설계서',
      parentId: null,
      children: [
        { id: 'c1', name: '로그인', parentId: 'a', children: [
          { id: 'g1', name: '회원가입', parentId: 'c1', children: [] },
        ] },
      ],
    }

    expect(folderDeleteWarning(node)).toBe(
      '“화면설계서” 폴더와 하위 폴더 2개를 삭제합니다. 안에 있던 문서는 미분류로 남습니다.',
    )
  })
})
