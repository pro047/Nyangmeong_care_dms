import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { DOC_KEY_FORBIDDEN } from './doc-key-update'
import { SUGGEST_UNREADABLE, suggestForDocument } from './doc-key-suggest'

const versionFindFirst = vi.fn()
const keyFindMany = vi.fn()
const getObjectBytes = vi.fn()
const prisma = { documentVersion: { findFirst: versionFindFirst }, docKey: { findMany: keyFindMany } } as unknown as PrismaClient
const ADMIN = '375871831044915200'
const admin = { id: 'u_admin', discordId: ADMIN }
const deps = () => ({ prisma, getObjectBytes, adminDiscordId: ADMIN })

const HTML = `<section><div class="frame-bar">SCR-LAN-001 랜딩</div><p>REQ-MAN-007 SCR-ACC-001</p></section>`

beforeEach(() => {
  versionFindFirst.mockReset().mockResolvedValue({ s3Key: 's3/lan', fileName: '랜딩페이지_화면설계서_v0.1.html' })
  keyFindMany.mockReset().mockResolvedValue([{ key: 'SCR-LAN' }, { key: 'SCR-ACC' }])
  getObjectBytes.mockReset().mockResolvedValue(new TextEncoder().encode(HTML))
})

describe('suggestForDocument', () => {
  it('관리자가 아니면 403 이고 S3 를 읽지 않아야 한다', async () => {
    const outcome = await suggestForDocument('d1', { id: 'u', discordId: '1000000000000000009' }, deps())

    expect(outcome).toEqual({ ok: false, status: 403, error: DOC_KEY_FORBIDDEN })
    expect(getObjectBytes).not.toHaveBeenCalled()
  })

  it('최신판에 정의된 ID 로 제안하고 참조한 ID 는 세지 않아야 한다', async () => {
    const outcome = await suggestForDocument('d1', admin, deps())

    expect(outcome).toEqual({ ok: true, suggested: 'SCR-LAN', counts: [{ key: 'SCR-LAN', count: 1, registered: true }] })
    expect(versionFindFirst.mock.calls[0][0].orderBy).toEqual({ versionNo: 'desc' })
  })

  it('가장 많은 키가 등록되지 않았으면 제안하지 않고 개수만 보여야 한다', async () => {
    keyFindMany.mockResolvedValue([{ key: 'SCR-ACC' }])

    const outcome = await suggestForDocument('d1', admin, deps())

    expect(outcome).toEqual({ ok: true, suggested: null, counts: [{ key: 'SCR-LAN', count: 1, registered: false }] })
  })

  it('휴지통·없는 문서면 404, 파일을 못 읽으면 422 여야 한다', async () => {
    versionFindFirst.mockResolvedValueOnce(null)
    expect(await suggestForDocument('d1', admin, deps())).toMatchObject({ ok: false, status: 404 })

    getObjectBytes.mockResolvedValueOnce(null)
    expect(await suggestForDocument('d1', admin, deps())).toEqual({ ok: false, status: 422, error: SUGGEST_UNREADABLE })
  })
})
