import { describe, expect, it } from 'vitest'
import { fileVersionLabel } from '@/lib/file-version'

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
