import { describe, expect, it } from 'vitest'
import {
  classifyFileName,
  coreTokens,
  extractCore,
  extractSubName,
  matchReason,
  MIN_KEY_LENGTH,
  normalizeForMatch,
  REASON_AMBIGUOUS,
  REASON_NO_MATCH,
  REASON_PROPOSE,
  REASON_SUB_AMBIGUOUS,
  REASON_SUB_NONE,
  REASON_SUB_PROPOSE,
  subReason,
  type ClassifyFolder,
  type ClassifyResult,
} from '@/lib/classify'

// 실데이터 기준선(MILESTONES.md)의 폴더 구성 — 카테고리(루트)만 있고 자식은 없는 초기 상태.
const 요구사항정의서: ClassifyFolder = {
  id: 'f-req',
  name: '요구사항정의서',
  parentId: null,
  aliases: [],
}
const 화면설계서: ClassifyFolder = {
  id: 'f-screen',
  name: '화면설계서',
  parentId: null,
  aliases: [],
}
const BASELINE = [요구사항정의서, 화면설계서]

describe('classifyFileName — 실데이터 기준선 (자식 없는 초기 상태)', () => {
  // 이 표가 분류 규칙의 1차 기준이다. 규칙을 바꾸면 이 표로 다시 대조한다.
  it('카테고리를 걷어내면 남는 것이 없는 파일은 카테고리 루트로 가야 한다', () => {
    // 확정 규칙 4. 공백 제거 정규화가 근거이기도 하다 — 파일명은 '요구사항 정의서',
    // 폴더명은 '요구사항정의서'.
    expect(classifyFileName('01_요구사항 정의서_v0.3_2026_08_17.xlsx', BASELINE)).toEqual({
      kind: 'match',
      folderId: 'f-req',
      reason: subReason("'요구사항정의서' 일치", REASON_SUB_NONE),
    })
  })

  it.each([
    ['03_마이페이지_화면설계서_v0_3_260817.html', '마이페이지'],
    ['03_메인페이지_화면설계서_v0.3_20260819.html', '메인페이지'],
    // 제품명은 걷힌다 — 자식이 없어 추출로 떨어져도 '건강기록' 이 나와야 한다.
    ['냥멍케어 화면설계서 — 건강기록 (HLT) v0.2.html', '건강기록'],
  ])('%s → 화면설계서 밑 새 하위 폴더 %s 를 제안해야 한다', (fileName, proposedName) => {
    expect(classifyFileName(fileName, BASELINE)).toEqual({
      kind: 'propose',
      parentId: 'f-screen',
      proposedName,
      reason: subReason("'화면설계서' 일치", REASON_SUB_PROPOSE),
    })
  })

  it.each([
    ['02_IA 구조도_v0.2_2026_08_17.xlsx', 'IA 구조도'],
    // 끝 영문 코드 HLT 는 카테고리가 아니라 문서 식별자다 — TRAILING_CODE 가 뗀다.
    ['04_건강기록_와이어프레임_HLT_v0_2b (1).html', '건강기록 와이어프레임'],
    ['06_로그인_회원가입_와이어프레임.html', '로그인 회원가입 와이어프레임'],
  ])('%s → 새 루트 카테고리 %s 를 1뎁스로 제안해야 한다', (fileName, proposedName) => {
    // 확정 규칙 6 — 카테고리가 안 걸리면 2뎁스를 만들지 않는다.
    expect(classifyFileName(fileName, BASELINE)).toEqual({
      kind: 'propose',
      parentId: null,
      proposedName,
      reason: REASON_PROPOSE,
    })
  })

  it('화면설계서에 별칭 "와이어프레임"을 넣으면 와이어프레임 2건이 그 밑으로 들어가야 한다', () => {
    const folders = [요구사항정의서, { ...화면설계서, aliases: ['와이어프레임'] }]

    // 별칭으로 카테고리가 정해지고, 하위 이름을 뽑을 때 그 별칭 구간도 같이 지워진다.
    for (const [fileName, proposedName] of [
      ['04_건강기록_와이어프레임_HLT_v0_2b (1).html', '건강기록'],
      ['06_로그인_회원가입_와이어프레임.html', '로그인 회원가입'],
    ]) {
      expect(classifyFileName(fileName, folders)).toEqual({
        kind: 'propose',
        parentId: 'f-screen',
        proposedName,
        reason: subReason("별칭 '와이어프레임' 일치", REASON_SUB_PROPOSE),
      })
    }
  })
})

