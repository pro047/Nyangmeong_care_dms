import { describe, expect, it } from 'vitest'
import { previewKind } from '@/lib/preview'

describe('previewKind', () => {
  it('PDF 는 완전일치로만 인정한다', () => {
    expect(previewKind('application/pdf')).toBe('pdf')
    // 'application/pdf-x' 가 'pdf' 로 새면 startsWith 로 바뀐 회귀다
    expect(previewKind('application/pdf-x')).toBe('none')
  })

  it('대소문자를 믿지 않는다 — DB 의 mimeType 은 브라우저 신고값이다', () => {
    expect(previewKind('APPLICATION/PDF')).toBe('pdf')
    expect(previewKind('Image/PNG')).toBe('image')
  })

  it('image/* 는 서브타입과 무관하게 전부 이미지다', () => {
    expect(previewKind('image/png')).toBe('image')
    expect(previewKind('image/jpeg')).toBe('image')
    expect(previewKind('image/svg+xml')).toBe('image')
  })

  it('html 은 완전일치로만 인정한다 — 팀 화면설계서 16건이 이 경로다', () => {
    expect(previewKind('text/html')).toBe('html')
    expect(previewKind('TEXT/HTML')).toBe('html')
    // text/* 로 넓히면 csv·txt 가 딸려 온다. 그것들은 iframe 에서 읽을 만하지 않다
    expect(previewKind('text/plain')).toBe('none')
    expect(previewKind('text/csv')).toBe('none')
  })

  it('파라미터가 붙어도 형식을 알아본다', () => {
    // 지금 저장된 값에는 안 붙어 있지만(S3 실측), 붙는 순간 조용히 폴백 박스로 떨어진다
    expect(previewKind('text/html; charset=utf-8')).toBe('html')
    expect(previewKind('application/pdf; qs=0.001')).toBe('pdf')
    expect(previewKind('image/jpeg;')).toBe('image')
    // 파라미터를 잘라도 pdf-x 가 새면 안 된다
    expect(previewKind('application/pdf-x; charset=utf-8')).toBe('none')
  })

  it('그 외는 전부 none — 폴백 박스(아이콘 + 다운로드)로 간다', () => {
    // file.type 이 비었을 때 업로드가 저장하는 폴백값
    expect(previewKind('application/octet-stream')).toBe('none')
    // xlsx 는 iframe 에 못 넣는다 — 별도 뷰어가 받는다
    expect(previewKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(
      'none',
    )
    expect(previewKind('')).toBe('none')
  })
})
