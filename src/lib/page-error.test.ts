import { describe, it, expect } from 'vitest'
import { pageErrorMessage, DOCUMENT_NOT_FOUND } from './page-error'

describe('pageErrorMessage', () => {
  it('아는 코드면 그 문구를 돌려줘야 한다', () => {
    expect(pageErrorMessage(DOCUMENT_NOT_FOUND)).toBe('문서를 찾을 수 없습니다.')
  })

  it('모르는 코드면 null 이어야 한다', () => {
    expect(pageErrorMessage('nope')).toBeNull()
    expect(pageErrorMessage('')).toBeNull()
  })

  it('문구를 그대로 실어 보내도 배너가 뜨지 않아야 한다', () => {
    expect(pageErrorMessage('보안 점검으로 재인증이 필요합니다')).toBeNull()
    expect(pageErrorMessage('문서를 찾을 수 없습니다.')).toBeNull()
  })

  it('파라미터가 없거나 배열이면 null 이어야 한다', () => {
    expect(pageErrorMessage(undefined)).toBeNull()
    expect(pageErrorMessage([DOCUMENT_NOT_FOUND, 'x'])).toBeNull()
  })

  it('프로토타입 속성 이름을 코드로 넣어도 null 이어야 한다', () => {
    expect(pageErrorMessage('toString')).toBeNull()
    expect(pageErrorMessage('constructor')).toBeNull()
  })
})