// ── 새 판정 기준선 26행 (MILESTONES.md §'새 판정 기준선', 활성 26건) ─────────────
//
// 표의 기대값은 "첫 파일" 상태와 "정착" 상태를 섞어 담고 있어서 폴더 픽스처를 두 벌 둔다.
//   A (초기) : 루트 3개뿐. 화면설계서에 별칭 '와이어프레임' — 표가 전제하는 선행 작업.
//   B (정착) : A + 표의 하위 폴더 16개가 이미 만들어진 뒤.
// A 에서는 추출이 하위 이름을 제안하고, B 에서는 매칭이 추출을 이겨 기존 하위로 붙는다.

const ROOT_REQ: ClassifyFolder = { id: 'f-req', name: '요구사항정의서', parentId: null, aliases: [] }
const ROOT_SPEC: ClassifyFolder = { id: 'f-spec', name: '기능명세서', parentId: null, aliases: [] }
const ROOT_SCREEN: ClassifyFolder = {
  id: 'f-screen',
  name: '화면설계서',
  parentId: null,
  aliases: ['와이어프레임'],
}
const FIXTURE_A: ClassifyFolder[] = [ROOT_REQ, ROOT_SPEC, ROOT_SCREEN]

const child = (parentId: string, id: string, name: string): ClassifyFolder => ({
  id,
  name,
  parentId,
  aliases: [],
})
const FIXTURE_B: ClassifyFolder[] = [
  ...FIXTURE_A,
  child('f-screen', 'f-screen-mypage', '마이페이지'),
  child('f-screen', 'f-screen-main', '메인페이지'),
  child('f-screen', 'f-screen-ai', 'AI매니저'),
  child('f-screen', 'f-screen-layout', '공통레이아웃'),
  child('f-screen', 'f-screen-community', '커뮤니티'),
  child('f-screen', 'f-screen-cs', '고객센터'),
  child('f-screen', 'f-screen-health', '건강기록'),
  child('f-screen', 'f-screen-login', '로그인 회원가입'),
  child('f-screen', 'f-screen-place', '플레이스'),
  child('f-spec', 'f-spec-main', '메인페이지'),
  child('f-spec', 'f-spec-mypage', '마이페이지'),
  child('f-spec', 'f-spec-place', '플레이스 동물병원'),
  child('f-spec', 'f-spec-login', '로그인 회원가입'),
  child('f-spec', 'f-spec-cs', '고객센터'),
  child('f-spec', 'f-spec-health', '건강기록'),
  child('f-spec', 'f-spec-community', '커뮤니티'),
]

const SCREEN = matchReason('화면설계서', false)
const SCREEN_ALIAS = matchReason('와이어프레임', true)
const SPEC = matchReason('기능명세서', false)
const REQ = matchReason('요구사항정의서', false)

const rootMatch = (folderId: string, categoryReason: string): ClassifyResult => ({
  kind: 'match',
  folderId,
  reason: subReason(categoryReason, REASON_SUB_NONE),
})
const rootPropose = (proposedName: string): ClassifyResult => ({
  kind: 'propose',
  parentId: null,
  proposedName,
  reason: REASON_PROPOSE,
})
const subPropose = (
  parentId: string,
  categoryReason: string,
  proposedName: string,
): ClassifyResult => ({
  kind: 'propose',
  parentId,
  proposedName,
  reason: subReason(categoryReason, REASON_SUB_PROPOSE),
})
const subMatch = (folderId: string, categoryReason: string, childName: string): ClassifyResult => ({
  kind: 'match',
  folderId,
  reason: subReason(categoryReason, `하위 ${matchReason(childName, false)}`),
})

