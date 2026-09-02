import { describe, expect, it } from 'vitest'
import {
  createPlannedFolders,
  defaultDestination,
  destKey,
  emptyCreatedFolders,
  findExistingFolderByName,
  plannedFolders,
  resolveDestination,
  type Destination,
  type FolderCreateOutcome,
} from '@/lib/classify-plan'
import {
  classifyFileName,
  REASON_NO_MATCH,
  REASON_PROPOSE,
  type ClassifyFolder,
} from '@/lib/classify'

describe('생성 폴더는 항상 잎이다 (확정 규칙 6 불변식)', () => {
  // 새 루트 카테고리는 자식 제안을 받을 수 없고, 새 하위 폴더의 부모는 반드시 기존 폴더다.
  // 이게 깨지면 emptyCreatedFolders 가 부모를 먼저 지워 Cascade 로 자식까지 사라진다.
  const roots: ClassifyFolder[] = [
    { id: 'f-req', name: '요구사항정의서', parentId: null, aliases: [] },
    { id: 'f-spec', name: '기능명세서', parentId: null, aliases: [] },
    { id: 'f-screen', name: '화면설계서', parentId: null, aliases: ['와이어프레임'] },
  ]
  const files = [
    '02_IA 구조도_v0.2_2026_08_17.xlsx',
    '03_마이페이지_화면설계서_v0_3_260817.html',
    '04_기능명세서_마이페이지_v0.1_260826.xlsx',
    '06_로그인_회원가입_와이어프레임.html',
    '01_요구사항 정의서_v0.3_2026_08_17.xlsx',
  ]

  it('한 배치의 새 폴더 부모는 전부 null 이거나 기존 폴더 id 여야 한다', () => {
    const dests = files.map((f) => defaultDestination(classifyFileName(f, roots)))
    const plans = plannedFolders(dests)
    const existing = new Set(roots.map((r) => r.id))

    // 루트 제안 1건(IA 구조도) + 하위 제안 3건이 계획에 들어야 검사가 의미 있다.
    expect(plans).toHaveLength(4)
    for (const plan of plans) {
      expect(plan.parentId === null || existing.has(plan.parentId)).toBe(true)
    }
  })

  it('새 루트 제안의 key 를 부모로 삼는 계획은 있을 수 없다', () => {
    const dests = files.map((f) => defaultDestination(classifyFileName(f, roots)))
    const plans = plannedFolders(dests)
    const newRootKeys = new Set(plans.filter((p) => p.parentId === null).map((p) => p.key))

    expect(newRootKeys.size).toBeGreaterThan(0)
    for (const plan of plans) {
      if (plan.parentId === null) continue
      expect(newRootKeys.has(plan.parentId)).toBe(false)
    }
  })

  it('새 루트 제안 파일은 루트가 없는 한 몇 번 분류해도 2뎁스 제안이 되지 않아야 한다', () => {
    const result = classifyFileName('02_IA 구조도_v0.2_2026_08_17.xlsx', roots)
    expect(result).toEqual({
      kind: 'propose',
      parentId: null,
      proposedName: 'IA 구조도',
      reason: REASON_PROPOSE,
    })
  })
})

describe('defaultDestination', () => {
  it('match → 그 폴더, propose → 새 폴더, unclassified → 미분류여야 한다', () => {
    expect(
      defaultDestination({ kind: 'match', folderId: 'f-1', reason: "'화면설계서' 일치" }),
    ).toEqual({ kind: 'folder', folderId: 'f-1' })

    expect(
      defaultDestination({
        kind: 'propose',
        parentId: null,
        proposedName: 'IA 구조도',
        reason: REASON_PROPOSE,
      }),
    ).toEqual({ kind: 'new', parentId: null, name: 'IA 구조도' })

    expect(
      defaultDestination({
        kind: 'propose',
        parentId: 'f-screen',
        proposedName: '마이페이지',
        reason: REASON_PROPOSE,
      }),
    ).toEqual({ kind: 'new', parentId: 'f-screen', name: '마이페이지' })

    expect(defaultDestination({ kind: 'unclassified', reason: REASON_NO_MATCH })).toEqual({
      kind: 'none',
    })
  })
})

describe('plannedFolders', () => {
  it('같은 부모 밑에서 정규화가 같은 이름은 하나로 합치고 먼저 나온 표시형을 남겨야 한다', () => {
    // 제안 이름이 같은 파일들이 한 폴더로 가야 한다 — 표기가 달라도 하나만 만든다.
    const destinations: Destination[] = [
      { kind: 'new', parentId: null, name: 'IA 구조도' },
      { kind: 'new', parentId: null, name: 'IA구조도' },
      { kind: 'new', parentId: null, name: 'ia 구조도' },
      { kind: 'new', parentId: null, name: '와이어프레임' },
    ]

    expect(plannedFolders(destinations)).toEqual([
      { key: destKey(null, 'IA 구조도'), parentId: null, name: 'IA 구조도' },
      { key: destKey(null, '와이어프레임'), parentId: null, name: '와이어프레임' },
    ])
  })

  it('부모가 다른 동명은 합치지 않아야 한다', () => {
    // 실데이터에 `화면설계서 > 마이페이지` 와 `기능명세서 > 마이페이지` 가 동시에 있다.
    const destinations: Destination[] = [
      { kind: 'new', parentId: 'f-screen', name: '마이페이지' },
      { kind: 'new', parentId: 'f-spec', name: '마이페이지' },
    ]

    expect(plannedFolders(destinations)).toHaveLength(2)
  })

  it('기존 폴더·미분류 목적지는 무시해야 한다', () => {
    const destinations: Destination[] = [
      { kind: 'folder', folderId: 'f-1' },
      { kind: 'none' },
      { kind: 'new', parentId: null, name: '회의록' },
    ]

    expect(plannedFolders(destinations)).toEqual([
      { key: destKey(null, '회의록'), parentId: null, name: '회의록' },
    ])
    expect(plannedFolders([])).toEqual([])
  })
})

