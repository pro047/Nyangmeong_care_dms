import { describe, expect, it } from 'vitest'
import {
  BULK_MAX_TOTAL_BYTES,
  UNCATEGORIZED_NAME,
  bulkCategories,
  bulkDocumentQuery,
  bulkDownloadUrl,
  bulkTotalBytes,
  bulkZipName,
  categoryIdOf,
  exceedsBulkLimit,
  planZipEntries,
  safeZipSegment,
  selectBulkDocuments,
  toBulkDocuments,
  type BulkDocument,
  type BulkDocumentRow,
} from '@/lib/bulk-download'
import type { FolderRow } from '@/lib/folder'
import { activeDocumentWhere } from '@/lib/trash'

const LOGIN_HTML = '로그인·회원가입_화면설계서_v0.10_20260930.html'
const PLACE_XLSX = '05_플레이스_동물병원_기능명세서_v0.2_260908 (1).xlsx'

// 화면설계서 > 마이페이지 > 설정 (3단) + 요구사항. 크기는 자릿수를 갈라 둬서 합이 섞이면 드러난다.
const FOLDERS: FolderRow[] = [
  { id: 'f-screen', name: '화면설계서', parentId: null },
  { id: 'f-my', name: '마이페이지', parentId: 'f-screen' },
  { id: 'f-set', name: '설정', parentId: 'f-my' },
  { id: 'f-req', name: '요구사항', parentId: null },
]

const DOCUMENTS: BulkDocument[] = [
  { id: 'd01', title: '문서 d01', folderId: 'f-screen', fileName: LOGIN_HTML, sizeBytes: 100 },
  { id: 'd02', title: '문서 d02', folderId: 'f-my', fileName: PLACE_XLSX, sizeBytes: 20 },
  { id: 'd03', title: '문서 d03', folderId: 'f-set', fileName: '설정.md', sizeBytes: 3 },
  { id: 'd04', title: '문서 d04', folderId: 'f-req', fileName: '요구사항.xlsx', sizeBytes: 4000 },
  { id: 'd05', title: '문서 d05', folderId: null, fileName: '메모.txt', sizeBytes: 50000 },
]

function doc(id: string, folderId: string | null, fileName: string, sizeBytes = 1): BulkDocument {
  return { id, title: `문서 ${id}`, folderId, fileName, sizeBytes }
}

function pathsById(folders: FolderRow[], documents: BulkDocument[]): Record<string, string> {
  return Object.fromEntries(planZipEntries(folders, documents).map((e) => [e.documentId, e.path]))
}

const collisionKey = (path: string) => path.normalize('NFC').toLowerCase()

describe('toBulkDocuments', () => {
  it('AC-1 버전이 [v1, v3, v2] 순서로 들어오면 v3 의 파일명·크기를 골라야 한다', () => {
    const rows: BulkDocumentRow[] = [
      {
        id: 'd01',
        title: '화면설계서',
        folderId: 'f-screen',
        versions: [
          { versionNo: 1, fileName: 'v1.html', sizeBytes: 11 },
          { versionNo: 3, fileName: 'v3.html', sizeBytes: 33 },
          { versionNo: 2, fileName: 'v2.html', sizeBytes: 22 },
        ],
      },
    ]

    const documents = toBulkDocuments(rows)

    expect(documents).toEqual([
      { id: 'd01', title: '화면설계서', folderId: 'f-screen', fileName: 'v3.html', sizeBytes: 33, versionNo: 3 },
    ])
  })

  it('AC-1 문서 1건당 결과가 1건이고 버전이 없는 문서는 빠져야 한다', () => {
    const rows: BulkDocumentRow[] = [
      {
        id: 'd01',
        title: '둘',
        folderId: null,
        versions: [
          { versionNo: 2, fileName: 'b.md', sizeBytes: 2 },
          { versionNo: 1, fileName: 'a.md', sizeBytes: 1 },
        ],
      },
      { id: 'd02', title: '버전 없음', folderId: 'f-req', versions: [] },
      {
        id: 'd03',
        title: '하나',
        folderId: 'f-req',
        versions: [{ versionNo: 7, fileName: 'only.xlsx', sizeBytes: 70 }],
      },
    ]

    const documents = toBulkDocuments(rows)

    const byId = new Map(documents.map((d) => [d.id, d]))
    expect(documents).toHaveLength(2)
    expect(byId.get('d01')).toEqual({
      id: 'd01',
      title: '둘',
      folderId: null,
      fileName: 'b.md',
      sizeBytes: 2,
      versionNo: 2,
    })
    expect(byId.get('d03')).toEqual({
      id: 'd03',
      title: '하나',
      folderId: 'f-req',
      fileName: 'only.xlsx',
      sizeBytes: 70,
      versionNo: 7,
    })
    expect(byId.has('d02')).toBe(false)
  })

  it('AC-1 빈 목록이면 빈 목록을 돌려줘야 한다', () => {
    expect(toBulkDocuments([])).toEqual([])
  })
})