/** [파일명, 픽스처 A 기대, 픽스처 B 기대]. 순서는 MILESTONES.md 표와 같다. */
const BASELINE_26: [string, ClassifyResult, ClassifyResult][] = [
  // 나머지 없음 → 카테고리 루트 (규칙 4). 자식이 생겨도 붙을 것이 없어 결과가 같다.
  ['01_요구사항 정의서_v0.3_2026_08_17.xlsx', rootMatch('f-req', REQ), rootMatch('f-req', REQ)],
  // 카테고리 미매칭 → 1뎁스 제안. 2뎁스를 만들지 않는다 (규칙 6).
  ['02_IA 구조도_v0.2_2026_08_17.xlsx', rootPropose('IA 구조도'), rootPropose('IA 구조도')],
  [
    '03_마이페이지_화면설계서_v0_3_260817.html',
    subPropose('f-screen', SCREEN, '마이페이지'),
    subMatch('f-screen-mypage', SCREEN, '마이페이지'),
  ],
  [
    '03_마이페이지_화면설계서_v0_4_260825.html',
    subPropose('f-screen', SCREEN, '마이페이지'),
    subMatch('f-screen-mypage', SCREEN, '마이페이지'),
  ],
  [
    '03_메인페이지_화면설계서_v0.3_20260819.html',
    subPropose('f-screen', SCREEN, '메인페이지'),
    subMatch('f-screen-main', SCREEN, '메인페이지'),
  ],
  [
    '03_메인페이지_화면설계서_v0.6_20260826.html',
    subPropose('f-screen', SCREEN, '메인페이지'),
    subMatch('f-screen-main', SCREEN, '메인페이지'),
  ],
  [
    '03_AI매니저_화면설계서_v0.1_2026_08_17.html',
    subPropose('f-screen', SCREEN, 'AI매니저'),
    subMatch('f-screen-ai', SCREEN, 'AI매니저'),
  ],
  [
    '03_AI매니저_화면설계서_v0.2_2026_08_26.html',
    subPropose('f-screen', SCREEN, 'AI매니저'),
    subMatch('f-screen-ai', SCREEN, 'AI매니저'),
  ],
  [
    '03_공통레이아웃_화면설계서_v0.1_2026_08_15.html',
    subPropose('f-screen', SCREEN, '공통레이아웃'),
    subMatch('f-screen-layout', SCREEN, '공통레이아웃'),
  ],
  [
    '03_공통레이아웃_화면설계서_v0.2_2026_08_26.html',
    subPropose('f-screen', SCREEN, '공통레이아웃'),
    subMatch('f-screen-layout', SCREEN, '공통레이아웃'),
  ],
  [
    '06_커뮤니티_화면설계서_v0_2_260826.html',
    subPropose('f-screen', SCREEN, '커뮤니티'),
    subMatch('f-screen-community', SCREEN, '커뮤니티'),
  ],
  [
    '07_고객센터_화면설계서_v0.2_260826.html',
    subPropose('f-screen', SCREEN, '고객센터'),
    subMatch('f-screen-cs', SCREEN, '고객센터'),
  ],
  // 제품명 접두사. 걷어내므로 자식이 없어도(A) 있어도(B) '건강기록' 하나로 모인다.
  [
    '냥멍케어_화면설계서_건강기록_HLT_v0.3.html',
    subPropose('f-screen', SCREEN, '건강기록'),
    subMatch('f-screen-health', SCREEN, '건강기록'),
  ],
  [
    '냥멍케어 화면설계서 — 건강기록 (HLT) v0.2.html',
    subPropose('f-screen', SCREEN, '건강기록'),
    subMatch('f-screen-health', SCREEN, '건강기록'),
  ],
  // 별칭 경유. 카테고리 근거가 별칭 문구이고 별칭 구간이 하위 이름에서 빠진다.
  [
    '04_건강기록_와이어프레임_HLT_v0_2b (1).html',
    subPropose('f-screen', SCREEN_ALIAS, '건강기록'),
    subMatch('f-screen-health', SCREEN_ALIAS, '건강기록'),
  ],
  // 토큰 2개를 한 폴더로 — 1문서=1폴더라 쪼개지 않는다.
  [
    '06_로그인_회원가입_와이어프레임.html',
    subPropose('f-screen', SCREEN_ALIAS, '로그인 회원가입'),
    subMatch('f-screen-login', SCREEN_ALIAS, '로그인 회원가입'),
  ],
  [
    '06_로그인_회원가입_와이어프레임_v0.2_260826.html',
    subPropose('f-screen', SCREEN_ALIAS, '로그인 회원가입'),
    subMatch('f-screen-login', SCREEN_ALIAS, '로그인 회원가입'),
  ],
  [
    '05_플레이스_와이어프레임_v0.2_260826.html',
    subPropose('f-screen', SCREEN_ALIAS, '플레이스'),
    subMatch('f-screen-place', SCREEN_ALIAS, '플레이스'),
  ],
  ['04_기능명세서_v0.1_2026_08_26.xlsx', rootMatch('f-spec', SPEC), rootMatch('f-spec', SPEC)],
  // 카테고리가 '기능'·'명세서' 두 토큰에 걸친다 — 부분열 제거가 아니면 '메인페이지 기능 명세서'.
  [
    '03_메인페이지_기능_명세서_v0.2_20260826.xlsx',
    subPropose('f-spec', SPEC, '메인페이지'),
    subMatch('f-spec-main', SPEC, '메인페이지'),
  ],
  // 카테고리가 앞에 와도 된다. B 에서 화면설계서 > 마이페이지 가 아니라 기능명세서 > 마이페이지.
  [
    '04_기능명세서_마이페이지_v0.1_260826.xlsx',
    subPropose('f-spec', SPEC, '마이페이지'),
    subMatch('f-spec-mypage', SPEC, '마이페이지'),
  ],
  [
    '05_플레이스_동물병원_기능명세서_v0.1_260826.xlsx',
    subPropose('f-spec', SPEC, '플레이스 동물병원'),
    subMatch('f-spec-place', SPEC, '플레이스 동물병원'),
  ],
  [
    '06_로그인_회원가입_기능명세서_v0.1_260826.xlsx',
    subPropose('f-spec', SPEC, '로그인 회원가입'),
    subMatch('f-spec-login', SPEC, '로그인 회원가입'),
  ],
  // 번호 prefix 없음.
  [
    '고객센터_기능명세서_v0_2.xlsx',
    subPropose('f-spec', SPEC, '고객센터'),
    subMatch('f-spec-cs', SPEC, '고객센터'),
  ],
  [
    '냥멍케어_기능명세서_건강기록_HLT_v0_1.xlsx',
    subPropose('f-spec', SPEC, '건강기록'),
    subMatch('f-spec-health', SPEC, '건강기록'),
  ],
  // 끝에 구분자가 남는 입력.
  [
    '커뮤니티_기능명세서_v0_2_.xlsx',
    subPropose('f-spec', SPEC, '커뮤니티'),
    subMatch('f-spec-community', SPEC, '커뮤니티'),
  ],
]

