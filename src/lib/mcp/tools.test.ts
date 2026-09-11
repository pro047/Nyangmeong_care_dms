import { describe, expect, it } from 'vitest'
import {
  getDocumentInputSchema,
  getDownloadUrlInputSchema,
  listFoldersInputSchema,
  searchDocumentsInputSchema,
  toDocumentDetail,
  toDocumentSummary,
  toDownloadResult,
  toFolderRow,
  type DocumentDetailRow,
  type DocumentSummaryRow,
} from '@/lib/mcp/tools'

describe('입력 스키마', () => {
  it('search_documents: take=0 은 거부해야 한다', () => {
    expect(searchDocumentsInputSchema.safeParse({ take: 0 }).success).toBe(false)
  })

  it('search_documents: take=51 은 거부해야 한다', () => {
    expect(searchDocumentsInputSchema.safeParse({ take: 51 }).success).toBe(false)
  })

  it('search_documents: q 가 101자면 거부해야 한다', () => {
    expect(searchDocumentsInputSchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false)
  })

  it('search_documents: 빈 입력은 통과하고 take 기본값 20 을 채워야 한다', () => {
    const result = searchDocumentsInputSchema.safeParse({})
    expect(result.success).toBe(true)
    expect(result.success && result.data.take).toBe(20)
  })

  it('list_folders: 빈 객체를 받아야 한다', () => {
    expect(listFoldersInputSchema.safeParse({}).success).toBe(true)
  })

  it('get_document: id 없이는 거부해야 한다', () => {
    expect(getDocumentInputSchema.safeParse({}).success).toBe(false)
  })

  it('get_download_url: versionNo=0 은 거부해야 한다', () => {
    expect(getDownloadUrlInputSchema.safeParse({ id: 'doc_1', versionNo: 0 }).success).toBe(false)
  })
})

function makeRow(versions: DocumentSummaryRow['versions']): DocumentSummaryRow {
  return {
    id: 'doc_1',
    title: '제목',
    description: null,
    createdAt: new Date('2026-01-01'),
    folder: null,
    createdBy: { username: '홍길동' },
    tags: [],
    versions,
  }
}

describe('toDocumentSummary', () => {
  it('versions 가 빈 배열이면 latest 는 null 이어야 한다', () => {
    const summary = toDocumentSummary(makeRow([]))
    expect(summary.latest).toBeNull()
  })

  it('입력 순서와 무관하게 versionNo 가 가장 큰 버전을 latest 로 골라야 한다', () => {
    const summary = toDocumentSummary(
      makeRow([
        { versionNo: 1, fileName: 'a.txt', mimeType: 'text/plain', sizeBytes: 1, createdAt: new Date('2026-01-01') },
        { versionNo: 3, fileName: 'c.txt', mimeType: 'text/plain', sizeBytes: 3, createdAt: new Date('2026-01-03') },
        { versionNo: 2, fileName: 'b.txt', mimeType: 'text/plain', sizeBytes: 2, createdAt: new Date('2026-01-02') },
      ]),
    )
    expect(summary.latest?.versionNo).toBe(3)
    expect(summary.latest?.fileName).toBe('c.txt')
  })
})

describe('toDocumentSummary — 출력 모양', () => {
  it('폴더·태그·작성자를 평평한 값으로 옮기고 파일 정보는 latest 한 벌만 가져야 한다', () => {
    const summary = toDocumentSummary({
      ...makeRow([
        { versionNo: 1, fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 5, createdAt: new Date('2026-01-01') },
      ]),
      folder: { id: 'f1', name: '회의록' },
      tags: [{ tag: { name: '기획' } }, { tag: { name: '확정' } }],
    })

    expect(summary.folder).toEqual({ id: 'f1', name: '회의록' })
    expect(summary.tags).toEqual(['기획', '확정'])
    expect(summary.createdBy).toBe('홍길동')
    // 1문서 = 1파일: 문서 요약에 파일 목록이 아니라 최신 판 하나만 실린다.
    expect(Object.keys(summary)).not.toContain('versions')
    expect(summary.latest).toEqual({
      versionNo: 1,
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 5,
      createdAt: new Date('2026-01-01'),
    })
  })
})