describe('bulkCategories', () => {
  it('AC-2 최상위 폴더를 이름순으로 내고 미분류를 끝에 두며 손자 폴더 문서까지 합쳐야 한다', () => {
    const categories = bulkCategories(FOLDERS, DOCUMENTS)

    expect(UNCATEGORIZED_NAME).toBe('미분류')
    expect(categories).toEqual([
      { folderId: 'f-req', name: '요구사항', documentCount: 1, totalBytes: 4000 },
      { folderId: 'f-screen', name: '화면설계서', documentCount: 3, totalBytes: 123 },
      { folderId: null, name: '미분류', documentCount: 1, totalBytes: 50000 },
    ])
  })

  it('AC-2 입력 순서를 뒤집어도 같은 종류 목록이 나와야 한다', () => {
    const categories = bulkCategories([...FOLDERS].reverse(), [...DOCUMENTS].reverse())

    expect(categories.map((c) => c.folderId)).toEqual(['f-req', 'f-screen', null])
  })

  it('AC-2 문서가 없는 최상위 폴더는 0건으로 나오고 폴더 없는 문서가 없으면 미분류가 없어야 한다', () => {
    const folders: FolderRow[] = [...FOLDERS, { id: 'f-plan', name: '기획서', parentId: null }]
    const documents = DOCUMENTS.filter((d) => d.folderId !== null)

    const categories = bulkCategories(folders, documents)

    expect(categories).toEqual([
      { folderId: 'f-plan', name: '기획서', documentCount: 0, totalBytes: 0 },
      { folderId: 'f-req', name: '요구사항', documentCount: 1, totalBytes: 4000 },
      { folderId: 'f-screen', name: '화면설계서', documentCount: 3, totalBytes: 123 },
    ])
  })

  it('AC-2 폴더도 문서도 없으면 빈 목록이어야 한다', () => {
    expect(bulkCategories([], [])).toEqual([])
  })

  it('AC-3 목록에 없는 폴더와 조상이 끊긴 폴더의 문서는 미분류로 세어야 한다', () => {
    const folders: FolderRow[] = [...FOLDERS, { id: 'f-orphan', name: '고아', parentId: 'gone' }]
    const documents: BulkDocument[] = [
      ...DOCUMENTS,
      doc('d06', 'ghost', '유령.txt', 600000),
      doc('d07', 'f-orphan', '고아.txt', 7000000),
    ]

    const categories = bulkCategories(folders, documents)

    expect(categories).toEqual([
      { folderId: 'f-req', name: '요구사항', documentCount: 1, totalBytes: 4000 },
      { folderId: 'f-screen', name: '화면설계서', documentCount: 3, totalBytes: 123 },
      { folderId: null, name: '미분류', documentCount: 3, totalBytes: 7650000 },
    ])
    expect(categories.reduce((sum, c) => sum + c.documentCount, 0)).toBe(documents.length)
  })
})