describe('classifyFileName — 새 판정 기준선 26행', () => {
  it('표가 26행이어야 한다 (MILESTONES.md 표와 행 수가 같다)', () => {
    expect(BASELINE_26).toHaveLength(26)
  })

  it.each(BASELINE_26)('[A 초기] %s', (fileName, expectedA) => {
    expect(classifyFileName(fileName, FIXTURE_A)).toEqual(expectedA)
  })

  it.each(BASELINE_26)('[B 정착] %s', (fileName, _expectedA, expectedB) => {
    expect(classifyFileName(fileName, FIXTURE_B)).toEqual(expectedB)
  })

  it('B 에서 화면설계서 파일은 화면설계서 자식에만, 기능명세서 파일은 기능명세서 자식에만 붙어야 한다', () => {
    // 동명 하위 폴더(마이페이지·건강기록 등)가 두 카테고리에 공존한다. 2단계가 자식 후보를
    // 카테고리의 직계로 좁히지 않으면 부모가 다른 동명으로 새는데, 그건 표로는 안 드러난다.
    const screenChildren = new Set(
      FIXTURE_B.filter((f) => f.parentId === 'f-screen').map((f) => f.id),
    )
    const specChildren = new Set(FIXTURE_B.filter((f) => f.parentId === 'f-spec').map((f) => f.id))

    for (const [fileName, , expectedB] of BASELINE_26) {
      if (expectedB.kind !== 'match') continue
      const result = classifyFileName(fileName, FIXTURE_B)
      expect(result.kind).toBe('match')
      if (result.kind !== 'match') continue
      const inScreen = screenChildren.has(result.folderId) || result.folderId === 'f-screen'
      const inSpec = specChildren.has(result.folderId) || result.folderId === 'f-spec'
      const isReq = result.folderId === 'f-req'
      // 정확히 한 카테고리 계열에만 속해야 한다.
      expect([inScreen, inSpec, isReq].filter(Boolean)).toHaveLength(1)
    }
  })

  it('A 에서 새 하위 폴더 제안 이름은 전부 폴더명 상한(100자) 안이어야 한다', () => {
    for (const [fileName] of BASELINE_26) {
      const result = classifyFileName(fileName, FIXTURE_A)
      if (result.kind !== 'propose') continue
      expect(result.proposedName.length).toBeLessThanOrEqual(100)
      expect(result.proposedName).not.toBe('')
    }
  })
})

