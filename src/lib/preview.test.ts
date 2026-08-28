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

  it('그 외는 전부 none — 폴백 박스(아이콘 + 다운로드)로 간다', () => {
    // file.type 이 비었을 때 업로드가 저장하는 폴백값
    expect(previewKind('application/octet-stream')).toBe('none')
    // 팀의 화면설계서 — 인라인 렌더는 명시적 범위 밖
    expect(previewKind('text/html')).toBe('none')
    expect(previewKind('')).toBe('none')
  })
})