describe('categoryIdOf', () => {
  it('AC-3 깊이와 무관하게 최상위 조상의 id 를 돌려줘야 한다', () => {
    expect(categoryIdOf('f-screen', FOLDERS)).toBe('f-screen')
    expect(categoryIdOf('f-my', FOLDERS)).toBe('f-screen')
    expect(categoryIdOf('f-set', FOLDERS)).toBe('f-screen')
    expect(categoryIdOf('f-req', FOLDERS)).toBe('f-req')
  })

  it('AC-3 폴더가 없거나 목록에 없거나 조상이 끊겼으면 null 이어야 한다', () => {
    const folders: FolderRow[] = [
      ...FOLDERS,
      { id: 'f-orphan', name: '고아', parentId: 'gone' },
      { id: 'f-orphan-child', name: '고아의 자식', parentId: 'f-orphan' },
    ]

    expect(categoryIdOf(null, folders)).toBeNull()
    expect(categoryIdOf('ghost', folders)).toBeNull()
    expect(categoryIdOf('f-orphan', folders)).toBeNull()
    expect(categoryIdOf('f-orphan-child', folders)).toBeNull()
  })

  it('AC-3 폴더가 서로를 부모로 가리키는 순환이면 null 이어야 한다', () => {
    const folders: FolderRow[] = [
      { id: 'f-a', name: 'A', parentId: 'f-b' },
      { id: 'f-b', name: 'B', parentId: 'f-a' },
    ]

    expect(categoryIdOf('f-a', folders)).toBeNull()
    expect(categoryIdOf('f-b', folders)).toBeNull()
  })
})

describe('selectBulkDocuments', () => {
  it('AC-4 최상위 폴더를 고르면 직계·자식·손자 폴더 문서만 나와야 한다', () => {
    const selected = selectBulkDocuments(FOLDERS, DOCUMENTS, ['f-screen'])

    expect(selected).toEqual([DOCUMENTS[0], DOCUMENTS[1], DOCUMENTS[2]])
  })

  it('AC-4 null 을 고르면 미분류 문서만 나와야 한다', () => {
    const selected = selectBulkDocuments(FOLDERS, DOCUMENTS, [null])

    expect(selected).toEqual([DOCUMENTS[4]])
  })

  it('AC-4 아무것도 고르지 않으면 빈 목록이어야 한다', () => {
    expect(selectBulkDocuments(FOLDERS, DOCUMENTS, [])).toEqual([])
  })

  it('AC-4 같은 종류를 두 번 골라도 문서가 두 번 나오지 않아야 한다', () => {
    const selected = selectBulkDocuments(FOLDERS, DOCUMENTS, ['f-screen', null, 'f-screen', null])

    expect(selected.map((d) => d.id)).toEqual(['d01', 'd02', 'd03', 'd05'])
  })

  it('AC-4 입력 문서 배열을 뒤집어 넣어도 id 오름차순의 같은 결과가 나와야 한다', () => {
    const reversed = [...DOCUMENTS].reverse()

    const selected = selectBulkDocuments(FOLDERS, reversed, ['f-req', 'f-screen'])

    expect(selected.map((d) => d.id)).toEqual(['d01', 'd02', 'd03', 'd04'])
    expect(selected).toEqual(selectBulkDocuments(FOLDERS, DOCUMENTS, ['f-screen', 'f-req']))
  })

  it('AC-4 목록에 없는 폴더의 문서는 미분류를 골랐을 때 나와야 한다', () => {
    const documents = [...DOCUMENTS, doc('d06', 'ghost', '유령.txt')]

    const selected = selectBulkDocuments(FOLDERS, documents, [null])

    expect(selected.map((d) => d.id)).toEqual(['d05', 'd06'])
  })
})

