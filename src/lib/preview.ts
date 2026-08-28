export type PreviewKind = 'pdf' | 'image' | 'html' | 'xlsx' | 'none'

/**
 * 브라우저가 그대로 열 수 있는 형식만 인라인으로 본다. 나머지는 다운로드.
 *
 * s3.ts 가 아니라 여기 있는 이유 — 판정 하나 때문에 페이지 컴포넌트가
 * S3Client 와 env 검증을 만드는 모듈을 끌어들일 이유가 없다.
 */
export function previewKind(mimeType: string): PreviewKind {
  // DB 의 mimeType 은 업로드 때 브라우저가 신고한 값이라 대소문자를 믿지 않는다.
  // 파라미터(`text/html; charset=utf-8`)도 잘라낸다 — 지금 저장된 값에는 안 붙어
  // 있지만(S3 실측), 붙는 순간 미리보기가 이유 없이 폴백 박스로 떨어진다.
  const type = mimeType.split(';')[0].trim().toLowerCase()
  if (type === 'application/pdf') return 'pdf'
  if (type.startsWith('image/')) return 'image'
  // html 은 pdf 와 같은 iframe 을 탄다 — S3 오리진에서 실행되므로 앱에 닿지 못한다.
  if (type === 'text/html') return 'html'
  // xlsx 는 브라우저가 못 여는 유일한 예외다. 전용 뷰어가 받아 직접 그린다.
  // xls(구 이진 형식)는 뺀다 — ExcelJS 가 못 읽어서 빈 화면이 된다.
  if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx'
  return 'none'
}
