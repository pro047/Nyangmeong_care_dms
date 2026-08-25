import { describe, expect, it } from 'vitest'
import {
  documentPatchFailure,
  documentPatchSchema,
  MOVE_FOLDER_NOT_FOUND,
  toDocumentPatchData,
} from '@/lib/document-edit'

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

  it('folderId 만 있는 본문도 통과해야 한다 (폴더 이동 단독 요청)', () => {
    expect(documentPatchSchema.parse({ folderId: 'f1' })).toEqual({ folderId: 'f1' })
    // null = 폴더에서 꺼내 미분류로. 셋 중 하나만 있어도 refine 을 통과해야 한다.
    expect(documentPatchSchema.parse({ folderId: null })).toEqual({ folderId: null })
  })

  it('빈 문자열 folderId 는 거부해야 한다 (미분류는 null 하나로 통일)', () => {
    expect(documentPatchSchema.safeParse({ folderId: '' }).success).toBe(false)
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
    // 제목만 고칠 때 문서가 폴더에서 빠져나가면 안 된다.
    expect(toDocumentPatchData({ title: 't' })).not.toHaveProperty('folderId')
  })

  it('folderId 는 문자열이든 null 이든 그대로 통과해야 한다', () => {
    expect(toDocumentPatchData({ folderId: 'f1' })).toEqual({ folderId: 'f1' })
    expect(toDocumentPatchData({ folderId: null })).toEqual({ folderId: null })
  })
})

describe('documentPatchFailure', () => {
  const withCode = (code: string) => Object.assign(new Error('prisma'), { code })

  it('P2003(없는 폴더로 이동)은 404 여야 한다', () => {
    expect(documentPatchFailure(withCode('P2003'))).toEqual({
      status: 404,
      error: MOVE_FOLDER_NOT_FOUND,
    })
  })

  it('그 외에는 null 을 돌려 호출자가 rethrow 하게 해야 한다', () => {
    expect(documentPatchFailure(new Error('네트워크'))).toBeNull()
    expect(documentPatchFailure(withCode('P2025'))).toBeNull()
    expect(documentPatchFailure(null)).toBeNull()
  })
})