describe('planZipEntries — 경로', () => {
  it('AC-5 폴더 경로를 따라 넣고 미분류는 미분류 디렉터리에 넣어야 한다', () => {
    const plan = planZipEntries(FOLDERS, [...DOCUMENTS].reverse())

    expect(plan).toEqual([
      { documentId: 'd01', title: '문서 d01', path: `화면설계서/${LOGIN_HTML}`, sizeBytes: 100 },
      {
        documentId: 'd02',
        title: '문서 d02',
        path: `화면설계서/마이페이지/${PLACE_XLSX}`,
        sizeBytes: 20,
      },
      {
        documentId: 'd03',
        title: '문서 d03',
        path: '화면설계서/마이페이지/설정/설정.md',
        sizeBytes: 3,
      },
      { documentId: 'd04', title: '문서 d04', path: '요구사항/요구사항.xlsx', sizeBytes: 4000 },
      { documentId: 'd05', title: '문서 d05', path: '미분류/메모.txt', sizeBytes: 50000 },
    ])
  })

  it('AC-5 운영 파일명은 한 글자도 바뀌지 않아야 한다', () => {
    expect(safeZipSegment(LOGIN_HTML)).toBe(LOGIN_HTML)
    expect(safeZipSegment(PLACE_XLSX)).toBe(PLACE_XLSX)
  })

  it('AC-5 목록에 없는 폴더와 조상이 끊긴 폴더의 문서는 미분류 디렉터리로 가야 한다', () => {
    const folders: FolderRow[] = [...FOLDERS, { id: 'f-orphan', name: '고아', parentId: 'gone' }]
    const documents = [doc('d06', 'ghost', '유령.txt'), doc('d07', 'f-orphan', '고아.txt')]

    const paths = pathsById(folders, documents)

    expect(paths).toEqual({ d06: '미분류/유령.txt', d07: '미분류/고아.txt' })
  })

  it('AC-5 문서가 없으면 빈 계획이어야 한다', () => {
    expect(planZipEntries(FOLDERS, [])).toEqual([])
  })
})

