import { describe, expect, it } from 'vitest'
import { previewKind } from '@/lib/preview'
import { readableKind } from '@/lib/mcp/read-tools'

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

  it('xlsx 는 전용 뷰어로 간다 — 팀 문서 10건이 이 경로다', () => {
    expect(previewKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(
      'xlsx',
    )
    expect(previewKind('APPLICATION/VND.OPENXMLFORMATS-OFFICEDOCUMENT.SPREADSHEETML.SHEET')).toBe(
      'xlsx',
    )
    // 구 이진 형식은 ExcelJS 가 못 읽는다. xlsx 로 보내면 빈 화면이 되므로 폴백이 낫다
    expect(previewKind('application/vnd.ms-excel')).toBe('none')
    // docx 는 여전히 범위 밖이다
    expect(
      previewKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).toBe('none')
  })

  it('그 외는 전부 none — 폴백 박스(아이콘 + 다운로드)로 간다', () => {
    // file.type 이 비었을 때 업로드가 저장하는 폴백값
    expect(previewKind('application/octet-stream')).toBe('none')
    expect(previewKind('')).toBe('none')
  })
})

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

describe('previewKind — 마크다운 판정', () => {
  // AC-1
  it.each([
    ['text/markdown', 'notes.md'],
    ['text/markdown', 'd.markdown'],
    // 확장자의 대소문자도 믿지 않는다
    ['text/markdown', 'C.MD'],
    // 확장자가 없으면 그때만 mimeType 을 본다
    ['text/markdown', 'README'],
    ['text/markdown; charset=utf-8', 'README'],
    ['TEXT/MARKDOWN', 'README'],
  ])('AC-1 mimeType 이 %s 이고 파일명이 %s 이면 markdown 이어야 한다', (mimeType, fileName) => {
    const kind = previewKind(mimeType, fileName)

    expect(kind).toBe('markdown')
  })

  // AC-1 — fileName 기본값은 '' 이다. 확장자 없는 파일과 같은 길을 탄다
  it('AC-1 파일명 없이 text/markdown 만 주면 markdown 이어야 한다', () => {
    const kind = previewKind('text/markdown')

    expect(kind).toBe('markdown')
  })

  // AC-2 — 완료 조건 3. file.type 이 비면 업로드가 octet-stream 으로 저장한다
  it.each([
    ['application/octet-stream', 'notes.md'],
    ['', 'notes.md'],
    ['text/plain', 'notes.md'],
    ['APPLICATION/OCTET-STREAM', 'NOTES.Markdown'],
    // 점이 여러 개여도 마지막 꼬리가 확장자다
    ['application/octet-stream', 'spec_v0.3.md'],
  ])('AC-2 mimeType 이 %s 여도 파일명이 %s 이면 markdown 이어야 한다', (mimeType, fileName) => {
    const kind = previewKind(mimeType, fileName)

    expect(kind).toBe('markdown')
  })

  // AC-3 — 마크다운 판정은 예전에 none 이던 입력에만 닿아야 한다
  it.each([
    ['application/pdf', 'a.md', 'pdf'],
    ['image/png', 'a.md', 'image'],
    ['text/html', 'a.md', 'html'],
    [XLSX_MIME, 'a.md', 'xlsx'],
    ['text/html; charset=utf-8', 'a.markdown', 'html'],
    ['APPLICATION/PDF', 'A.MD', 'pdf'],
  ])(
    'AC-3 mimeType 이 %s 이면 파일명이 %s 여도 기존 판정 %s 이 이겨야 한다',
    (mimeType, fileName, expected) => {
      const kind = previewKind(mimeType, fileName)

      expect(kind).toBe(expected)
    },
  )

  // AC-3
  it.each([
    ['application/octet-stream', 'none'],
    ['text/plain', 'none'],
    ['', 'none'],
    ['application/pdf', 'pdf'],
    ['image/jpeg', 'image'],
    ['text/html', 'html'],
    [XLSX_MIME, 'xlsx'],
  ])('AC-3 인자 1개로 %s 를 주면 예전과 같이 %s 이어야 한다', (mimeType, expected) => {
    const kind = previewKind(mimeType)

    expect(kind).toBe(expected)
  })

  // AC-3 — 기존 형식의 판정은 파일명이 무엇이든 같아야 한다
  it.each([
    ['application/pdf', 'a.pdf', 'pdf'],
    ['application/pdf', 'a.txt', 'pdf'],
    ['image/svg+xml', 'README', 'image'],
    ['text/html', '', 'html'],
    [XLSX_MIME, 'a.xlsx', 'xlsx'],
  ])(
    'AC-3 mimeType 이 %s 이면 파일명 %s 와 무관하게 %s 이어야 한다',
    (mimeType, fileName, expected) => {
      const kind = previewKind(mimeType, fileName)

      expect(kind).toBe(expected)
    },
  )

  // AC-5
  it.each([
    ['application/octet-stream', 'a.txt'],
    ['application/octet-stream', 'README'],
    // 확장자가 있으면 확장자만 본다 — mimeType 이 markdown 이어도 txt 는 txt 다
    ['text/markdown', 'a.txt'],
    // 숫자로 시작하는 꼬리(.3)는 확장자가 아니다
    ['application/octet-stream', 'spec_v0.3'],
    [DOCX_MIME, 'a.docx'],
    // MCP 표에 없는 별칭은 받지 않는다
    ['text/x-markdown', 'README'],
    // md 로 "시작하는" 확장자·중간에 낀 .md 는 마크다운이 아니다
    ['application/octet-stream', 'a.mdx'],
    ['application/octet-stream', 'a.md.txt'],
    ['application/octet-stream', 'amd'],
    ['text/plain', 'md'],
    ['application/octet-stream', ''],
  ])('AC-5 mimeType 이 %s 이고 파일명이 %s 이면 none 이어야 한다', (mimeType, fileName) => {
    const kind = previewKind(mimeType, fileName)

    expect(kind).toBe('none')
  })
})

