import { describe, expect, it } from 'vitest'
import { safeReturnTo } from '@/lib/oauth/return-to'

describe('safeReturnTo', () => {
  it('/oauth/authorize?a=1 은 그대로 돌려줘야 한다', () => {
    expect(safeReturnTo('/oauth/authorize?a=1')).toBe('/oauth/authorize?a=1')
  })

  it.each([
    ['undefined', undefined],
    ['빈 문자열', ''],
    ['루트', '/'],
    ['다른 경로', '/documents/x'],
    ['프로토콜 상대 경로', '//evil'],
    ['외부 URL', 'http://x'],
    ['물음표 없는 authorize 경로', '/oauth/authorize'],
    ['개행 포함', '/oauth/authorize?\n'],
    ['null', null],
    ['CR 포함(헤더 분할)', '/oauth/authorize?a=1\r\nSet-Cookie: x=1'],
    ['접두어만 비슷한 경로', '/oauth/authorizeX?a=1'],
    ['절대 URL 속 authorize', 'https://evil.example/oauth/authorize?a=1'],
  ])('%s 는 / 로 떨어져야 한다', (_label, raw) => {
    expect(safeReturnTo(raw)).toBe('/')
  })
})