describe('planZipEntries — 겹침', () => {
  const folders: FolderRow[] = [
    { id: 'f-1', name: '가', parentId: null },
    { id: 'f-2', name: '나', parentId: null },
  ]

  it('AC-6 같은 폴더에 같은 이름이 3건이면 id 오름차순으로 번호를 붙여야 한다', () => {
    const documents = [doc('d01', 'f-1', 'a.txt'), doc('d02', 'f-1', 'a.txt'), doc('d03', 'f-1', 'a.txt')]

    const paths = pathsById(folders, documents)

    expect(paths).toEqual({ d01: '가/a.txt', d02: '가/a (2).txt', d03: '가/a (3).txt' })
  })

  it('AC-6 입력 순서를 섞어도 같은 문서가 같은 이름을 받아야 한다', () => {
    const documents = [doc('d03', 'f-1', 'a.txt'), doc('d01', 'f-1', 'a.txt'), doc('d02', 'f-1', 'a.txt')]

    const plan = planZipEntries(folders, documents)

    expect(plan.map((e) => [e.documentId, e.path])).toEqual([
      ['d01', '가/a.txt'],
      ['d02', '가/a (2).txt'],
      ['d03', '가/a (3).txt'],
    ])
  })

  it('AC-6 확장자가 없으면 번호를 끝에 붙여야 한다', () => {
    const documents = [doc('d01', 'f-1', 'README'), doc('d02', 'f-1', 'README')]

    expect(pathsById(folders, documents)).toEqual({ d01: '가/README', d02: '가/README (2)' })
  })

  it('AC-6 점으로 시작하는 이름은 그 점을 확장자 구분으로 보지 않아야 한다', () => {
    const documents = [doc('d01', 'f-1', '.env'), doc('d02', 'f-1', '.env')]

    expect(pathsById(folders, documents)).toEqual({ d01: '가/.env', d02: '가/.env (2)' })
  })

  it('AC-6 점이 여러 개면 마지막 점 앞에 번호를 붙여야 한다', () => {
    const documents = [doc('d01', 'f-1', 'v0.10.html'), doc('d02', 'f-1', 'v0.10.html')]

    expect(pathsById(folders, documents)).toEqual({ d01: '가/v0.10.html', d02: '가/v0.10 (2).html' })
  })

  it('AC-6 대소문자만 다른 이름은 겹침으로 봐야 한다', () => {
    const documents = [doc('d01', 'f-1', 'A.TXT'), doc('d02', 'f-1', 'a.txt')]

    expect(pathsById(folders, documents)).toEqual({ d01: '가/A.TXT', d02: '가/a (2).txt' })
  })

  it('AC-6 NFD 로 분해된 한글 이름과 NFC 이름은 겹침으로 보고 NFC 로 넣어야 한다', () => {
    const nfc = '보고서.md'.normalize('NFC')
    const nfd = '보고서.md'.normalize('NFD')
    const documents = [doc('d01', 'f-1', nfd), doc('d02', 'f-1', nfc)]

    const paths = pathsById(folders, documents)

    expect(nfd).not.toBe(nfc)
    expect(paths).toEqual({ d01: '가/보고서.md', d02: '가/보고서 (2).md' })
  })

  it('AC-6 번호가 붙은 모양의 이름이 이미 있어도 경로가 서로 달라야 한다', () => {
    const documents = [
      doc('d01', 'f-1', 'a.txt'),
      doc('d02', 'f-1', 'a.txt'),
      doc('d03', 'f-1', 'a (2).txt'),
    ]

    const paths = pathsById(folders, documents)

    expect(paths.d01).toBe('가/a.txt')
    expect(paths.d02).toBe('가/a (2).txt')
    expect(new Set(Object.values(paths).map(collisionKey)).size).toBe(3)
    expect(Object.values(paths).every((p) => p.startsWith('가/') && p.endsWith('.txt'))).toBe(true)
  })

  it('AC-6 다른 폴더의 같은 파일명에는 번호를 붙이지 않아야 한다', () => {
    const documents = [doc('d01', 'f-1', 'a.txt'), doc('d02', 'f-2', 'a.txt'), doc('d03', null, 'a.txt')]

    expect(pathsById(folders, documents)).toEqual({
      d01: '가/a.txt',
      d02: '나/a.txt',
      d03: '미분류/a.txt',
    })
  })

  it('AC-6 미분류라는 이름의 실제 폴더와 미분류 문서가 같은 파일명이면 번호를 붙여야 한다', () => {
    const named: FolderRow[] = [{ id: 'f-none', name: '미분류', parentId: null }]
    const documents = [doc('d01', 'f-none', 'x.txt'), doc('d02', null, 'x.txt')]

    expect(pathsById(named, documents)).toEqual({ d01: '미분류/x.txt', d02: '미분류/x (2).txt' })
  })

  it('AC-8 파일 이름이 형제 하위 폴더 이름과 같으면 번호를 붙여야 한다', () => {
    const documents = [doc('d01', 'f-screen', '마이페이지'), doc('d02', 'f-my', '안쪽.md')]

    const paths = pathsById(FOLDERS, documents)

    expect(paths.d01).not.toBe('화면설계서/마이페이지')
    expect(paths).toEqual({
      d01: '화면설계서/마이페이지 (2)',
      d02: '화면설계서/마이페이지/안쪽.md',
    })
  })

  it('AC-8 id 가 뒤여도 디렉터리 쪽이 이름을 지켜야 한다', () => {
    const documents = [doc('d01', 'f-my', '안쪽.md'), doc('d02', 'f-screen', '마이페이지')]

    expect(pathsById(FOLDERS, documents)).toEqual({
      d01: '화면설계서/마이페이지/안쪽.md',
      d02: '화면설계서/마이페이지 (2)',
    })
  })
})

