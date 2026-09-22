import { describe, expect, it } from 'vitest'
import {
  documentListOrderBy,
  lastActivityAt,
  latestCandidateQuery,
  sortByLastActivity,
  supersededDocumentIds,
  type LatestCandidate,
} from '@/lib/latest'

const at = (iso: string) => new Date(iso)

/** versionIsos 를 생략하면 버전이 없는 문서(생성 시각만 있는) 다. */
const row = (
  id: string,
  folderId: string | null,
  createdAtIso: string,
  versionIsos: string[] = [],
): LatestCandidate => ({
  id,
  folderId,
  createdAt: at(createdAtIso),
  versions: versionIsos.map((iso) => ({ createdAt: at(iso) })),
})

describe('lastActivityAt', () => {
  it('버전이 있으면 최신 버전의 createdAt 이다', () => {
    const doc = row('a1', 'health', '2026-01-01', ['2026-08-20'])
    expect(lastActivityAt(doc)).toEqual(at('2026-08-20'))
  })

  it('버전이 없으면 문서의 createdAt 이다', () => {
    const doc = row('a1', 'health', '2026-01-01')
    expect(lastActivityAt(doc)).toEqual(at('2026-01-01'))
  })

  it('제목만 고친 것(버전 시각 불변)은 순서에 영향이 없다', () => {
    // title 은 LatestCandidate 에 없는 필드다 — 있어도 lastActivityAt 이 안 보는지 확인한다.
    const base = row('a1', 'health', '2026-08-01', ['2026-08-20'])
    const retitled = { ...base, title: '고친 제목' }
    expect(lastActivityAt(retitled)).toEqual(lastActivityAt(base))
  })
})

