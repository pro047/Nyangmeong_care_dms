export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`
}

/**
 * 목록에서는 "3시간 전"이, 오래된 건 날짜가 읽기 편하다.
 *
 * 7일이 넘어 날짜로 떨어질 때 **`Asia/Seoul` 을 박는다** — `formatDateTime` 과 같은 이유다.
 * 안 박으면 실행 머신의 TZ 를 쓰는데 **운영(Vercel)은 UTC 이고 팀은 KST** 라, 한국 시각으로
 * 새벽 0~9시에 올린 문서가 목록에서 **하루 이르게** 표시된다. 상대 시각 구간은 차이를
 * 분 단위로 계산해 TZ 를 안 타므로 이 분기만 문제였다 (2026-09-13, 코드 리뷰가 잡음).
 */
export function formatRelative(date: Date) {
  const diffMs = Date.now() - date.getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 전`
  const day = Math.floor(hour / 24)
  if (day < 7) return `${day}일 전`
  return date.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * 버전 타임라인용 절대 시각. 서버 TZ(EC2 는 UTC 일 수 있다)에 흔들리지 않도록 Asia/Seoul 을 박는다.
 * hour12: false 가 필수다 — ko-KR 기본 hourCycle 이 12시간제라 빼면 "오후 07:27" 이 된다.
 */
export function formatDateTime(date: Date) {
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const EXT_LABEL: Record<string, string> = {
  pdf: 'PDF',
  doc: 'DOC',
  docx: 'DOCX',
  xls: 'XLS',
  xlsx: 'XLSX',
  ppt: 'PPT',
  pptx: 'PPTX',
  png: 'PNG',
  jpg: 'JPG',
  jpeg: 'JPG',
  gif: 'GIF',
  svg: 'SVG',
  zip: 'ZIP',
  txt: 'TXT',
  md: 'MD',
}

export function fileLabel(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LABEL[ext] ?? (ext ? ext.toUpperCase().slice(0, 4) : '파일')
}
