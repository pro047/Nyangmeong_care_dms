import { describe, expect, it } from 'vitest'
import { compareFileVersions, fileVersionLabel, parseFileVersion } from '@/lib/file-version'

describe('fileVersionLabel', () => {
  it('점·밑줄 표기를 한 모양으로 접는다', () => {
    expect(fileVersionLabel('01_요구사항 정의서_v0.3_2026_08_17.xlsx')).toBe('v0.3')
    expect(fileVersionLabel('03_마이페이지_화면설계서_v0_3_260817.html')).toBe('v0.3')
  })

  it('확장자를 먼저 뗀다 — 안 떼면 minor 가 조용히 사라진다', () => {
    // `v0_2` 뒤가 `.` 이라 lookahead 가 실패하고 되짚어 `v0` 만 잡히던 자리.
    expect(fileVersionLabel('고객센터_기능명세서_v0_2.xlsx')).toBe('v0.2')
    expect(fileVersionLabel('냥멍케어_화면설계서_건강기록_HLT_v0.3.html')).toBe('v0.3')
  })

  it('끝에 붙는 알파벳과 공백 구분자를 받는다', () => {
    expect(fileVersionLabel('04_건강기록_와이어프레임_HLT_v0_2b (1).html')).toBe('v0.2b')
    expect(fileVersionLabel('냥멍케어 화면설계서 — 건강기록 (HLT) v0.2.html')).toBe('v0.2')
  })

  it('minor 가 없으면 major 만 낸다', () => {
    expect(fileVersionLabel('dms-preview-test-v2.pdf')).toBe('v2')
  })

  it('대문자 V 를 소문자로 접는다', () => {
    expect(fileVersionLabel('요구사항정의서_V0.3_260817.xlsx')).toBe('v0.3')
    expect(fileVersionLabel('와이어프레임_v0_2B.html')).toBe('v0.2b')
  })

  it('날짜 토큰을 버전으로 오인하지 않는다', () => {
    expect(fileVersionLabel('03_메인페이지_화면설계서_v0.3_20260819.html')).toBe('v0.3')
    expect(fileVersionLabel('회의록_2026_08_17.html')).toBeNull()
  })

  it('버전 표기가 없으면 null 이다', () => {
    expect(fileVersionLabel('06_로그인_회원가입_와이어프레임.html')).toBeNull()
    expect(fileVersionLabel('dms-preview-test.png')).toBeNull()
  })

  it('여러 개면 마지막을 쓴다', () => {
    expect(fileVersionLabel('v1_초안_화면설계서_v0.3.html')).toBe('v0.3')
  })

  it('확장자가 없는 파일명도 읽는다', () => {
    expect(fileVersionLabel('요구사항정의서_v0.3')).toBe('v0.3')
  })

  it('단어 안의 v 는 버전이 아니다', () => {
    expect(fileVersionLabel('revision7_기능명세서.xlsx')).toBeNull()
  })
})

describe('parseFileVersion', () => {
  it('minor 가 없으면 0 으로 읽어야 한다 — v2 와 v2.0 이 다른 판이 되면 안 된다', () => {
    expect(parseFileVersion('dms-preview-test-v2.pdf')).toEqual({ major: 2, minor: 0, suffix: '' })
  })

  it('표기가 갈려도 같은 값을 내야 한다', () => {
    const dot = parseFileVersion('01_요구사항정의서_v0.5_2026_09_06.xlsx')
    const underscore = parseFileVersion('01_요구사항정의서_v0_5_2026_08_31.xlsx')
    expect(dot).toEqual(underscore)
  })

  it('접미가 붙으면 소문자로 접어 따로 담아야 한다', () => {
    expect(parseFileVersion('04_건강기록_와이어프레임_HLT_v0_2b (1).html')).toEqual({
      major: 0,
      minor: 2,
      suffix: 'b',
    })
  })

  it('판번호가 없으면 null 을 내야 한다', () => {
    expect(parseFileVersion('06_로그인_회원가입_와이어프레임.html')).toBeNull()
  })
})

describe('compareFileVersions', () => {
  it('사전순으로 뒤집히는 자리도 크기로 갈라야 한다', () => {
    // 'v0.10' < 'v0.9' 라 fileVersionLabel 문자열 비교로는 틀리는 자리다.
    expect(compareFileVersions('a_v0.9.html', 'b_v0.10.html')).toBeLessThan(0)
  })

  it('major 가 다르면 minor 와 무관하게 major 로 갈라야 한다', () => {
    expect(compareFileVersions('a_v1.0.html', 'b_v0.9.html')).toBeGreaterThan(0)
  })

  it('판번호가 건너뛰어도 크기로 갈라야 한다', () => {
    const older = '03_메인페이지_화면설계서_v0.3_20260819.html'
    const newer = '03_메인페이지_화면설계서_v0.6_20260826.html'
    expect(compareFileVersions(older, newer)).toBeLessThan(0)
    expect(compareFileVersions(newer, older)).toBeGreaterThan(0)
  })

  it('표기만 다르면 같다고 봐야 한다', () => {
    expect(compareFileVersions('a_v0_4_260825.html', 'b_v0.4.html')).toBe(0)
  })

  it('접미가 붙으면 같은 minor 안에서 뒤에 와야 한다 — 다음 판이 아니다', () => {
    expect(compareFileVersions('a_v0_2.html', 'b_v0_2b.html')).toBeLessThan(0)
    expect(compareFileVersions('a_v0_2b.html', 'b_v0.3.html')).toBeLessThan(0)
  })

  it('한쪽이라도 판번호가 없으면 null 이어야 한다 — 0 으로 뭉개면 안 된다', () => {
    // 근거가 없는 것과 같다고 판정한 것은 사용자에게 보일 화면이 다르다.
    expect(compareFileVersions('06_로그인_회원가입_와이어프레임.html', 'b_v0.2.html')).toBeNull()
    expect(compareFileVersions('a_v0.2.html', '06_로그인_회원가입_와이어프레임.html')).toBeNull()
  })
})

describe('판번호 뒤에 날짜가 붙는 경우', () => {
  it('판번호 뒤에 날짜가 붙으면 minor 로 먹지 않아야 한다', () => {
    // 상한이 없던 시절 `v1_2026_08_17` 이 minor=2026 이 되어 목록에 v1.2026 으로 찍혔다.
    expect(parseFileVersion('보고서_v1_2026_08_17.xlsx')).toEqual({ major: 1, minor: 0, suffix: '' })
    expect(parseFileVersion('보고서_v1_20260817.xlsx')).toEqual({ major: 1, minor: 0, suffix: '' })
    expect(fileVersionLabel('보고서_v1_2026_08_17.xlsx')).toBe('v1')
  })

  it('minor 가 세 자리면 그대로 받아야 한다 — 상한이 판번호까지 자르면 안 된다', () => {
    expect(parseFileVersion('a_v0.100.html')).toEqual({ major: 0, minor: 100, suffix: '' })
  })

  it('날짜가 붙어도 크기 비교가 뒤집히지 않아야 한다', () => {
    expect(compareFileVersions('a_v2_20260819.html', 'b_v2.1.html')).toBeLessThan(0)
  })
})
