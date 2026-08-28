export type PreviewKind = 'pdf' | 'image' | 'none'

/**
 * 주말 범위: PDF와 이미지만 브라우저에서 바로 미리보기. 나머지는 다운로드.
 *
 * s3.ts 가 아니라 여기 있는 이유 — 판정 하나 때문에 페이지 컴포넌트가
 * S3Client 와 env 검증을 만드는 모듈을 끌어들일 이유가 없다.
 */
export function previewKind(mimeType: string): PreviewKind {
  // DB 의 mimeType 은 업로드 때 브라우저가 신고한 값이라 대소문자를 믿지 않는다.
  const type = mimeType.toLowerCase()
  if (type === 'application/pdf') return 'pdf'
  if (type.startsWith('image/')) return 'image'
  return 'none'
}
