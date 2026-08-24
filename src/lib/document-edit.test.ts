import { describe, expect, it } from 'vitest'
import { documentPatchSchema, toDocumentPatchData } from '@/lib/document-edit'

describe('documentPatchSchema', () => {
  it('빈 객체면 실패해야 한다', () => {
    // 수정할 것이 하나도 없는 요청은 400 으로 떨어져야 한다.
    expect(documentPatchSchema.safeParse({}).success).toBe(false)
  })

  it('제목 앞뒤 공백을 잘라내야 한다', () => {
    const parsed = documentPatchSchema.parse({ title: '  새 제목 ' })
    expect(parsed.title).toBe('새 제목')
  })

  it('제목이 200자를 넘거나 공백뿐이면 실패해야 한다', () => {
    expect(documentPatchSchema.safeParse({ title: 'a'.repeat(201) }).success).toBe(false)
    // trim 이 min(1) 앞에 있어야 공백뿐인 제목이 걸린다.
    expect(documentPatchSchema.safeParse({ title: '   ' }).success).toBe(false)
  })

  it('제목과 설명을 함께 보내면 둘 다 통과해야 한다', () => {
    const parsed = documentPatchSchema.parse({ title: 't', description: 'd' })
    expect(parsed).toEqual({ title: 't', description: 'd' })
  })
})

describe('toDocumentPatchData', () => {
  it('빈 문자열 설명은 null 로 바꿔야 한다', () => {
    // "설명 없음"은 null 하나로 통일한다 — '' 가 저장되면 표시 판정이 갈린다.
    expect(toDocumentPatchData({ description: '' })).toEqual({ description: null })
  })

  it('null 설명은 null 그대로 두어야 한다', () => {
    expect(toDocumentPatchData({ description: null })).toEqual({ description: null })
  })

  it('보내지 않은 필드는 data 에 키 자체가 없어야 한다', () => {
    // 제목만 고칠 때 설명이 함께 지워지면 안 된다.
    expect(Object.keys(toDocumentPatchData({ title: 't' }))).toEqual(['title'])
    expect(Object.keys(toDocumentPatchData({ description: 'd' }))).toEqual(['description'])
  })
})
