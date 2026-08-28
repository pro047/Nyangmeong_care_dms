import { describe, expect, it } from 'vitest'
import { TITLE_MAX_LENGTH, retitleOnReupload, titleFromFileName } from '@/lib/title'

describe('titleFromFileName', () => {
  it('마지막 확장자만 떼어낸다', () => {
    expect(titleFromFileName('요구사항정의서.xlsx')).toBe('요구사항정의서')
    expect(titleFromFileName('보고서.최종.docx')).toBe('보고서.최종')
  })

  it('확장자가 없거나 점으로 시작하면 그대로 둔다', () => {
    expect(titleFromFileName('README')).toBe('README')
    // lastIndexOf 가 0 이라 잘라내면 제목이 빈 문자열이 된다
    expect(titleFromFileName('.env')).toBe('.env')
  })
})

describe('retitleOnReupload', () => {
  it('자동 생성된 제목이면 새 파일명을 따라간다', () => {
    expect(retitleOnReupload('기획서', '기획서.pdf', '기획서_v2.pdf')).toBe('기획서_v2')
  })

  it('손으로 고친 제목은 덮지 않는다', () => {
    // 제목이 이전 파일명('기획서')과 다르다 = 사람이 정한 제목이다
    expect(retitleOnReupload('2026 상반기 기획서', '기획서.pdf', '기획서_v2.pdf')).toBeNull()
  })

  it('확장자만 바뀌면 제목이 그대로라 바꾸지 않는다', () => {
    expect(retitleOnReupload('기획서', '기획서.xlsx', '기획서.pdf')).toBeNull()
  })

  it('상한을 넘는 제목은 만들지 않는다 — 생성 경로가 거부하는 값이다', () => {
    const long = 'ㄱ'.repeat(TITLE_MAX_LENGTH + 1)
    expect(retitleOnReupload('원본', '원본.pdf', `${long}.pdf`)).toBeNull()
  })

  it('빈 제목이 되는 파일명은 거른다', () => {
    expect(retitleOnReupload('원본', '원본.pdf', '')).toBeNull()
  })
})