describe('safeZipSegment', () => {
  it('AC-7 점뿐이거나 비었거나 공백뿐이면 _ 여야 한다', () => {
    expect(safeZipSegment('..')).toBe('_')
    expect(safeZipSegment('.')).toBe('_')
    expect(safeZipSegment('')).toBe('_')
    expect(safeZipSegment('   ')).toBe('_')
  })

  it('AC-7 이름 가운데의 점은 그대로 둬야 한다', () => {
    expect(safeZipSegment('a..b')).toBe('a..b')
  })

  it('AC-7 경로 구분자와 Windows 금지 글자를 _ 로 바꿔야 한다', () => {
    expect(safeZipSegment('a:b*c?')).toBe('a_b_c_')
    expect(safeZipSegment('a/b')).toBe('a_b')
    expect(safeZipSegment('x\\y')).toBe('x_y')
    expect(safeZipSegment('"<>|')).toBe('____')
    expect(safeZipSegment('../../etc/passwd')).toBe('.._.._etc_passwd')
  })

  it('AC-7 제어문자를 지우고 앞뒤 공백과 끝의 점을 떼야 한다', () => {
    expect(safeZipSegment('a\u0000b\u001f\u007f.txt')).toBe('ab.txt')
    expect(safeZipSegment('  보고서.md  ')).toBe('보고서.md')
    expect(safeZipSegment('name. ')).toBe('name')
    expect(safeZipSegment('a.txt.')).toBe('a.txt')
  })

  it('AC-7 NFD 이름을 NFC 로 바꿔야 한다', () => {
    const nfd = '한글.md'.normalize('NFD')

    expect(safeZipSegment(nfd)).toBe('한글.md'.normalize('NFC'))
  })
})

describe('planZipEntries — 정리', () => {
  // 위험한 이름의 폴더를 5단으로 쌓는다. 이름 속 '/' 가 층을 늘리면 세그먼트 수가 틀어진다.
  const hostile: FolderRow[] = [
    { id: 'h1', name: 'a/b', parentId: null },
    { id: 'h2', name: '..', parentId: 'h1' },
    { id: 'h3', name: '.', parentId: 'h2' },
    { id: 'h4', name: 'x\\y', parentId: 'h3' },
    { id: 'h5', name: '   ', parentId: 'h4' },
  ]
  const depthOf: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5 }
  const documents: BulkDocument[] = [
    doc('d01', 'h1', '일.txt'),
    doc('d02', 'h2', '이.txt'),
    doc('d03', 'h3', '삼.txt'),
    doc('d04', 'h4', '사.txt'),
    doc('d05', 'h5', '../../etc/passwd'),
    doc('d06', 'h5', '..'),
    doc('d07', 'h5', 'a\\b.txt'),
    doc('d08', 'h5', '제\u0000어\u001f.txt'),
    doc('d09', null, '/etc/passwd'),
    doc('d10', null, '..'),
  ]

  it('AC-7 위험한 폴더명·파일명이 들어와도 모든 경로가 안전해야 한다', () => {
    const plan = planZipEntries(hostile, documents)

    expect(plan).toHaveLength(documents.length)
    for (const entry of plan) {
      const segments = entry.path.split('/')
      const source = documents.find((d) => d.id === entry.documentId)
      const depth = source?.folderId ? depthOf[source.folderId] : 1

      expect(entry.path.startsWith('/')).toBe(false)
      expect(entry.path.includes('\\')).toBe(false)
      expect(segments.filter((s) => s === '' || s === '.' || s === '..')).toEqual([])
      expect(segments).toHaveLength(depth + 1)
    }
  })

  it('AC-7 정리된 경로가 규칙대로의 값이어야 한다', () => {
    expect(pathsById(hostile, documents)).toEqual({
      d01: 'a_b/일.txt',
      d02: 'a_b/_/이.txt',
      d03: 'a_b/_/_/삼.txt',
      d04: 'a_b/_/_/x_y/사.txt',
      d05: 'a_b/_/_/x_y/_/.._.._etc_passwd',
      d06: 'a_b/_/_/x_y/_/_',
      d07: 'a_b/_/_/x_y/_/a_b.txt',
      d08: 'a_b/_/_/x_y/_/제어.txt',
      d09: '미분류/_etc_passwd',
      d10: '미분류/_',
    })
  })
})

