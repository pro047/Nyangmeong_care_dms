import { describe, expect, it } from 'vitest'
import {
  documentMatchKey,
  findSimilarDocuments,
  similarCandidateQuery,
  toSimilarCandidates,
  type SimilarCandidate,
} from '@/lib/similar-document'
import type { DeletePermission } from '@/lib/ownership'

const OWNER: DeletePermission = { viewerId: 'user_1', isAdmin: false }
const FOLDER = 'folder_screen_main'

function candidate(latestFileName: string, over: Partial<SimilarCandidate> = {}): SimilarCandidate {
  return {
    id: `doc_${latestFileName}`,
    folderId: FOLDER,
    createdById: 'user_1',
    latestFileName,
    ...over,
  }
}

describe('documentMatchKey', () => {
  it('판번호·날짜·순번 접두가 달라도 같은 키를 내야 한다', () => {
    // 운영에서 실제로 갈려 있는 짝 (2026-09-08).
    expect(documentMatchKey('03_메인페이지_화면설계서_v0.3_20260819.html')).toBe(
      documentMatchKey('03_메인페이지_화면설계서_v0.6_20260826.html'),
    )
  })

  it('구분자·괄호·전각대시가 섞여도 같은 키를 내야 한다', () => {
    expect(documentMatchKey('냥멍케어 화면설계서 — 건강기록 (HLT) v0.2.html')).toBe(
      documentMatchKey('냥멍케어_화면설계서_건강기록_HLT_v0.3.html'),
    )
  })

  it('공백 유무가 갈려도 같은 키를 내야 한다', () => {
    expect(documentMatchKey('01_요구사항 정의서_v0.3_2026_08_17.xlsx')).toBe(
      documentMatchKey('01_요구사항정의서_v0.5_2026_09_06.xlsx'),
    )
  })

  it('문서 종류가 다르면 다른 키여야 한다 — 이게 오탐을 막는 자리다', () => {
    expect(documentMatchKey('03_메인페이지_화면설계서_v0.6_20260826.html')).not.toBe(
      documentMatchKey('03_메인페이지_기능_명세서_v0.2_20260826.xlsx'),
    )
  })

  it('키가 너무 짧으면 null 이어야 한다 — 아무 문서나 서로의 새 판이 되면 안 된다', () => {
    expect(documentMatchKey('v0.1.html')).toBeNull()
    expect(documentMatchKey('A.html')).toBeNull()
  })

  it('토큰 순서가 뒤집혀도 같은 키여야 한다', () => {
    // 운영에 실제로 있는 짝 (2026-09-09). 정렬하지 않으면 가장 최신인 v0.5 를 놓친다.
    expect(documentMatchKey('03_건강기록_화면설계서_HLT_v0_5_2026-08-31.html')).toBe(
      documentMatchKey('냥멍케어_화면설계서_건강기록_HLT_v0.3.html'),
    )
  })

  it('말미 코드가 다르면 다른 키여야 한다 — 폴더 이름과 달리 여기서는 구별의 근거다', () => {
    expect(documentMatchKey('04_건강기록_와이어프레임_HLT_v0_2b.html')).not.toBe(
      documentMatchKey('04_건강기록_와이어프레임_PAY_v0_1.html'),
    )
  })

  it('이름이 짧아도 말미 코드가 다르면 갈라야 한다', () => {
    // 말미 코드를 떼면 둘 다 'wf' 가 되어 서로의 새 판이 된다.
    expect(documentMatchKey('WF_HLT.html')).not.toBe(documentMatchKey('WF_ABC.html'))
  })

  it('판번호 뒤에 날짜가 붙어도 키에 흘리지 않아야 한다', () => {
    // minor 에 상한이 없으면 `v1_2026` 이 통째로 먹혀 `_08_17` 잔해가 키에 남는다.
    expect(documentMatchKey('03_메인페이지_화면설계서_v1_2026_08_17.html')).toBe(
      documentMatchKey('03_메인페이지_화면설계서_v1.0_2026_08_26.html'),
    )
  })
})

describe('similarCandidateQuery', () => {
  it('조회하면 휴지통을 빼야 한다 — 호출부에 맡기면 언젠가 빠진다', () => {
    expect(similarCandidateQuery().where).toEqual({ deletedAt: null })
  })

  it('조회하면 최신 1건만 조인해야 한다', () => {
    const { select } = similarCandidateQuery()

    expect(select.versions.orderBy).toEqual({ versionNo: 'desc' })
    expect(select.versions.take).toBe(1)
    expect(select.createdById).toBe(true)
  })
})

