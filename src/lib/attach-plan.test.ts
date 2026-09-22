import { describe, expect, it } from 'vitest'
import { attachDefault, attachVersionWarning, uploadTarget } from '@/lib/attach-plan'
import type { SimilarCandidate } from '@/lib/similar-document'

const FOLDER = 'folder_screen_main'

function candidate(
  id: string,
  latestFileName: string,
  latestVersionCreatedAt = '2026-08-01',
): SimilarCandidate {
  return {
    id,
    folderId: FOLDER,
    createdById: 'user_1',
    latestFileName,
    latestVersionCreatedAt: new Date(latestVersionCreatedAt),
  }
}

describe('uploadTarget', () => {
  const candidates = [candidate('doc_1', '03_메인페이지_화면설계서_v0.6.html')]

  it('고른 후보가 목록에 있으면 붙이기다', () => {
    expect(uploadTarget('doc_1', FOLDER, candidates)).toEqual({
      kind: 'attach',
      documentId: 'doc_1',
    })
  })

  it('아무것도 안 골랐으면 그 폴더의 새 문서다', () => {
    expect(uploadTarget(undefined, FOLDER, candidates)).toEqual({
      kind: 'new',
      folderId: FOLDER,
    })
  })

  it('미분류는 folderId 가 null 인 새 문서다', () => {
    expect(uploadTarget(undefined, null, [])).toEqual({ kind: 'new', folderId: null })
  })

  // 목적지를 바꾸면 후보 목록이 갈아치워진다. 선택만 남으면 다른 폴더의 문서에 붙는데
  // 붙인 판을 떼는 화면이 없어 되돌릴 수 없다.
  it('목적지가 바뀌어 후보에서 사라진 선택은 버리고 새 문서로 떨어진다', () => {
    expect(uploadTarget('doc_1', 'folder_other', [])).toEqual({
      kind: 'new',
      folderId: 'folder_other',
    })
  })

  it('후보가 남아 있어도 다른 문서의 id 면 붙이지 않는다', () => {
    expect(uploadTarget('doc_gone', FOLDER, candidates)).toEqual({
      kind: 'new',
      folderId: FOLDER,
    })
  })
})

describe('attachVersionWarning', () => {
  it('올리는 쪽이 더 높은 판이면 경고하지 않는다', () => {
    expect(attachVersionWarning('설계서_v0.6.html', '설계서_v0.3.html')).toBeNull()
  })

  it('낮은 판을 붙이려 하면 danger 다', () => {
    const warning = attachVersionWarning('설계서_v0.3.html', '설계서_v0.6.html')
    expect(warning?.level).toBe('danger')
    // 두 판을 다 보여야 사람이 판단한다.
    expect(warning?.message).toContain('v0.6')
    expect(warning?.message).toContain('v0.3')
  })

  it('같은 판번호면 notice 다', () => {
    const warning = attachVersionWarning('설계서_v0.6.html', '설계서_v0_6.html')
    expect(warning?.level).toBe('notice')
    expect(warning?.message).toContain('v0.6')
  })

  // 실데이터에 판번호 없는 파일이 있다. 이걸 danger 로 띄우면 경고가 일상이 되어 무시된다.
  it('한쪽이라도 판번호가 없으면 notice 다', () => {
    expect(attachVersionWarning('와이어프레임.html', '설계서_v0.6.html')?.level).toBe('notice')
    expect(attachVersionWarning('설계서_v0.6.html', '와이어프레임.html')?.level).toBe('notice')
  })

  it('모든 경고가 최신본이 뒤집힌다는 결과를 말한다', () => {
    const messages = [
      attachVersionWarning('설계서_v0.3.html', '설계서_v0.6.html'),
      attachVersionWarning('설계서_v0.6.html', '설계서_v0_6.html'),
      attachVersionWarning('와이어프레임.html', '설계서_v0.6.html'),
    ]
    for (const warning of messages) {
      expect(warning?.message).toContain('최신본이 됩니다')
    }
  })
})