describe('sortByLastActivity', () => {
  it('오래전에 만들었지만 방금 새 버전을 올린 문서가 위로 오고 구버전으로 안 흐려진다', () => {
    const rows: LatestCandidate[] = [
      // 오래전에 만들었지만 방금 재업로드했다.
      row('old', 'health', '2026-01-01', ['2026-09-19']),
      // 최근에 만들었지만 그 뒤로 재업로드가 없다.
      row('new', 'health', '2026-08-01', ['2026-08-01']),
    ]

    expect(sortByLastActivity(rows).map((r) => r.id)).toEqual(['old', 'new'])
    expect(supersededDocumentIds(rows)).toEqual(new Set(['new']))
  })

  it('버전이 0건인 문서가 있어도 안 터진다', () => {
    const rows: LatestCandidate[] = [row('a1', 'health', '2026-08-01')]
    expect(() => sortByLastActivity(rows)).not.toThrow()
    expect(sortByLastActivity(rows)).toEqual(rows)
  })

  it('입력 순서를 뒤집어도 결과가 같다', () => {
    const rows: LatestCandidate[] = [
      row('a1', 'health', '2026-08-01', ['2026-08-20']),
      row('a2', 'health', '2026-08-02', ['2026-08-25']),
    ]

    expect(sortByLastActivity(rows)).toEqual(sortByLastActivity([...rows].reverse()))
  })

  it('같은 시각이면 id 오름차순이 앞선다 — isNewer 와 같은 타이브레이크다', () => {
    const rows: LatestCandidate[] = [
      row('b', 'health', '2026-08-31', ['2026-08-31']),
      row('a', 'health', '2026-08-31', ['2026-08-31']),
    ]

    expect(sortByLastActivity(rows).map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('supersededDocumentIds', () => {
  it('폴더마다 최신 하나만 빼고 나머지를 골라야 한다', () => {
    const rows: LatestCandidate[] = [
      row('a1', 'health', '2026-08-25'),
      row('a2', 'health', '2026-08-31'),
      row('a3', 'health', '2026-08-26'),
      row('b1', 'login', '2026-07-01'),
    ]

    expect(supersededDocumentIds(rows)).toEqual(new Set(['a1', 'a3']))
  })

  it('폴더에 문서가 1건뿐이면 아무것도 고르지 않아야 한다', () => {
    const rows: LatestCandidate[] = [
      row('a1', 'health', '2026-08-25'),
      row('b1', 'login', '2026-07-01'),
      row('n1', null, '2026-06-01'),
    ]

    expect(supersededDocumentIds(rows)).toEqual(new Set())
  })

  it('폴더가 다르면 서로 비교하지 않아야 한다', () => {
    const rows: LatestCandidate[] = [
      row('a1', 'health', '2026-08-25'),
      row('a2', 'health', '2026-08-26'),
      row('b1', 'login', '2026-01-01'),
      row('b2', 'login', '2026-01-02'),
    ]

    expect(supersededDocumentIds(rows)).toEqual(new Set(['a1', 'b1']))
  })

  it('입력 순서에 의존하지 않아야 한다', () => {
    const rows: LatestCandidate[] = [
      row('a1', 'health', '2026-08-31'),
      row('a2', 'health', '2026-08-25'),
    ]

    expect(supersededDocumentIds(rows)).toEqual(supersededDocumentIds([...rows].reverse()))
  })

  it('같은 시각이면 id 로 갈라 정확히 한 건만 최신으로 남겨야 한다', () => {
    const rows: LatestCandidate[] = [
      row('b', 'health', '2026-08-31'),
      row('a', 'health', '2026-08-31'),
    ]

    expect(supersededDocumentIds(rows)).toEqual(new Set(['b']))
  })

  it('미분류 문서는 서로 비교하지 않아야 한다', () => {
    // 자동 분류가 두 번 실패해 회의록과 예산안이 둘 다 미분류로 떨어진 상황.
    // 아무 관계가 없으므로 먼저 올린 쪽을 구버전으로 몰면 안 된다.
    const rows: LatestCandidate[] = [row('meeting', null, '2026-08-20'), row('budget', null, '2026-08-21')]

    expect(supersededDocumentIds(rows)).toEqual(new Set())
  })

  it('미분류 문서가 폴더 안 문서의 판정을 흔들지 않아야 한다', () => {
    // 미분류를 2건 넣는 것이 요점이다 — 1건이면 옛 구현(folderId ?? '')에서도 그 문서가
    // 혼자라 최신으로 남아 결과가 같아서, 회귀를 못 잡는 테스트가 된다.
    const rows: LatestCandidate[] = [
      row('n1', null, '2026-09-01'),
      row('n2', null, '2026-08-15'),
      row('f1', 'health', '2026-08-20'),
      row('f2', 'health', '2026-08-21'),
    ]

    // 미분류가 전체에서 제일 최신이어도 health 그룹 판정에는 안 끼어들고,
    // 미분류끼리도 서로 비교하지 않는다.
    expect(supersededDocumentIds(rows)).toEqual(new Set(['f1']))
  })

  it('빈 목록이면 빈 집합이어야 한다', () => {
    expect(supersededDocumentIds([])).toEqual(new Set())
  })

  it('재업로드로 새 버전만 올라온 문서는 더 새 판이 있는 쪽에 구버전 표시가 붙는다', () => {
    // f1 은 오래전에 만들었지만 방금 재업로드했다. f2 는 만든 지 얼마 안 됐지만
    // 그 뒤로 재업로드가 없다 — createdAt 만 보면 f2 가 최신이지만 실제로는 f1 이다.
    const rows: LatestCandidate[] = [
      row('f1', 'health', '2026-01-01', ['2026-09-19']),
      row('f2', 'health', '2026-08-01', ['2026-08-01']),
    ]

    expect(supersededDocumentIds(rows)).toEqual(new Set(['f2']))
  })
})

describe('latestCandidateQuery', () => {
  it('휴지통 문서를 비교 대상에서 빼야 한다', () => {
    expect(latestCandidateQuery().where).toEqual({ deletedAt: null })
  })

  it('구버전 판정에 최신 버전 1건의 createdAt 을 같은 조회에서 함께 읽어야 한다', () => {
    // 쿼리를 늘리지 않는다 — 관계로 얹는지(별도 findMany 가 아닌지)를 select 모양으로 본다.
    expect(latestCandidateQuery().select.versions).toEqual({
      orderBy: { versionNo: 'desc' },
      take: 1,
      select: { createdAt: true },
    })
  })
})

describe('documentListOrderBy', () => {
  it('최근 올린 순이어야 한다 — DB 조회의 안정적인 기본 순서다', () => {
    expect(documentListOrderBy()).toEqual({ createdAt: 'desc' })
  })

  // 예전에는 "목록 정렬은 구버전 판정과 같은 컬럼을 봐야 한다"를 documentListOrderBy 의 키가
  // latestCandidateQuery 의 select 키에 포함되는지로 확인했다. 2026-09-20 부로 실제 화면
  // 순서는 documentListOrderBy(DB) 가 아니라 sortByLastActivity(JS) 가 정하므로, 같은
  // 불변식("표시·정렬·판정이 같은 값을 본다")을 새 구조로 확인한다: 같은 폴더 안에서
  // sortByLastActivity 가 맨 위에 두는 문서는 supersededDocumentIds 가 구버전으로 고르면
  // 안 된다.
  it('같은 폴더 안에서 정렬 1등은 구버전 판정에서 빠져야 한다', () => {
    const rows: LatestCandidate[] = [
      row('a1', 'health', '2026-01-01', ['2026-08-20']),
      row('a2', 'health', '2026-01-02', ['2026-08-25']),
      row('b1', 'login', '2026-02-01'),
    ]

    const sortedInHealth = sortByLastActivity(rows).filter((r) => r.folderId === 'health')
    const superseded = supersededDocumentIds(rows)

    expect(superseded.has(sortedInHealth[0].id)).toBe(false)
  })
})
