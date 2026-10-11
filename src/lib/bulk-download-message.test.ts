import { describe, expect, it } from 'vitest'
import { bulkDownloadMessage } from './bulk-download-message'

describe('bulkDownloadMessage', () => {
  it('완료하면 실제 저장한 문서 수를 알린다', () => {
    expect(bulkDownloadMessage({ kind: 'done', zipName: '문서.zip', savedCount: 3, skipped: [] }))
      .toEqual({ tone: 'success', message: '문서 3개를 받았습니다.' })
  })

  it('일부를 건너뛰면 빠진 문서 제목을 모두 덧붙인다', () => {
    expect(bulkDownloadMessage({
      kind: 'done', zipName: '문서.zip', savedCount: 1,
      skipped: [
        { documentId: 'a', title: '요구사항' },
        { documentId: 'b', title: '화면설계' },
      ],
    })).toEqual({
      tone: 'success',
      message: '문서 1개를 받았습니다. 휴지통으로 옮겨져 받지 못한 문서: 요구사항, 화면설계',
    })
  })

  it('모두 건너뛰면 성공으로 안내하지 않는다', () => {
    expect(bulkDownloadMessage({
      kind: 'all-skipped', skipped: [{ documentId: 'a', title: '요구사항' }],
    })).toEqual({ tone: 'error', message: '고른 문서가 모두 휴지통으로 옮겨져 받지 못했습니다.' })
  })

  it('파일 받기 실패는 원인과 문서 제목, zip 미저장을 알린다', () => {
    expect(bulkDownloadMessage({
      kind: 'failed', message: '파일을 받지 못했습니다 (403)',
      document: { documentId: 'a', title: '요구사항' },
    })).toEqual({
      tone: 'error',
      message: '파일을 받지 못했습니다 (403) (문서: 요구사항) — zip은 저장되지 않았습니다.',
    })
  })

  it('문서 정보 없는 실패도 원인과 zip 미저장을 알린다', () => {
    expect(bulkDownloadMessage({ kind: 'failed', message: 'zip 을 만들지 못했습니다', document: null }))
      .toEqual({ tone: 'error', message: 'zip 을 만들지 못했습니다 — zip은 저장되지 않았습니다.' })
  })

  it('상한 초과는 종류를 줄이도록 안내한다', () => {
    expect(bulkDownloadMessage({ kind: 'too-large', totalBytes: 300 * 1024 * 1024, limitBytes: 200 * 1024 * 1024 }))
      .toEqual({ tone: 'error', message: '한 번에 받을 수 있는 크기(200MB)를 넘습니다. 종류를 줄여 주세요.' })
  })

  it('빈 선택은 문서가 있는 종류를 고르도록 안내한다', () => {
    expect(bulkDownloadMessage({ kind: 'empty' }))
      .toEqual({ tone: 'error', message: '받을 문서가 있는 종류를 골라 주세요.' })
  })

  it('취소하면 안내하지 않는다', () => {
    expect(bulkDownloadMessage({ kind: 'cancelled' })).toBeNull()
  })
})