describe('classifyFileName — 매칭 규칙', () => {
  it('NFD 파일명(맥 자모 분리)도 match 해야 한다 (NFC 정규화 증명)', () => {
    const nfd = '01_요구사항 정의서_v0.3_2026_08_17.xlsx'.normalize('NFD')
    expect(nfd).not.toBe('01_요구사항 정의서_v0.3_2026_08_17.xlsx')

    expect(classifyFileName(nfd, BASELINE)).toMatchObject({ kind: 'match', folderId: 'f-req' })
  })

  it('영문 대소문자를 무시해야 한다 — 폴더 IA구조도 vs 파일 ia 구조도', () => {
    const folders: ClassifyFolder[] = [
      { id: 'f-ia', name: 'IA구조도', parentId: null, aliases: [] },
    ]

    expect(
      classifyFileName('02_ia 구조도_v0.2_2026_08_17.xlsx', folders),
    ).toMatchObject({ kind: 'match', folderId: 'f-ia' })
  })

  it('같은 이름 루트가 2개면 unclassified 여야 한다', () => {
    // 문자열 일치만으로는 어느 쪽인지 고를 수 없다.
    const folders: ClassifyFolder[] = [
      { id: 'f-a', name: '설계서', parentId: null, aliases: [] },
      { id: 'f-b', name: '설계서', parentId: null, aliases: [] },
    ]

    expect(classifyFileName('주간 설계서.pdf', folders)).toEqual({
      kind: 'unclassified',
      reason: REASON_AMBIGUOUS,
    })
  })

  it('같은 폴더가 이름과 별칭 양쪽으로 걸리면 그 폴더로 가야 한다 (모호 아님)', () => {
    const folders: ClassifyFolder[] = [
      { id: 'f-screen', name: '화면설계서', parentId: null, aliases: ['화면 설계서'] },
    ]

    // 동률일 때 reason 은 먼저 최고점을 세운 키(name)의 것이다.
    expect(classifyFileName('03_화면설계서_v0.3.html', folders)).toEqual({
      kind: 'match',
      folderId: 'f-screen',
      reason: subReason("'화면설계서' 일치", REASON_SUB_NONE),
    })
  })

  it('자식이 여러 개 동점이면 카테고리 루트에 둬야 한다', () => {
    // 하위를 고르지 못한 것이지 카테고리를 못 고른 것이 아니다 — 미분류로 떨구지 않는다.
    const folders: ClassifyFolder[] = [
      { id: 'f-screen', name: '화면설계서', parentId: null, aliases: [] },
      // 점수가 키 길이라 동점을 만들려면 이름 길이가 같아야 한다.
      { id: 'f-a', name: '메인', parentId: 'f-screen', aliases: [] },
      { id: 'f-b', name: '서브', parentId: 'f-screen', aliases: [] },
    ]

    expect(classifyFileName('03_메인_서브_화면설계서.html', folders)).toEqual({
      kind: 'match',
      folderId: 'f-screen',
      reason: subReason("'화면설계서' 일치", REASON_SUB_AMBIGUOUS),
    })
  })

  it('자식이 붙으면 추출보다 매칭이 이겨야 한다 — 제품명 접두사가 사라진다', () => {
    const folders: ClassifyFolder[] = [
      { id: 'f-screen', name: '화면설계서', parentId: null, aliases: [] },
      { id: 'f-health', name: '건강기록', parentId: 'f-screen', aliases: [] },
    ]

    expect(classifyFileName('냥멍케어_화면설계서_건강기록_HLT_v0.3.html', folders)).toEqual({
      kind: 'match',
      folderId: 'f-health',
      reason: subReason("'화면설계서' 일치", "하위 '건강기록' 일치"),
    })
  })

  it('정규화 1글자 키는 후보에서 빠져야 한다 (임계값 MIN_KEY_LENGTH=2)', () => {
    expect(MIN_KEY_LENGTH).toBe(2)

    const folders: ClassifyFolder[] = [{ id: 'f-1', name: '안', parentId: null, aliases: [] }]
    // '안내문' 에 '안' 이 들어 있지만 1글자 키는 소음이라 매칭하지 않는다.
    expect(classifyFileName('안내문.pdf', folders)).toMatchObject({
      kind: 'propose',
      parentId: null,
    })

    // 경계: 2글자 키는 정상 후보다 — 카테고리로 잡혔으니 제안이 그 밑으로 붙는다.
    const twoChar: ClassifyFolder[] = [{ id: 'f-2', name: '계약', parentId: null, aliases: [] }]
    expect(classifyFileName('계약서.pdf', twoChar)).toMatchObject({
      kind: 'propose',
      parentId: 'f-2',
    })
  })

  it('폴더가 0개면 unclassified 이고 propose 가 아니어야 한다', () => {
    // 사양: 폴더가 하나도 없으면 전 건 미분류 — 조용히 아무 일도 안 하는 것이 정상이다.
    expect(classifyFileName('02_IA 구조도_v0.2_2026_08_17.xlsx', [])).toEqual({
      kind: 'unclassified',
      reason: REASON_NO_MATCH,
    })
  })

  it('루트가 0개면(자식만 있는 목록) unclassified 여야 한다', () => {
    // 카테고리를 고를 근거가 없다. 1단계 후보가 루트뿐이라는 것을 못박는다.
    const orphans: ClassifyFolder[] = [
      { id: 'f-child', name: '화면설계서', parentId: 'f-gone', aliases: [] },
    ]

    expect(classifyFileName('03_마이페이지_화면설계서.html', orphans)).toEqual({
      kind: 'unclassified',
      reason: REASON_NO_MATCH,
    })
  })

  it('긴 키가 이겨야 한다 — 설계서와 화면설계서가 공존하면 화면설계서', () => {
    const folders: ClassifyFolder[] = [
      { id: 'f-short', name: '설계서', parentId: null, aliases: [] },
      { id: 'f-long', name: '화면설계서', parentId: null, aliases: [] },
    ]

    expect(classifyFileName('03_마이페이지_화면설계서_v0_3.html', folders)).toEqual({
      kind: 'propose',
      parentId: 'f-long',
      proposedName: '마이페이지',
      reason: subReason("'화면설계서' 일치", REASON_SUB_PROPOSE),
    })
  })

  it('핵심어가 비면 propose 하지 않고 unclassified 여야 한다', () => {
    const folders = BASELINE
    expect(classifyFileName('v0.2.html', folders)).toEqual({
      kind: 'unclassified',
      reason: REASON_NO_MATCH,
    })
    expect(classifyFileName('01_v0.3_2026_08_17.xlsx', folders)).toEqual({
      kind: 'unclassified',
      reason: REASON_NO_MATCH,
    })
  })

  it('자식 이름이 1글자면 후보에서 빠지고 추출로 넘어가야 한다', () => {
    // 1글자 키는 아무 파일명에나 붙는 소음이다 — 자식에도 루트와 같은 임계값이 걸린다.
    const folders: ClassifyFolder[] = [
      { id: 'f-screen', name: '화면설계서', parentId: null, aliases: [] },
      { id: 'f-one', name: '안', parentId: 'f-screen', aliases: [] },
    ]

    expect(classifyFileName('03_안내문_화면설계서.html', folders)).toEqual({
      kind: 'propose',
      parentId: 'f-screen',
      proposedName: '안내문',
      reason: subReason("'화면설계서' 일치", REASON_SUB_PROPOSE),
    })
  })

  it('하위 이름이 100자를 넘으면 제안하지 않고 카테고리 루트로 가야 한다', () => {
    expect(classifyFileName(`${'a'.repeat(101)}_화면설계서.html`, FIXTURE_A)).toEqual({
      kind: 'match',
      folderId: 'f-screen',
      reason: subReason("'화면설계서' 일치", REASON_SUB_NONE),
    })
    // 경계: 100자는 제안한다.
    expect(classifyFileName(`${'a'.repeat(100)}_화면설계서.html`, FIXTURE_A)).toMatchObject({
      kind: 'propose',
      parentId: 'f-screen',
      proposedName: 'a'.repeat(100),
    })
  })

  it('핵심어가 100자(폴더명 상한)를 넘으면 propose 하지 않아야 한다', () => {
    expect(classifyFileName(`${'a'.repeat(101)}.pdf`, BASELINE)).toEqual({
      kind: 'unclassified',
      reason: REASON_NO_MATCH,
    })
    // 경계: 100자는 제안한다.
    expect(classifyFileName(`${'a'.repeat(100)}.pdf`, BASELINE)).toMatchObject({
      kind: 'propose',
      proposedName: 'a'.repeat(100),
    })
  })
})

