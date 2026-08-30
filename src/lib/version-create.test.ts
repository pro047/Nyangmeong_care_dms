import { describe, expect, it } from 'vitest'
import {
  VERSION_CONFLICT,
  nextVersionNo,
  toChangeNote,
  versionCreateFailure,
  versionCreateSchema,
} from '@/lib/version-create'
import { ACTIVE_DOCUMENT_NOT_FOUND } from '@/lib/trash'
import { S3_KEY_ALREADY_USED } from '@/lib/upload-guard'

const VALID = {
  s3Key: 'documents/abc.pdf',
  keyToken: 'token_1',
  fileName: '보고서.pdf',
  mimeType: 'application/pdf',
}

describe('nextVersionNo', () => {
  it('최신이 없으면 1, 있으면 +1 이어야 한다', () => {
    expect(nextVersionNo(null)).toBe(1)
    expect(nextVersionNo(3)).toBe(4)
  })
})

describe('toChangeNote', () => {
  it('안 썼든 빈 문자열이든 "메모 없음"은 null 하나여야 한다', () => {
    expect(toChangeNote(undefined)).toBeNull()
    expect(toChangeNote('')).toBeNull()
  })

  it('스키마 trim 을 거친 메모는 그대로 남아야 한다', () => {
    const parsed = versionCreateSchema.parse({ ...VALID, changeNote: ' 메모 ' })
    expect(parsed.changeNote).toBe('메모')
    expect(toChangeNote(parsed.changeNote)).toBe('메모')
  })
})

describe('versionCreateSchema', () => {
  it('메모 501자·파일명 256자·s3Key 누락은 실패해야 한다', () => {
    expect(versionCreateSchema.safeParse({ ...VALID, changeNote: 'a'.repeat(501) }).success).toBe(
      false,
    )
    expect(versionCreateSchema.safeParse({ ...VALID, fileName: 'a'.repeat(256) }).success).toBe(
      false,
    )
    const withoutKey = { ...VALID, s3Key: undefined }
    expect(versionCreateSchema.safeParse(withoutKey).success).toBe(false)
  })
})

describe('versionCreateFailure', () => {
  it('P2002(동시 재업로드)는 409 로 해석해야 한다', () => {
    expect(versionCreateFailure({ code: 'P2002' })).toEqual({
      status: 409,
      error: VERSION_CONFLICT,
    })
  })

  // 유일 제약이 둘이라 P2002 의 뜻이 갈린다. target 을 안 보면 재사용 사고가
  // "버전 번호 충돌"로 보고돼 원인을 못 찾는다.
  it('P2002 가 s3_key 제약이면 400 으로 해석해야 한다', () => {
    expect(versionCreateFailure({ code: 'P2002', meta: { target: ['s3_key'] } })).toEqual({
      status: 400,
      error: S3_KEY_ALREADY_USED,
    })
  })

  it('target 이 문자열로 와도 s3_key 를 알아봐야 한다', () => {
    expect(
      versionCreateFailure({ code: 'P2002', meta: { target: 'document_versions_s3_key_key' } }),
    ).toEqual({ status: 400, error: S3_KEY_ALREADY_USED })
  })

  it('target 을 알 수 없으면 기존 해석(409)으로 떨어져야 한다', () => {
    expect(versionCreateFailure({ code: 'P2002', meta: {} })).toEqual({
      status: 409,
      error: VERSION_CONFLICT,
    })
  })

  it('P2025(사이에 삭제됨)는 404 로 해석해야 한다', () => {
    expect(versionCreateFailure({ code: 'P2025' })).toEqual({
      status: 404,
      error: ACTIVE_DOCUMENT_NOT_FOUND,
    })
  })

  it('모르는 오류는 null 을 돌려 호출자가 rethrow 하게 해야 한다', () => {
    expect(versionCreateFailure(new Error('x'))).toBeNull()
    expect(versionCreateFailure(null)).toBeNull()
  })
})
