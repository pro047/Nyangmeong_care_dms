import { describe, expect, it } from 'vitest'
import {
  classifyFileName,
  extractCore,
  matchReason,
  MIN_KEY_LENGTH,
  normalizeForMatch,
  REASON_AMBIGUOUS,
  REASON_NO_MATCH,
  REASON_PROPOSE,
  type ClassifyFolder,
} from '@/lib/classify'

// 실데이터 기준선(MILESTONES.md)의 폴더 구성 — 별칭 없음.
const 요구사항정의서: ClassifyFolder = { id: 'f-req', name: '요구사항정의서', aliases: [] }
const 화면설계서: ClassifyFolder = { id: 'f-screen', name: '화면설계서', aliases: [] }
const BASELINE = [요구사항정의서, 화면설계서]

describe('classifyFileName — 실데이터 기준선 7건', () => {
  // 이 표가 분류 규칙의 1차 기준이다. 규칙을 바꾸면 이 표로 다시 대조한다.
  it.each([
    ['냥멍케어 화면설계서 — 건강기록 (HLT) v0.2.html', 'f-screen'],
    ['03_마이페이지_화면설계서_v0_3_260817.html', 'f-screen'],
    ['03_메인페이지_화면설계서_v0.3_20260819.html', 'f-screen'],
    // 공백 제거 정규화가 근거 — 파일명은 '요구사항 정의서', 폴더명은 '요구사항정의서'.
    ['01_요구사항 정의서_v0.3_2026_08_17.xlsx', 'f-req'],
  ])('%s → match %s', (fileName, folderId) => {
    expect(classifyFileName(fileName, BASELINE)).toEqual({
      kind: 'match',
      folderId,
      reason: expect.stringContaining('일치'),
    })
  })

  it.each([
    ['02_IA 구조도_v0.2_2026_08_17.xlsx', 'IA 구조도'],
    ['04_건강기록_와이어프레임_HLT_v0_2b (1).html', '건강기록 와이어프레임 HLT'],
    ['06_로그인_회원가입_와이어프레임.html', '로그인 회원가입 와이어프레임'],
  ])('%s → propose %s', (fileName, proposedName) => {
    expect(classifyFileName(fileName, BASELINE)).toEqual({
      kind: 'propose',
      proposedName,
      reason: REASON_PROPOSE,
    })
  })

  it('화면설계서에 별칭 "와이어프레임"을 넣으면 와이어프레임 2건이 match 로 바뀌어야 한다', () => {
    const folders = [요구사항정의서, { ...화면설계서, aliases: ['와이어프레임'] }]

    for (const fileName of [
      '04_건강기록_와이어프레임_HLT_v0_2b (1).html',
      '06_로그인_회원가입_와이어프레임.html',
    ]) {
      expect(classifyFileName(fileName, folders)).toEqual({
        kind: 'match',
        folderId: 'f-screen',
        reason: "별칭 '와이어프레임' 일치",
      })
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
    const folders: ClassifyFolder[] = [{ id: 'f-ia', name: 'IA구조도', aliases: [] }]

    expect(
      classifyFileName('02_ia 구조도_v0.2_2026_08_17.xlsx', folders),
    ).toMatchObject({ kind: 'match', folderId: 'f-ia' })
  })

  it('같은 이름 폴더가 2개(부모만 다름)면 unclassified 여야 한다', () => {
    // 문자열 일치만으로는 어느 쪽인지 고를 수 없다.
    const folders: ClassifyFolder[] = [
      { id: 'f-a', name: '설계서', aliases: [] },
      { id: 'f-b', name: '설계서', aliases: [] },
    ]

    expect(classifyFileName('주간 설계서.pdf', folders)).toEqual({
      kind: 'unclassified',
      reason: REASON_AMBIGUOUS,
    })
  })

  it('같은 폴더가 이름과 별칭 양쪽으로 걸리면 그 폴더의 match 여야 한다 (모호 아님)', () => {
    const folders: ClassifyFolder[] = [
      { id: 'f-screen', name: '화면설계서', aliases: ['화면 설계서'] },
    ]

    // 동률일 때 reason 은 먼저 최고점을 세운 키(name)의 것이다.
    expect(classifyFileName('03_화면설계서_v0.3.html', folders)).toEqual({
      kind: 'match',
      folderId: 'f-screen',
      reason: "'화면설계서' 일치",
    })
  })

  it('정규화 1글자 키는 후보에서 빠져야 한다 (임계값 MIN_KEY_LENGTH=2)', () => {
    expect(MIN_KEY_LENGTH).toBe(2)

    const folders: ClassifyFolder[] = [{ id: 'f-1', name: '안', aliases: [] }]
    // '안내문' 에 '안' 이 들어 있지만 1글자 키는 소음이라 매칭하지 않는다.
    expect(classifyFileName('안내문.pdf', folders).kind).not.toBe('match')

    // 경계: 2글자 키는 정상 후보다.
    const twoChar: ClassifyFolder[] = [{ id: 'f-2', name: '계약', aliases: [] }]
    expect(classifyFileName('계약서.pdf', twoChar)).toMatchObject({
      kind: 'match',
      folderId: 'f-2',
    })
  })

  it('폴더가 0개면 unclassified 이고 propose 가 아니어야 한다', () => {
    // 사양: 폴더가 하나도 없으면 전 건 미분류 — 조용히 아무 일도 안 하는 것이 정상이다.
    expect(classifyFileName('02_IA 구조도_v0.2_2026_08_17.xlsx', [])).toEqual({
      kind: 'unclassified',
      reason: REASON_NO_MATCH,
    })
  })

  it('긴 키가 이겨야 한다 — 설계서와 화면설계서가 공존하면 화면설계서', () => {
    const folders: ClassifyFolder[] = [
      { id: 'f-short', name: '설계서', aliases: [] },
      { id: 'f-long', name: '화면설계서', aliases: [] },
    ]

    expect(classifyFileName('03_마이페이지_화면설계서_v0_3.html', folders)).toEqual({
      kind: 'match',
      folderId: 'f-long',
      reason: "'화면설계서' 일치",
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

  it('(숫자) 만 지워야 한다 — (HLT) 는 핵심어라 남는다', () => {
    expect(extractCore('냥멍케어 화면설계서 — 건강기록 (HLT) v0.2.html')).toBe(
      '냥멍케어 화면설계서 건강기록 (HLT)',
    )
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

describe('matchReason', () => {
  it('이름 일치와 별칭 일치의 문구가 달라야 한다', () => {
    expect(matchReason('화면설계서', false)).toBe("'화면설계서' 일치")
    expect(matchReason('와이어프레임', true)).toBe("별칭 '와이어프레임' 일치")
  })
})