describe('findExistingFolderByName', () => {
  const folders: ClassifyFolder[] = [
    { id: 'f-req', name: '요구사항정의서', parentId: null, aliases: [] },
    { id: 'f-screen', name: '화면설계서', parentId: null, aliases: ['와이어프레임'] },
  ]

  it('이름 정확일치면 그 폴더 id 여야 한다', () => {
    expect(findExistingFolderByName('화면설계서', null, folders)).toBe('f-screen')
  })

  it('표기(공백·NFD·대소문자)가 달라도 정규화가 같으면 같은 폴더여야 한다', () => {
    // 이게 없으면 `요구사항 정의서` 로 고칠 때 유사 중복 폴더가 조용히 생긴다.
    expect(findExistingFolderByName('요구사항 정의서', null, folders)).toBe('f-req')
    expect(findExistingFolderByName('요구사항 정의서'.normalize('NFD'), null, folders)).toBe(
      'f-req',
    )

    const ia: ClassifyFolder[] = [{ id: 'f-ia', name: 'IA구조도', parentId: null, aliases: [] }]
    expect(findExistingFolderByName('ia 구조도', null, ia)).toBe('f-ia')
  })

  it('별칭과 일치해도 그 폴더로 가야 한다 — 분류기의 별칭 의미론과 같다', () => {
    expect(findExistingFolderByName('와이어프레임', null, folders)).toBe('f-screen')
  })

  it('부모가 다른 동명이 2개여도 그 부모 밑에서는 흡수해야 한다', () => {
    // 부모 스코프가 없으면 matched.size 가 2 가 되어 흡수 자체가 죽는다.
    const dup: ClassifyFolder[] = [
      { id: 'f-a', name: '마이페이지', parentId: 'f-screen', aliases: [] },
      { id: 'f-b', name: '마이페이지', parentId: 'f-spec', aliases: [] },
    ]
    expect(findExistingFolderByName('마이페이지', 'f-screen', dup)).toBe('f-a')
    expect(findExistingFolderByName('마이페이지', 'f-spec', dup)).toBe('f-b')
    // 루트에는 그 이름이 없다.
    expect(findExistingFolderByName('마이페이지', null, dup)).toBeNull()
  })

  it('같은 부모 밑 동명 폴더 2개면 null — 고를 수 없으면 흡수하지 않는다', () => {
    const dup: ClassifyFolder[] = [
      { id: 'f-a', name: '설계서', parentId: null, aliases: [] },
      { id: 'f-b', name: '설계서', parentId: null, aliases: [] },
    ]
    expect(findExistingFolderByName('설계서', null, dup)).toBeNull()
  })

  it('한 폴더가 이름·별칭 양쪽으로 걸리면 그 폴더 id 여야 한다 (모호 아님)', () => {
    const both: ClassifyFolder[] = [
      { id: 'f-x', name: '화면설계서', parentId: null, aliases: ['화면 설계서'] },
    ]
    expect(findExistingFolderByName('화면 설계서', null, both)).toBe('f-x')
  })

  it('아무것도 안 걸리면 null 이어야 한다', () => {
    expect(findExistingFolderByName('회의록', null, folders)).toBeNull()
    expect(findExistingFolderByName('화면설계서', null, [])).toBeNull()
  })

  it('부분 문자열은 안 걸린다 — 설계 가 화면설계서 에 흡수되면 안 된다', () => {
    // classifyFileName 의 부분 매칭과 다른 정확일치임을 못박는다 — 이 값은 파일명이
    // 아니라 사람이 폴더 이름으로 직접 적은 것이다.
    expect(findExistingFolderByName('설계', null, folders)).toBeNull()
    expect(findExistingFolderByName('화면설계서 초안', null, folders)).toBeNull()
  })

  it('정규화하면 비는 이름(공백·기호뿐)은 null 이어야 한다', () => {
    expect(findExistingFolderByName('   ', null, folders)).toBeNull()
    expect(findExistingFolderByName('()', null, folders)).toBeNull()
  })
})

