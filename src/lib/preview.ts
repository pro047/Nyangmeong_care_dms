export type PreviewKind = 'pdf' | 'image' | 'html' | 'xlsx' | 'markdown' | 'none'

// mcp/read-tools.ts 의 EXTENSION_RE·EXTENSION_KIND 와 같은 규칙이다. 그 모듈은 zod·xlsx 로더를
// 끌고 와서 import 하지 않고 여기에 작게 다시 쓴다. 갈라지면 preview.test.ts 가 잡는다.
// 첫 글자가 영문이어야 확장자다 — `spec_v0.3` 의 `.3` 을 확장자로 읽지 않으려고.
const EXTENSION_RE = /\.([a-z][a-z0-9]{0,9})$/i
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown'])

/**
 * 브라우저가 그대로 열 수 있는 형식만 인라인으로 본다. 나머지는 다운로드.
 *
 * s3.ts 가 아니라 여기 있는 이유 — 판정 하나 때문에 페이지 컴포넌트가
 * S3Client 와 env 검증을 만드는 모듈을 끌어들일 이유가 없다.
 */
export function previewKind(mimeType: string, fileName = ''): PreviewKind {
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
  // .md 는 브라우저가 mimeType 을 비우거나 octet-stream 으로 신고하는 일이 있어서 확장자를
  // 먼저 본다. 기존 네 형식을 앞에 둔 이유 — 이름이 .md 여도 그 판정이 바뀌면 안 된다.
  const ext = EXTENSION_RE.exec(fileName)?.[1].toLowerCase()
  if (ext !== undefined ? MARKDOWN_EXTENSIONS.has(ext) : type === 'text/markdown') return 'markdown'
  return 'none'
}
