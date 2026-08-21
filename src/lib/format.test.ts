import { afterEach, describe, expect, it, vi } from 'vitest'
import { fileLabel, formatBytes, formatRelative } from '@/lib/format'

describe('formatBytes', () => {
  it('1KB 미만은 바이트 그대로 보여준다', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('10 미만은 소수 한 자리, 10 이상은 정수로 반올림한다', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(100 * 1024 * 1024)).toBe('100 MB')
  })

  it('GB 에서 단위 상승을 멈춘다', () => {
    expect(formatBytes(5 * 1024 ** 4)).toBe('5120 GB')
  })
})

describe('formatRelative', () => {
  afterEach(() => vi.useRealTimers())

  const at = (iso: string, minutesAgo: number) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(iso))
    return formatRelative(new Date(Date.now() - minutesAgo * 60_000))
  }

  it('구간별로 단위가 바뀐다', () => {
    expect(at('2026-08-20T12:00:00Z', 0)).toBe('방금')
    expect(at('2026-08-20T12:00:00Z', 5)).toBe('5분 전')
    expect(at('2026-08-20T12:00:00Z', 3 * 60)).toBe('3시간 전')
    expect(at('2026-08-20T12:00:00Z', 2 * 24 * 60)).toBe('2일 전')
  })

  it('7일이 넘으면 날짜로 떨어진다', () => {
    expect(at('2026-08-20T12:00:00Z', 30 * 24 * 60)).toMatch(/2026년/)
  })
})

describe('fileLabel', () => {
  it('아는 확장자는 표 라벨을 쓴다', () => {
    expect(fileLabel('보고서.pdf')).toBe('PDF')
    expect(fileLabel('사진.jpeg')).toBe('JPG')
  })

  it('모르는 확장자는 대문자 4글자까지 자른다', () => {
    expect(fileLabel('영상.webm')).toBe('WEBM')
    expect(fileLabel('사진.heic')).toBe('HEIC')
  })
})