function makeDetailRow(versions: DocumentDetailRow['versions']): DocumentDetailRow {
  return {
    id: 'doc_1',
    title: '제목',
    description: '설명',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-05'),
    folder: null,
    createdBy: { username: '홍길동' },
    tags: [],
    versions,
  }
}

function detailVersion(versionNo: number, uploader: string) {
  return {
    versionNo,
    fileName: `v${versionNo}.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: versionNo,
    changeNote: null,
    createdAt: new Date(`2026-01-0${versionNo}`),
    uploadedBy: { username: uploader },
  }
}

describe('toDocumentDetail', () => {
  it('versions 를 입력 순서와 무관하게 versionNo desc 로 내보내야 한다', () => {
    const detail = toDocumentDetail(
      makeDetailRow([detailVersion(2, 'b'), detailVersion(1, 'a'), detailVersion(3, 'c')]),
    )
    expect(detail.versions.map((v) => v.versionNo)).toEqual([3, 2, 1])
  })

  it('버전마다 올린 사람 이름을 평평하게 옮기고 s3Key 는 싣지 않아야 한다', () => {
    const detail = toDocumentDetail(makeDetailRow([detailVersion(1, '김철수')]))
    expect(detail.versions[0].uploadedBy).toBe('김철수')
    expect(JSON.stringify(detail)).not.toContain('s3Key')
  })

  it('입력 배열을 제자리에서 정렬하지 않아야 한다', () => {
    const versions = [detailVersion(1, 'a'), detailVersion(2, 'b')]
    toDocumentDetail(makeDetailRow(versions))
    expect(versions.map((v) => v.versionNo)).toEqual([1, 2])
  })
})

describe('입력 스키마 — 경계값', () => {
  it('search_documents: take=1·50 과 q 100자는 받아야 한다', () => {
    expect(searchDocumentsInputSchema.safeParse({ take: 1 }).success).toBe(true)
    expect(searchDocumentsInputSchema.safeParse({ take: 50 }).success).toBe(true)
    expect(searchDocumentsInputSchema.safeParse({ q: 'a'.repeat(100) }).success).toBe(true)
  })

  it('search_documents: 정수가 아닌 take 는 거부해야 한다', () => {
    expect(searchDocumentsInputSchema.safeParse({ take: 1.5 }).success).toBe(false)
  })

  it('get_download_url: id 가 없으면 거부하고 versionNo 는 생략할 수 있어야 한다', () => {
    expect(getDownloadUrlInputSchema.safeParse({ versionNo: 1 }).success).toBe(false)
    expect(getDownloadUrlInputSchema.safeParse({ id: 'doc_1' }).success).toBe(true)
  })

  it('get_document: 빈 id 는 거부해야 한다', () => {
    expect(getDocumentInputSchema.safeParse({ id: '' }).success).toBe(false)
  })
})

describe('toFolderRow', () => {
  it('_count.documents 를 documentCount 로 옮겨야 한다', () => {
    const row = toFolderRow({ id: 'f1', name: '화면설계서', parentId: null, _count: { documents: 4 } })
    expect(row).toEqual({ id: 'f1', name: '화면설계서', parentId: null, documentCount: 4 })
  })
})

describe('toDownloadResult', () => {
  it('버전 정보와 url·expiresInSeconds 를 합쳐야 한다', () => {
    const result = toDownloadResult(
      { versionNo: 2, fileName: 'a.hwp', mimeType: 'application/x-hwp', sizeBytes: 10 },
      'https://s3.example.com/signed',
    )
    expect(result).toEqual({
      url: 'https://s3.example.com/signed',
      fileName: 'a.hwp',
      mimeType: 'application/x-hwp',
      sizeBytes: 10,
      expiresInSeconds: 300,
      versionNo: 2,
    })
  })
})