describe('toSimilarCandidates', () => {
  it('버전이 없는 문서는 빼야 한다 — 비교할 파일명이 없다', () => {
    const rows = [
      { id: 'a', folderId: 'f', createdById: 'u', versions: [{ fileName: 'a_v0.1.html' }] },
      { id: 'b', folderId: 'f', createdById: 'u', versions: [] },
    ]

    expect(toSimilarCandidates(rows)).toEqual([
      { id: 'a', folderId: 'f', createdById: 'u', latestFileName: 'a_v0.1.html' },
    ])
  })
})

describe('findSimilarDocuments', () => {
  it('같은 폴더에 같은 키가 있으면 후보로 찾아야 한다', () => {
    const existing = candidate('03_메인페이지_화면설계서_v0.6_20260826.html')

    const found = findSimilarDocuments(
      '03_메인페이지_화면설계서_v0.7_20260908.html',
      FOLDER,
      [existing, candidate('03_메인페이지_기능_명세서_v0.2_20260826.xlsx')],
      OWNER,
    )

    expect(found).toEqual([existing])
  })

  it('폴더가 다르면 후보에서 빼야 한다', () => {
    const found = findSimilarDocuments(
      '03_메인페이지_화면설계서_v0.7.html',
      FOLDER,
      [candidate('03_메인페이지_화면설계서_v0.6.html', { folderId: 'folder_other' })],
      OWNER,
    )

    expect(found).toEqual([])
  })

  it('미분류면 판정하지 않아야 한다 — 공통점이 "아직 분류를 안 했다" 뿐이다', () => {
    const found = findSimilarDocuments(
      '03_메인페이지_화면설계서_v0.7.html',
      null,
      [candidate('03_메인페이지_화면설계서_v0.6.html', { folderId: null })],
      OWNER,
    )

    expect(found).toEqual([])
  })

  it('남이 올린 문서면 후보에서 빼야 한다 — 제안해도 누르면 403 이다', () => {
    const found = findSimilarDocuments(
      '03_메인페이지_화면설계서_v0.7.html',
      FOLDER,
      [candidate('03_메인페이지_화면설계서_v0.6.html', { createdById: 'user_2' })],
      OWNER,
    )

    expect(found).toEqual([])
  })

  it('관리자면 남의 문서도 후보여야 한다', () => {
    const others = candidate('03_메인페이지_화면설계서_v0.6.html', { createdById: 'user_2' })

    const found = findSimilarDocuments('03_메인페이지_화면설계서_v0.7.html', FOLDER, [others], {
      viewerId: 'user_1',
      isAdmin: true,
    })

    expect(found).toEqual([others])
  })

  it('후보가 여럿이면 판번호가 높은 순으로 돌려줘야 한다 — 첫 원소가 현재 최신이다', () => {
    // 운영의 요구사항정의서 폴더는 3판이 별개 문서로 갈려 있다.
    const v03 = candidate('01_요구사항 정의서_v0.3_2026_08_17.xlsx')
    const v04 = candidate('01_요구사항정의서_v0_4_2026_08_31.xlsx')
    const v05 = candidate('01_요구사항정의서_v0.5_2026_09_06.xlsx')

    const found = findSimilarDocuments(
      '01_요구사항정의서_v0.6_2026_09_09.xlsx',
      FOLDER,
      [v03, v05, v04],
      OWNER,
    )

    expect(found.map((row) => row.latestFileName)).toEqual([
      v05.latestFileName,
      v04.latestFileName,
      v03.latestFileName,
    ])
  })

  it('후보에 판번호가 없으면 뒤로 밀어야 한다', () => {
    const labelled = candidate('06_로그인_회원가입_와이어프레임_v0.2_260826.html')
    const bare = candidate('06_로그인_회원가입_와이어프레임.html')

    const found = findSimilarDocuments(
      '06_로그인_회원가입_와이어프레임_v0.3_260909.html',
      FOLDER,
      [bare, labelled],
      OWNER,
    )

    expect(found.map((row) => row.latestFileName)).toEqual([
      labelled.latestFileName,
      bare.latestFileName,
    ])
  })

  it('올리는 파일의 키가 너무 짧으면 아무것도 제안하지 않아야 한다', () => {
    const found = findSimilarDocuments('v0.1.html', FOLDER, [candidate('v0.2.html')], OWNER)

    expect(found).toEqual([])
  })
})
