import type { BulkDownloadResult } from '@/lib/bulk-download-run'

export const BULK_TOO_LARGE_MESSAGE =
  '한 번에 받을 수 있는 크기(200MB)를 넘습니다. 종류를 줄여 주세요.'

type BulkDownloadMessage = { tone: 'success' | 'error'; message: string }

export function bulkDownloadMessage(result: BulkDownloadResult): BulkDownloadMessage | null {
  switch (result.kind) {
    case 'done':
      return {
        tone: 'success',
        message: `문서 ${result.savedCount}개를 받았습니다.${
          result.skipped.length > 0
            ? ` 휴지통으로 옮겨져 받지 못한 문서: ${result.skipped.map((doc) => doc.title).join(', ')}`
            : ''
        }`,
      }
    case 'all-skipped':
      return { tone: 'error', message: '고른 문서가 모두 휴지통으로 옮겨져 받지 못했습니다.' }
    case 'failed':
      return {
        tone: 'error',
        message: `${result.message}${result.document ? ` (문서: ${result.document.title})` : ''} — zip은 저장되지 않았습니다.`,
      }
    case 'too-large':
      return { tone: 'error', message: BULK_TOO_LARGE_MESSAGE }
    case 'empty':
      return { tone: 'error', message: '받을 문서가 있는 종류를 골라 주세요.' }
    case 'cancelled':
      return null
  }
}