describe('previewKind — MCP 읽기 도구의 확장자 표와 어긋나지 않는다', () => {
  const FILE_NAMES = [
    'a.md',
    'a.MD',
    'a.markdown',
    'a.txt',
    'a.csv',
    'a.docx',
    'README',
    'spec_v0.3',
    'spec_v0.3.md',
    '',
    // 설계 목록 밖 — 규칙을 다르게 옮겼을 때 갈리는 자리
    'a.mdx',
    'a.md.txt',
    '.md',
    'a.Markdown',
  ]
  const MIME_TYPES = [
    'text/markdown',
    'text/x-markdown',
    'text/plain',
    'application/octet-stream',
    '',
    'text/markdown; charset=utf-8',
  ]
  const CASES = FILE_NAMES.flatMap((fileName) =>
    MIME_TYPES.map((mimeType) => [fileName, mimeType] as const),
  )

  // AC-4
  it.each(CASES)(
    'AC-4 파일명 "%s" · mimeType "%s" 의 markdown 여부는 readableKind 와 같아야 한다',
    (fileName, mimeType) => {
      const expected = readableKind(fileName, mimeType) === 'markdown'

      const actual = previewKind(mimeType, fileName) === 'markdown'

      expect(actual).toBe(expected)
    },
  )

  // AC-4 — 위 대조가 "양쪽 다 false" 로만 맞아떨어지는 것을 막는다
  // md 확장자 6개 × mimeType 6개 = 36, 확장자 없는 이름 3개 × text/markdown 계열 2개 = 6
  it('AC-4 대조 조합 가운데 previewKind 가 markdown 이라고 한 것은 42건이어야 한다', () => {
    const markdownCases = CASES.filter(
      ([fileName, mimeType]) => previewKind(mimeType, fileName) === 'markdown',
    )

    expect(markdownCases).toHaveLength(42)
  })
})