describe('attachDefault', () => {
  it('후보가 0건이면 none 이다', () => {
    expect(attachDefault('마이페이지_화면설계서_v0.5_260916.html', [], [])).toEqual({
      kind: 'none',
    })
  })

  it('후보 1건이고 올리는 판이 엄격히 높으면 auto 다', () => {
    const found = [candidate('doc_1', '마이페이지_화면설계서_v0.5_260916.html')]
    expect(
      attachDefault('마이페이지_화면설계서_v0.6_260920.html', found, []),
    ).toEqual({ kind: 'auto', documentId: 'doc_1' })
  })

  // 2026-09-22 갱신: 팀원이 버전 번호를 안 올리고 날짜만 바꿔 재업로드하는 습관 때문에
  // 운영 재생 자동이 14/66 뿐이었다 — "같은 버전이면 나중에 올린 쪽이 최신"을 자동에 넣었다.
  it('같은 판이어도 올리는 파일의 날짜가 늦으면 auto 다', () => {
    const found = [candidate('doc_1', '마이페이지_화면설계서_v0.5_260916.html')]
    expect(attachDefault('마이페이지_화면설계서_v0.5_260920.html', found, [])).toEqual({
      kind: 'auto',
      documentId: 'doc_1',
    })
  })

  it('같은 판이고 날짜도 같으면 auto 다 — 업로드 시각은 항상 새 것이 늦다', () => {
    // 운영 실측: 같은 파일명을 같은 날 두 번 올린 사례(건강기록_화면설계서_v0.8_20260922,
    // 00:22 · 01:56 — 크기가 달라 수정본).
    const found = [
      candidate('doc_1', '건강기록_화면설계서_v0.8_20260922.xlsx', '2026-09-22T00:22:00Z'),
    ]
    expect(attachDefault('건강기록_화면설계서_v0.8_20260922.xlsx', found, [])).toEqual({
      kind: 'auto',
      documentId: 'doc_1',
    })
  })

  it('같은 판이고 올리는 파일의 날짜가 더 이르면 ask 다', () => {
    const found = [candidate('doc_1', '마이페이지_화면설계서_v0.5_260920.html')]
    expect(
      attachDefault('마이페이지_화면설계서_v0.5_260913.html', found, []).kind,
    ).toBe('ask')
  })

  it('같은 판인데 한쪽이라도 날짜를 못 읽으면 ask 다', () => {
    const noDate = [candidate('doc_1', '건강기록_기능명세서_v0.8.xlsx')]
    expect(
      attachDefault('건강기록_기능명세서_v0.8_20260920.xlsx', noDate, []).kind,
    ).toBe('ask')

    const hasDate = [candidate('doc_1', '건강기록_기능명세서_v0.8_20260917.xlsx')]
    expect(attachDefault('건강기록_기능명세서_v0.8.xlsx', hasDate, []).kind).toBe('ask')
  })

  it('후보 1건이고 판이 낮으면 ask 다', () => {
    const found = [candidate('doc_1', '건강기록_기능명세서_v0.8_20260917.xlsx')]
    expect(
      attachDefault('건강기록_기능명세서_v0.5_20260910.xlsx', found, []).kind,
    ).toBe('ask')
  })

  it('후보 1건이고 버전을 못 읽으면 ask 다', () => {
    const found = [candidate('doc_1', '06_로그인_회원가입_와이어프레임.html')]
    expect(attachDefault('06_로그인_회원가입_와이어프레임_수정.html', found, []).kind).toBe(
      'ask',
    )
  })

  // 2026-09-22 갱신: "후보가 2건이면 ask" 이던 옛 규칙을 뒤집는다. 이미 쪼개진 문서
  // 때문에 후보가 여럿인 폴더가 있어서 후보 수가 아니라 그중 가장 최신 하나(target)로
  // 판정해야 자동이 늘어난다(compareCandidatesByRecency 와 같은 순서).
  it('후보가 여럿이면 버전이 가장 높은 후보를 target 으로 삼아 auto 다', () => {
    const found = [
      candidate('doc_1', '마이페이지_화면설계서_v0.4_260910.html'),
      candidate('doc_2', '마이페이지_화면설계서_v0.5_260913.html'),
    ]
    expect(attachDefault('마이페이지_화면설계서_v0.6_260920.html', found, [])).toEqual({
      kind: 'auto',
      documentId: 'doc_2',
    })
  })

  it('후보 버전이 같으면 파일명 날짜가 가장 늦은 후보를 target 으로 삼아 auto 다', () => {
    const found = [
      candidate('doc_old', '마이페이지_화면설계서_v0.5_260913.html'),
      candidate('doc_new', '마이페이지_화면설계서_v0.5_260920.html'),
    ]
    expect(attachDefault('마이페이지_화면설계서_v0.5_260921.html', found, [])).toEqual({
      kind: 'auto',
      documentId: 'doc_new',
    })
  })

  it('후보 버전·날짜가 같으면 업로드 시각이 가장 늦은 후보를 target 으로 삼아 auto 다', () => {
    const found = [
      candidate('doc_early', '건강기록_화면설계서_v0.8_20260922.xlsx', '2026-09-22T00:22:00Z'),
      candidate('doc_late', '건강기록_화면설계서_v0.8_20260922.xlsx', '2026-09-22T01:56:00Z'),
    ]
    expect(attachDefault('건강기록_화면설계서_v0.8_20260922.xlsx', found, [])).toEqual({
      kind: 'auto',
      documentId: 'doc_late',
    })
  })

  it('올리는 파일이 가장 최신 후보보다도 낮으면 ask 다', () => {
    const found = [
      candidate('doc_1', '마이페이지_화면설계서_v0.4_260910.html'),
      candidate('doc_2', '마이페이지_화면설계서_v0.6_260920.html'),
    ]
    expect(
      attachDefault('마이페이지_화면설계서_v0.5_260915.html', found, []).kind,
    ).toBe('ask')
  })

  // 병렬 업로드(MAX_PARALLEL=3)라 v0.7·v0.8 을 같이 담으면 도착 순서가 뒤집혀 옛 판이
  // 최신으로 저장될 수 있다. 후보와 무관하게 같은 묶음의 파일명끼리도 걸러야 한다.
  it('같은 묶음에 documentMatchKey 가 같은 파일이 있으면 auto 조건을 채워도 ask 다', () => {
    const found = [candidate('doc_1', '건강기록_기능명세서_v0.5_20260910.xlsx')]
    const decision = attachDefault(
      '건강기록_기능명세서_v0.8_20260917.xlsx',
      found,
      ['건강기록_기능명세서_v0.7_20260916.xlsx'],
    )
    expect(decision.kind).toBe('ask')
  })
})