describe('createPlannedFolders', () => {
  const plan = (parentId: string | null, name: string) => ({
    key: destKey(parentId, name),
    parentId,
    name,
  })

  it('성공하면 key → id 로 매핑해야 한다', async () => {
    const created = await createPlannedFolders(
      [plan(null, '가'), plan('f-screen', '나')],
      async (parentId, name) => ({ ok: true, id: `id-${parentId ?? '루트'}-${name}` }),
    )

    expect(created).toEqual(
      new Map([
        [destKey(null, '가'), 'id-루트-가'],
        [destKey('f-screen', '나'), 'id-f-screen-나'],
      ]),
    )
  })

  it('conflict(409)는 null 로 남기고 나머지는 계속 만들어야 한다', async () => {
    const outcomes: Record<string, FolderCreateOutcome> = {
      가: { ok: false, conflict: true },
      나: { ok: true, id: 'id-나' },
    }
    const created = await createPlannedFolders(
      [plan(null, '가'), plan(null, '나')],
      async (_parentId, name) => outcomes[name],
    )

    expect(created).toEqual(
      new Map<string, string | null>([
        [destKey(null, '가'), null],
        [destKey(null, '나'), 'id-나'],
      ]),
    )
  })

  it('예외가 나도 null 로 남기고 나머지는 계속 만들어야 한다', async () => {
    const created = await createPlannedFolders(
      [plan(null, '가'), plan(null, '나')],
      async (_parentId, name) => {
        if (name === '가') throw new Error('네트워크')
        return { ok: true, id: 'id-나' }
      },
    )

    expect(created).toEqual(
      new Map<string, string | null>([
        [destKey(null, '가'), null],
        [destKey(null, '나'), 'id-나'],
      ]),
    )
  })

  it('순차로 만들어야 한다 — 앞 생성이 끝난 뒤에 다음이 시작된다', async () => {
    // 동시 생성이 없어야 조용한 중복 루트 폴더가 원리상 생기지 않는다.
    const events: string[] = []
    await createPlannedFolders(
      [plan(null, '가'), plan(null, '나')],
      async (_parentId, name) => {
        events.push(`시작 ${name}`)
        await Promise.resolve()
        events.push(`끝 ${name}`)
        return { ok: true, id: `id-${name}` }
      },
    )

    expect(events).toEqual(['시작 가', '끝 가', '시작 나', '끝 나'])
  })
})

describe('resolveDestination', () => {
  const created = new Map<string, string | null>([
    [destKey(null, 'IA 구조도'), 'id-ia'],
    [destKey('f-screen', '마이페이지'), 'id-mypage'],
    [destKey(null, '실패한 폴더'), null],
  ])

  it('기존 폴더 목적지는 그 folderId 여야 한다', () => {
    expect(resolveDestination({ kind: 'folder', folderId: 'f-1' }, created)).toBe('f-1')
  })

  it('미분류 목적지는 null 이어야 한다', () => {
    expect(resolveDestination({ kind: 'none' }, created)).toBeNull()
  })

  it('생성 성공한 새 폴더는 그 id, 실패한 새 폴더는 null(미분류 폴백)이어야 한다', () => {
    expect(resolveDestination({ kind: 'new', parentId: null, name: 'IA 구조도' }, created)).toBe(
      'id-ia',
    )
    expect(
      resolveDestination({ kind: 'new', parentId: 'f-screen', name: '마이페이지' }, created),
    ).toBe('id-mypage')
    expect(
      resolveDestination({ kind: 'new', parentId: null, name: '실패한 폴더' }, created),
    ).toBeNull()
  })

  it('표기가 달라도 정규화가 같으면 합쳐진 폴더의 id 를 찾아야 한다', () => {
    // plannedFolders 가 중복을 합치면서 다른 표기를 남긴 경우 — 키가 정규화를 품고 있다.
    expect(resolveDestination({ kind: 'new', parentId: null, name: 'IA구조도' }, created)).toBe(
      'id-ia',
    )
    expect(resolveDestination({ kind: 'new', parentId: null, name: 'ia 구조도' }, created)).toBe(
      'id-ia',
    )
  })

  it('부모가 다르면 같은 이름이라도 null 이어야 한다', () => {
    expect(
      resolveDestination({ kind: 'new', parentId: 'f-spec', name: '마이페이지' }, created),
    ).toBeNull()
  })

  it('맵 어디에도 없는 이름은 null 이어야 한다', () => {
    expect(
      resolveDestination({ kind: 'new', parentId: null, name: '없는 이름' }, created),
    ).toBeNull()
  })
})

describe('emptyCreatedFolders', () => {
  it('문서가 하나도 안 들어간 자동 생성 폴더만 골라야 한다', () => {
    // done 쪽의 f-기존 은 자동 생성이 아니므로 결과에 영향이 없어야 한다.
    expect(emptyCreatedFolders(['a', 'b', 'c'], ['b', 'f-기존'])).toEqual(['a', 'c'])
  })

  it('전건 취소(문서 0건)면 만든 폴더 전부를 돌려야 한다', () => {
    expect(emptyCreatedFolders(['a', 'b'], [])).toEqual(['a', 'b'])
  })

  it('전부 쓰였으면 빈 배열이어야 한다 — 문서가 든 폴더는 절대 지우지 않는다', () => {
    expect(emptyCreatedFolders(['a', 'b'], ['a', 'b'])).toEqual([])
  })
})
