import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { DOC_KEY_FORBIDDEN, DOC_KEY_TAKEN, DOC_KEY_UNKNOWN, docKeyPutSchema, updateDocKey } from './doc-key-update'
import { ACTIVE_DOCUMENT_NOT_FOUND } from './trash'

const findFirst = vi.fn()
const update = vi.fn((args: unknown) => ({ op: 'update', args }))
const $transaction = vi.fn()
const scheduleMeasure = vi.fn()
const prisma = { document: { findFirst, update }, $transaction } as unknown as PrismaClient

const ADMIN = '375871831044915200'
const admin = { id: 'u_admin', discordId: ADMIN }
const owner = { id: 'u_owner', discordId: '1000000000000000009' }
const deps = () => ({ prisma, adminDiscordId: ADMIN, scheduleMeasure })

beforeEach(() => {
  findFirst.mockReset()
  update.mockClear()
  $transaction.mockReset().mockResolvedValue([])
  scheduleMeasure.mockReset()
})

describe('docKeyPutSchema', () => {
  it('모양이 맞는 키와 null(떼기)만 받는다', () => {
    expect(docKeyPutSchema.safeParse({ docKey: 'SCR-ACC' }).success).toBe(true)
    expect(docKeyPutSchema.safeParse({ docKey: null }).success).toBe(true)
    expect(docKeyPutSchema.safeParse({ docKey: 'scr-acc' }).success).toBe(false)
    expect(docKeyPutSchema.safeParse({}).success).toBe(false)
  })
})

describe('updateDocKey', () => {
  it('관리자가 아니면 올린 사람이어도 403 이고 DB 를 보지 않는다', async () => {
    const outcome = await updateDocKey('d1', { docKey: 'REQ' }, owner, deps())

    expect(outcome).toEqual({ ok: false, status: 403, error: DOC_KEY_FORBIDDEN })
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('ADMIN_DISCORD_ID 가 비어 있으면 아무도 못 한다', async () => {
    const outcome = await updateDocKey('d1', { docKey: 'REQ' }, admin, { ...deps(), adminDiscordId: '' })

    expect(outcome).toMatchObject({ ok: false, status: 403 })
  })

  it('휴지통·없는 문서는 404', async () => {
    findFirst.mockResolvedValueOnce(null)

    expect(await updateDocKey('d1', { docKey: 'REQ' }, admin, deps())).toEqual({
      ok: false,
      status: 404,
      error: ACTIVE_DOCUMENT_NOT_FOUND,
    })
  })

  it('빈 키를 달면 쓰고 측정을 예약한다', async () => {
    findFirst.mockResolvedValueOnce({ id: 'd1', docKey: null }).mockResolvedValueOnce(null)

    const outcome = await updateDocKey('d1', { docKey: 'SCR-ACC' }, admin, deps())

    expect(outcome).toEqual({ ok: true, docKey: 'SCR-ACC', movedFrom: null })
    expect(update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { docKey: 'SCR-ACC' } })
    expect(scheduleMeasure).toHaveBeenCalledTimes(1)
  })

  it('다른 문서가 쓰는 키는 move 없이는 409 로 멈추고 누가 쓰는지 알려 준다', async () => {
    findFirst.mockResolvedValueOnce({ id: 'd1', docKey: null }).mockResolvedValueOnce({ id: 'd0', title: '옛 문서' })

    const outcome = await updateDocKey('d1', { docKey: 'SCR-ACC' }, admin, deps())

    expect(outcome).toEqual({ ok: false, status: 409, error: DOC_KEY_TAKEN, holder: { id: 'd0', title: '옛 문서' } })
    expect($transaction).not.toHaveBeenCalled()
    expect(scheduleMeasure).not.toHaveBeenCalled()
  })

  it('move 면 옛 문서에서 떼고 새 문서에 단다 — 한 트랜잭션에서, 떼기가 먼저', async () => {
    findFirst.mockResolvedValueOnce({ id: 'd1', docKey: null }).mockResolvedValueOnce({ id: 'd0', title: '옛 문서' })

    const outcome = await updateDocKey('d1', { docKey: 'SCR-ACC', move: true }, admin, deps())

    expect(outcome).toEqual({ ok: true, docKey: 'SCR-ACC', movedFrom: 'd0' })
    const ops = $transaction.mock.calls[0][0]
    expect(ops.map((o: { args: unknown }) => o.args)).toEqual([
      { where: { id: 'd0' }, data: { docKey: null } },
      { where: { id: 'd1' }, data: { docKey: 'SCR-ACC' } },
    ])
  })

  it('떼기(null)도 측정을 예약한다', async () => {
    findFirst.mockResolvedValueOnce({ id: 'd1', docKey: 'REQ' })

    expect(await updateDocKey('d1', { docKey: null }, admin, deps())).toEqual({ ok: true, docKey: null, movedFrom: null })
    expect(scheduleMeasure).toHaveBeenCalledTimes(1)
  })

  it('이미 그 키면 아무것도 안 쓰고 측정도 안 한다', async () => {
    findFirst.mockResolvedValueOnce({ id: 'd1', docKey: 'REQ' })

    expect(await updateDocKey('d1', { docKey: 'REQ' }, admin, deps())).toEqual({ ok: true, docKey: 'REQ', movedFrom: null })
    expect($transaction).not.toHaveBeenCalled()
    expect(scheduleMeasure).not.toHaveBeenCalled()
  })

  it('조회와 쓰기 사이에 누가 같은 키를 달면(P2002) 409', async () => {
    findFirst.mockResolvedValueOnce({ id: 'd1', docKey: null }).mockResolvedValueOnce(null)
    $transaction.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))

    expect(await updateDocKey('d1', { docKey: 'REQ' }, admin, deps())).toEqual({ ok: false, status: 409, error: DOC_KEY_TAKEN })
  })

  it('등록되지 않은 키(외래키 P2003)면 400 이어야 한다', async () => {
    findFirst.mockResolvedValueOnce({ id: 'd1', docKey: null }).mockResolvedValueOnce(null)
    $transaction.mockRejectedValue(Object.assign(new Error('fk'), { code: 'P2003' }))

    expect(await updateDocKey('d1', { docKey: 'SCR-ZZZ' }, admin, deps())).toEqual({ ok: false, status: 400, error: DOC_KEY_UNKNOWN })
    expect(scheduleMeasure).not.toHaveBeenCalled()
  })
})