describe('합계 상한', () => {
  it('AC-9 상한은 200MB 이고 초과일 때만 막아야 한다', () => {
    expect(BULK_MAX_TOTAL_BYTES).toBe(209715200)
    expect(exceedsBulkLimit(209715200)).toBe(false)
    expect(exceedsBulkLimit(209715201)).toBe(true)
    expect(exceedsBulkLimit(0)).toBe(false)
  })

  it('AC-9 상한을 넘겨주면 그 값을 기준으로 판정해야 한다', () => {
    expect(exceedsBulkLimit(10, 10)).toBe(false)
    expect(exceedsBulkLimit(11, 10)).toBe(true)
  })

  it('AC-9 합계는 sizeBytes 의 합이고 빈 배열이면 0 이어야 한다', () => {
    expect(bulkTotalBytes(DOCUMENTS)).toBe(54123)
    expect(bulkTotalBytes([{ sizeBytes: 209715200 }, { sizeBytes: 1 }])).toBe(209715201)
    expect(bulkTotalBytes([])).toBe(0)
  })
})

describe('bulkDownloadUrl', () => {
  // 불변식: 파일은 앱 서버를 거치지 않는다 — 새 라우트가 아니라 기존 presigned 리다이렉트 라우트를 쓴다.
  it('AC-10 쿼리 없이 기존 다운로드 라우트 경로를 돌려줘야 한다', () => {
    const url = bulkDownloadUrl('abc')

    expect(url).toBe('/api/documents/abc/download')
    expect(url.includes('?')).toBe(false)
  })

  // 리뷰 뒤 추가: 화면을 연 뒤 재업로드되면 옛 파일명으로 새 내용이 들어간다 — 판을 지목한다.
  it('판 번호를 주면 그 판을 지목하는 ?v= 를 붙여야 한다', () => {
    expect(bulkDownloadUrl('abc', 3)).toBe('/api/documents/abc/download?v=3')
  })

  it('AC-10 id 의 / 를 %2F 로 인코딩해야 한다', () => {
    expect(bulkDownloadUrl('a/b')).toBe('/api/documents/a%2Fb/download')
  })
})

describe('bulkZipName', () => {
  it('AC-11 서울 시각으로 이름을 만들어 UTC 15:30 이면 다음 날 00:30 이어야 한다', () => {
    expect(bulkZipName(new Date('2026-10-11T15:30:00Z'))).toBe('DMS_문서_20261012_0030.zip')
  })

  it('AC-11 한 자리 월·일·시·분은 0 으로 채워야 한다', () => {
    expect(bulkZipName(new Date('2026-01-05T00:07:00Z'))).toBe('DMS_문서_20260105_0907.zip')
  })
})

describe('bulkDocumentQuery', () => {
  // 불변식: "최신 버전"은 컬럼이 아니라 versionNo desc 정렬로 구한다.
  it('AC-12 휴지통을 거르고 최신 버전 1건만 읽는 조회 인자를 만들어야 한다', () => {
    const query = bulkDocumentQuery()

    expect(query.where).toEqual(activeDocumentWhere())
    expect(query.where).toEqual({ deletedAt: null })
    expect(query.select).toMatchObject({ id: true, title: true, folderId: true })
    expect(query.select.versions.orderBy).toEqual({ versionNo: 'desc' })
    expect(query.select.versions.take).toBe(1)
    expect(query.select.versions.select).toMatchObject({
      versionNo: true,
      fileName: true,
      sizeBytes: true,
    })
  })

  it('AC-12 부를 때마다 새 객체를 돌려줘야 한다', () => {
    const first = bulkDocumentQuery()
    const second = bulkDocumentQuery()

    expect(first).not.toBe(second)
    expect(first.where).not.toBe(second.where)
    expect(first).toEqual(second)
  })
})