describe('normalizeForMatch', () => {
  it('공백·밑줄·하이픈·전각대시·점·괄호를 전부 지우고 소문자로 만들어야 한다', () => {
    expect(normalizeForMatch('IA 구조도_v0.2 (1) — 최종')).toBe('ia구조도v021최종')
  })

  it('NFD 한글을 NFC 로 합쳐야 한다', () => {
    expect(normalizeForMatch('요구사항'.normalize('NFD'))).toBe(normalizeForMatch('요구사항'))
  })
})

describe('extractCore', () => {
  it('버전 토큰을 지워야 한다 — v0.2 / v0_3 / v0_2b', () => {
    expect(extractCore('기획서_v0.2.pdf')).toBe('기획서')
    expect(extractCore('기획서_v0_3.pdf')).toBe('기획서')
    expect(extractCore('기획서_v0_2b.pdf')).toBe('기획서')
  })

  it('날짜 토큰을 지워야 한다 — 2026_08_17 / 2026.08.17 / 20260819 / 260817', () => {
    expect(extractCore('회의록_2026_08_17.pdf')).toBe('회의록')
    expect(extractCore('회의록_2026.08.17.pdf')).toBe('회의록')
    expect(extractCore('회의록_20260819.pdf')).toBe('회의록')
    expect(extractCore('회의록_260817.pdf')).toBe('회의록')
  })

  it('브라우저 중복 접미사를 지워야 한다 — (숫자) 와 복사본', () => {
    expect(extractCore('보고서 (1).pdf')).toBe('보고서')
    expect(extractCore('보고서 - 복사본.pdf')).toBe('보고서')
    expect(extractCore('보고서 복사본.pdf')).toBe('보고서')
  })

  it('괄호는 (숫자) 만 일괄 삭제한다 — 가운데 (HLT) 는 남고 끝의 (HLT) 는 지워진다', () => {
    // 두 규칙의 층위가 다르다: DUPLICATE_SUFFIX 는 위치 무관하게 숫자 괄호만 지우고,
    // TRAILING_CODE 는 끝 위치의 영문 코드만 뗀다. 가운데 괄호는 핵심어일 수 있어 남는다.
    expect(extractCore('건강기록 (HLT) 보고서.html')).toBe('건강기록 (HLT) 보고서')
    expect(extractCore('냥멍케어 화면설계서 — 건강기록 (HLT) v0.2.html')).toBe(
      '화면설계서 건강기록',
    )
  })

  it('제품명 토큰을 걷어야 한다 — 표기가 달라도 같이 걷힌다', () => {
    expect(extractCore('냥멍케어_기능명세서_건강기록_HLT_v0_1.xlsx')).toBe('기능명세서 건강기록')
    expect(extractCore('냥멍케어 커뮤니티.html')).toBe('커뮤니티')
  })

  it('제품명만 남으면 걷지 않는다 — 빈 이름보다 나쁜 이름이 낫다', () => {
    // 빈 문자열이 되면 폴더 이름이 없어져 제안 자체가 불가능해진다.
    expect(extractCore('냥멍케어.html')).toBe('냥멍케어')
    expect(extractCore('냥멍케어_v0.2.html')).toBe('냥멍케어')
  })

  it('끝에 붙은 영문 대문자 2~4자 코드를 지워야 한다', () => {
    expect(extractCore('04_건강기록_와이어프레임_HLT_v0_2b (1).html')).toBe('건강기록 와이어프레임')
  })

  it('끝 코드가 반복되면 전부 지워야 한다', () => {
    expect(extractCore('기획_AB_CD.html')).toBe('기획')
  })

  it('토큰이 1개 남으면 멈춰야 한다 — WF.html 이 빈 제안이 되면 폴더를 못 얻는다', () => {
    expect(extractCore('WF.html')).toBe('WF')
  })

  it('앞·가운데의 영문 코드는 안 지운다 — IA 는 앞 토큰이라 남는다', () => {
    expect(extractCore('02_IA 구조도_v0.2_2026_08_17.xlsx')).toBe('IA 구조도')
  })

  it('소문자·5자 이상 영문은 안 지운다 — 실제 단어일 확률이 높다', () => {
    expect(extractCore('회의록_final.html')).toBe('회의록 final')
    expect(extractCore('보고서_LOGIN.html')).toBe('보고서 LOGIN')
  })

  it('맨 앞 숫자 prefix 토큰을 지워야 한다', () => {
    expect(extractCore('03_마이페이지.pdf')).toBe('마이페이지')
  })

  it('확장자를 지우고 구분자를 공백 하나로 골라야 한다', () => {
    expect(extractCore('로그인_회원가입—와이어프레임.html')).toBe('로그인 회원가입 와이어프레임')
  })

  it('노이즈뿐인 파일명은 빈 문자열이어야 한다', () => {
    expect(extractCore('01_v0.2_260817.html')).toBe('')
  })
})

