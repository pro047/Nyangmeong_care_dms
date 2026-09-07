import { describe, expect, it } from 'vitest'
import { canManageDocument, isAdmin, trashOwnerWhere, type Viewer } from '@/lib/ownership'

const ADMIN = '375871831044915200'

const owner: Viewer = { id: 'u_owner', discordId: '395620578222145538' }
const other: Viewer = { id: 'u_other', discordId: '1524268222222696540' }
const admin: Viewer = { id: 'u_admin', discordId: ADMIN }

const doc = { createdById: 'u_owner' }

describe('canManageDocument', () => {
  it('올린 사람은 지우고 새 버전을 올릴 수 있어야 한다', () => {
    expect(canManageDocument(owner, doc, ADMIN)).toBe(true)
  })

  it('남은 지우지도 새 버전을 올리지도 못해야 한다', () => {
    expect(canManageDocument(other, doc, ADMIN)).toBe(false)
  })

  it('관리자는 남의 문서도 다룰 수 있어야 한다', () => {
    expect(canManageDocument(admin, doc, ADMIN)).toBe(true)
  })

  // 소유자 판정은 users.id 로 한다. discordId 가 같아도 다른 사람의 문서면 안 된다.
  it('discordId 가 관리자와 같아도 id 가 다르면 소유자가 아니어야 한다', () => {
    expect(canManageDocument({ id: 'u_x', discordId: ADMIN }, doc, undefined)).toBe(false)
  })
})

describe('isAdmin', () => {
  // 설정을 빠뜨렸을 때 아무도 특권을 못 갖는 쪽으로 실패해야 한다.
  it('관리자 id 가 없으면 아무도 관리자가 아니어야 한다', () => {
    expect(isAdmin(admin, undefined)).toBe(false)
    expect(isAdmin(admin, '')).toBe(false)
  })

  // 빈 문자열 discordId 가 빈 설정과 맞아떨어져 전원이 관리자가 되는 사고를 막는다.
  it('discordId 가 비어 있어도 관리자가 되면 안 된다', () => {
    expect(isAdmin({ id: 'u_x', discordId: '' }, '')).toBe(false)
  })
})

describe('trashOwnerWhere', () => {
  it('일반 사용자는 자기 문서로 좁혀야 한다', () => {
    expect(trashOwnerWhere(owner, ADMIN)).toEqual({ createdById: 'u_owner' })
  })

  it('관리자는 조건을 걸지 않아야 한다', () => {
    expect(trashOwnerWhere(admin, ADMIN)).toEqual({})
  })

  it('관리자 id 가 없으면 관리자 계정도 자기 문서만 봐야 한다', () => {
    expect(trashOwnerWhere(admin, undefined)).toEqual({ createdById: 'u_admin' })
  })
})
