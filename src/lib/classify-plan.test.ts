import { describe, expect, it } from 'vitest'
import {
  createPlannedFolders,
  defaultDestination,
  emptyCreatedFolders,
  plannedFolderNames,
  resolveDestination,
  type Destination,
  type FolderCreateOutcome,
} from '@/lib/classify-plan'
import { REASON_NO_MATCH, REASON_PROPOSE } from '@/lib/classify'

describe('defaultDestination', () => {
  it('match → 그 폴더, propose → 새 폴더, unclassified → 미분류여야 한다', () => {
    expect(
      defaultDestination({ kind: 'match', folderId: 'f-1', reason: "'화면설계서' 일치" }),
    ).toEqual({ kind: 'folder', folderId: 'f-1' })

    expect(
      defaultDestination({ kind: 'propose', proposedName: 'IA 구조도', reason: REASON_PROPOSE }),
    ).toEqual({ kind: 'new', name: 'IA 구조도' })

    expect(defaultDestination({ kind: 'unclassified', reason: REASON_NO_MATCH })).toEqual({
      kind: 'none',
    })
  })
})

describe('plannedFolderNames', () => {
  it('정규화 기준으로 같은 이름은 하나로 합치고 먼저 나온 표시형을 남겨야 한다', () => {
    // 제안 이름이 같은 파일들이 한 폴더로 가야 한다 — 표기가 달라도 하나만 만든다.
    const destinations: Destination[] = [
      { kind: 'new', name: 'IA 구조도' },
      { kind: 'new', name: 'IA구조도' },
      { kind: 'new', name: 'ia 구조도' },
      { kind: 'new', name: '와이어프레임' },
    ]

    expect(plannedFolderNames(destinations)).toEqual(['IA 구조도', '와이어프레임'])
  })

  it('기존 폴더·미분류 목적지는 무시해야 한다', () => {
    const destinations: Destination[] = [
      { kind: 'folder', folderId: 'f-1' },
      { kind: 'none' },
      { kind: 'new', name: '회의록' },
    ]

    expect(plannedFolderNames(destinations)).toEqual(['회의록'])
    expect(plannedFolderNames([])).toEqual([])
  })
})

describe('createPlannedFolders', () => {
  it('성공하면 이름 → id 로 매핑해야 한다', async () => {
    const created = await createPlannedFolders(['가', '나'], async (name) => ({
      ok: true,
      id: `id-${name}`,
    }))

    expect(created).toEqual(
      new Map([
        ['가', 'id-가'],
        ['나', 'id-나'],
      ]),
    )
  })

  it('conflict(409)는 null 로 남기고 나머지는 계속 만들어야 한다', async () => {
    const outcomes: Record<string, FolderCreateOutcome> = {
      가: { ok: false, conflict: true },
      나: { ok: true, id: 'id-나' },
    }
    const created = await createPlannedFolders(['가', '나'], async (name) => outcomes[name])

    expect(created).toEqual(
      new Map<string, string | null>([
        ['가', null],
        ['나', 'id-나'],
      ]),
    )
  })

  it('예외가 나도 null 로 남기고 나머지는 계속 만들어야 한다', async () => {
    const created = await createPlannedFolders(['가', '나'], async (name) => {
      if (name === '가') throw new Error('네트워크')
      return { ok: true, id: 'id-나' }
    })

    expect(created).toEqual(
      new Map<string, string | null>([
        ['가', null],
        ['나', 'id-나'],
      ]),
    )
  })

  it('순차로 만들어야 한다 — 앞 생성이 끝난 뒤에 다음이 시작된다', async () => {
    // 동시 생성이 없어야 조용한 중복 루트 폴더가 원리상 생기지 않는다.
    const events: string[] = []
    await createPlannedFolders(['가', '나'], async (name) => {
      events.push(`시작 ${name}`)
      await Promise.resolve()
      events.push(`끝 ${name}`)
      return { ok: true, id: `id-${name}` }
    })

    expect(events).toEqual(['시작 가', '끝 가', '시작 나', '끝 나'])
  })
})

describe('resolveDestination', () => {
  const created = new Map<string, string | null>([
    ['IA 구조도', 'id-ia'],
    ['실패한 폴더', null],
  ])

  it('기존 폴더 목적지는 그 folderId 여야 한다', () => {
    expect(resolveDestination({ kind: 'folder', folderId: 'f-1' }, created)).toBe('f-1')
  })

  it('미분류 목적지는 null 이어야 한다', () => {
    expect(resolveDestination({ kind: 'none' }, created)).toBeNull()
  })

  it('생성 성공한 새 폴더는 그 id, 실패한 새 폴더는 null(미분류 폴백)이어야 한다', () => {
    expect(resolveDestination({ kind: 'new', name: 'IA 구조도' }, created)).toBe('id-ia')
    expect(resolveDestination({ kind: 'new', name: '실패한 폴더' }, created)).toBeNull()
  })

  it('표기가 달라도 정규화가 같으면 합쳐진 폴더의 id 를 찾아야 한다', () => {
    // plannedFolderNames 가 중복을 합치면서 다른 표기를 남긴 경우의 폴백 경로.
    expect(resolveDestination({ kind: 'new', name: 'IA구조도' }, created)).toBe('id-ia')
    expect(resolveDestination({ kind: 'new', name: 'ia 구조도' }, created)).toBe('id-ia')
  })

  it('맵 어디에도 없는 이름은 null 이어야 한다', () => {
    expect(resolveDestination({ kind: 'new', name: '없는 이름' }, created)).toBeNull()
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