describe('coreTokens', () => {
  it('extractCore 와 일관되어야 한다 — coreTokens(f).join(" ") === extractCore(f)', () => {
    // extractSubName 이 coreTokens 를 쓰고 루트 제안이 extractCore 를 쓴다. 둘이 갈리면
    // 같은 파일이 루트 제안과 하위 제안에서 다른 이름을 얻는다.
    for (const [fileName] of BASELINE_26) {
      expect(coreTokens(fileName).join(' ')).toBe(extractCore(fileName))
    }
    expect(coreTokens('WF.html')).toEqual(['WF'])
    expect(coreTokens('01_v0.2_260817.html')).toEqual([])
  })
})

describe('extractSubName', () => {
  it('여러 토큰에 걸친 카테고리를 통째로 지워야 한다', () => {
    // 실데이터의 함정 — `기능명세서` 가 `기능`·`명세서` 두 토큰에 걸려 있다.
    expect(
      extractSubName('03_메인페이지_기능_명세서_v0.2_20260826.xlsx', ['기능명세서']),
    ).toBe('메인페이지')
  })

  it('키가 여러 번 나오면 전부 지워야 한다', () => {
    expect(extractSubName('화면설계서_로그인_화면설계서.html', ['화면설계서'])).toBe('로그인')
  })

  it('카테고리뿐인 파일명은 빈 문자열이어야 한다 — 그게 곧 카테고리 루트다', () => {
    expect(extractSubName('04_기능명세서_v0.1_2026_08_26.xlsx', ['기능명세서'])).toBe('')
  })

  it('별칭도 키다 — 별칭 구간이 하위 이름에 남으면 안 된다', () => {
    expect(
      extractSubName('06_로그인_회원가입_와이어프레임.html', ['화면설계서', '와이어프레임']),
    ).toBe('로그인 회원가입')
  })
})

describe('matchReason', () => {
  it('이름 일치와 별칭 일치의 문구가 달라야 한다', () => {
    expect(matchReason('화면설계서', false)).toBe("'화면설계서' 일치")
    expect(matchReason('와이어프레임', true)).toBe("별칭 '와이어프레임' 일치")
  })
})
