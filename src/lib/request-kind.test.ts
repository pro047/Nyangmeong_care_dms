import { describe, expect, it } from 'vitest'
import { isNavigationRequest } from '@/lib/request-kind'

describe('isNavigationRequest', () => {
  it('sec-fetch-dest 가 document 면 true 여야 한다', () => {
    const headers = new Headers({ 'sec-fetch-dest': 'document' })

    expect(isNavigationRequest(headers)).toBe(true)
  })

  it('sec-fetch-dest 가 empty 면 accept 가 text/html 이어도 false 여야 한다', () => {
    // 헤더가 붙어 있으면 그것이 정답이다. accept 는 fetch 가 자유롭게 정할 수 있다.
    const headers = new Headers({ 'sec-fetch-dest': 'empty', accept: 'text/html' })

    expect(isNavigationRequest(headers)).toBe(false)
  })

  it('sec-fetch-dest 가 없고 accept 에 text/html 이 있으면 true 여야 한다', () => {
    const headers = new Headers({ accept: 'text/html,application/xhtml+xml' })

    expect(isNavigationRequest(headers)).toBe(true)
  })

  it('sec-fetch-dest 도 accept 도 없으면 false 여야 한다', () => {
    const headers = new Headers()

    expect(isNavigationRequest(headers)).toBe(false)
  })

  it('sec-fetch-dest 가 없고 accept 가 application/json 이면 false 여야 한다', () => {
    const headers = new Headers({ accept: 'application/json' })

    expect(isNavigationRequest(headers)).toBe(false)
  })
})
