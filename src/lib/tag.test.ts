import { describe, expect, it } from 'vitest'
import { ACTIVE_DOCUMENT_NOT_FOUND } from '@/lib/trash'
import {
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_DOCUMENT,
  normalizeTags,
  TAG_CONFLICT,
  tagsPutSchema,
  tagUpdateFailure,
} from '@/lib/tag'

describe('normalizeTags', () => {
  it('앞뒤 공백을 자르고 빈 항목을 버려야 한다', () => {
    expect(normalizeTags([' 기획 ', '', '   ', '보고'])).toEqual(['기획', '보고'])
  })

  it('대소문자만 다른 중복은 먼저 온 표기를 남겨야 한다', () => {
    // 저장 표기를 소문자로 강제하지 않는다 — 사용자가 쓴 첫 표기가 남아야 한다.
    expect(normalizeTags(['API', 'api', 'Api'])).toEqual(['API'])
    expect(normalizeTags(['api', 'API'])).toEqual(['api'])
  })

  it('입력 순서를 보존해야 한다', () => {
    expect(normalizeTags(['나', '가', '다'])).toEqual(['나', '가', '다'])
  })
})

describe('tagsPutSchema', () => {
  it('정규화된 값을 돌려줘야 한다 (trim·중복 제거가 스키마 안에서 일어난다)', () => {
    const parsed = tagsPutSchema.parse({ tags: [' a ', 'A', '', 'b'] })
    expect(parsed).toEqual({ tags: ['a', 'b'] })
  })

  it('서로 다른 태그 11개는 거부해야 한다', () => {
    const eleven = Array.from({ length: MAX_TAGS_PER_DOCUMENT + 1 }, (_, i) => `태그${i}`)
    expect(tagsPutSchema.safeParse({ tags: eleven }).success).toBe(false)
  })

  it('중복·공백 때문에 11개가 된 입력은 정규화 후 10개 이하면 통과해야 한다', () => {
    // 사용자 눈에는 10개도 안 되는데 거절당하면 안 된다 — 개수 검사보다 정규화가 먼저다.
    const raw = [...Array.from({ length: 10 }, (_, i) => `태그${i}`), ' 태그0 ']
    const parsed = tagsPutSchema.safeParse({ tags: raw })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.tags).toHaveLength(10)
  })

  it('31자 항목은 거부하고 30자는 통과해야 한다', () => {
    expect(tagsPutSchema.safeParse({ tags: ['a'.repeat(MAX_TAG_LENGTH + 1)] }).success).toBe(false)
    expect(tagsPutSchema.safeParse({ tags: ['a'.repeat(MAX_TAG_LENGTH)] }).success).toBe(true)
  })

  it('배열이 아니거나 tags 키가 없으면 거부해야 한다', () => {
    expect(tagsPutSchema.safeParse({ tags: '기획' }).success).toBe(false)
    expect(tagsPutSchema.safeParse({}).success).toBe(false)
    expect(tagsPutSchema.safeParse(null).success).toBe(false)
  })

  it('빈 배열(태그 전부 제거)은 통과해야 한다', () => {
    expect(tagsPutSchema.parse({ tags: [] })).toEqual({ tags: [] })
  })
})

describe('tagUpdateFailure', () => {
  const withCode = (code: string) => Object.assign(new Error('prisma'), { code })

  it('P2025 는 404 활성 문서 없음이어야 한다', () => {
    expect(tagUpdateFailure(withCode('P2025'))).toEqual({
      status: 404,
      error: ACTIVE_DOCUMENT_NOT_FOUND,
    })
  })

  it('P2002 는 409 동시 수정 경합이어야 한다', () => {
    expect(tagUpdateFailure(withCode('P2002'))).toEqual({ status: 409, error: TAG_CONFLICT })
  })

  it('그 외에는 null 이어야 한다', () => {
    expect(tagUpdateFailure(new Error('네트워크'))).toBeNull()
    expect(tagUpdateFailure(withCode('P2003'))).toBeNull()
    expect(tagUpdateFailure(null)).toBeNull()
  })
})
