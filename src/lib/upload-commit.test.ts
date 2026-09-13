import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { addVersion, createDocument, discardUpload, type Uploader } from '@/lib/upload-commit'
import { MAX_UPLOAD_BYTES } from '@/lib/s3'
import { VERSION_FORBIDDEN } from '@/lib/ownership'
import { ACTIVE_DOCUMENT_NOT_FOUND } from '@/lib/trash'
import { S3_KEY_ALREADY_USED } from '@/lib/upload-guard'
import { VERSION_CONFLICT } from '@/lib/version-create'

// 라우트와 MCP 도구가 공유하는 커밋 계층. deps 를 가짜로 꽂아 "무엇을 어떤 순서·인자로
// 부르고 무엇을 돌려주는가"만 본다 — DB·S3·디스코드에는 붙지 않는다.
const documentVersionFindFirst = vi.fn()
const documentVersionCount = vi.fn()
const documentCreate = vi.fn()
const documentUpdate = vi.fn()
const documentFindUnique = vi.fn()
// 최신 판 조회가 document 쪽으로 새면 잡으려고 둔다. 구현은 부르지 않아야 한다.
const documentFindFirst = vi.fn()
const verifyUploadToken = vi.fn()
const headObjectSize = vi.fn()
const deleteObject = vi.fn()
const notifyUpload = vi.fn()

const prisma = {
  documentVersion: { findFirst: documentVersionFindFirst, count: documentVersionCount },
  document: {
    create: documentCreate,
    update: documentUpdate,
    findUnique: documentFindUnique,
    findFirst: documentFindFirst,
  },
} as unknown as PrismaClient

const ADMIN_DISCORD_ID = '375871831044915200'
const UPLOADER: Uploader = { id: 'user_1', discordId: '1000000000000000001', username: '홍길동' }

function deps(adminDiscordId: string | undefined = undefined) {
  return {
    prisma,
    verifyUploadToken,
    headObjectSize,
    deleteObject,
    notifyUpload,
    adminDiscordId,
  }
}

const CREATE_INPUT = {
  title: '보고서',
  s3Key: 'documents/abc.pdf',
  keyToken: 'token_1',
  fileName: '보고서.pdf',
  mimeType: 'application/pdf',
}

const VERSION_INPUT = {
  s3Key: 'documents/def.pdf',
  keyToken: 'token_2',
  fileName: '보고서_v2.pdf',
  mimeType: 'application/pdf',
}

// 기본값은 '사람이 고친 제목' — 제목 갱신이 끼어들지 않아 재업로드 본연의 동작만 본다.
const LATEST = { versionNo: 2, fileName: '이전.pdf', document: { title: '문서' } }

// findFirst 하나가 두 조회를 받는다: 재사용 확인(where.s3Key)과 최신 버전(where.documentId).
function mockVersionLookups(latest: unknown, reused: unknown = null) {
  documentVersionFindFirst.mockImplementation(async (args: { where: Record<string, unknown> }) =>
    's3Key' in args.where ? reused : latest,
  )
}

beforeEach(() => {
  documentVersionFindFirst.mockReset()
  mockVersionLookups(LATEST)
  documentVersionCount.mockReset().mockResolvedValue(0)
  documentCreate.mockReset().mockResolvedValue({ id: 'doc_1', title: '보고서' })
  documentUpdate.mockReset().mockResolvedValue({ id: 'doc_1', title: '문서' })
  documentFindUnique.mockReset().mockResolvedValue({ createdById: UPLOADER.id })
  documentFindFirst.mockReset()
  verifyUploadToken.mockReset().mockResolvedValue({ s3Key: 'ok' })
  headObjectSize.mockReset().mockResolvedValue(1234)
  deleteObject.mockReset().mockResolvedValue(undefined)
  notifyUpload.mockReset().mockResolvedValue(undefined)
})

describe('createDocument — 차단 순서', () => {
  beforeEach(() => {
    documentVersionFindFirst.mockReset().mockResolvedValue(null)
  })

  it('토큰 검증에 실패하면 400 이고 재사용 확인 조회에 가지 않아야 한다', async () => {
    verifyUploadToken.mockResolvedValue(null)

    const outcome = await createDocument(CREATE_INPUT, UPLOADER, deps())

    expect(outcome).toEqual({
      ok: false,
      status: 400,
      error: '업로드 정보가 만료되었거나 올바르지 않습니다.',
    })
    expect(verifyUploadToken).toHaveBeenCalledWith(CREATE_INPUT.keyToken, CREATE_INPUT.s3Key, UPLOADER.id)
    expect(documentVersionFindFirst).not.toHaveBeenCalled()
  })

  it('같은 s3Key 의 버전이 이미 있으면 400 이고 HeadObject 에 가지 않아야 한다', async () => {
    documentVersionFindFirst.mockResolvedValue({ id: 'ver_1' })

    const outcome = await createDocument(CREATE_INPUT, UPLOADER, deps())

    expect(outcome).toEqual({ ok: false, status: 400, error: S3_KEY_ALREADY_USED })
    expect(documentVersionFindFirst).toHaveBeenCalledWith({
      where: { s3Key: CREATE_INPUT.s3Key },
      select: { id: true },
    })
    expect(headObjectSize).not.toHaveBeenCalled()
  })

  it('S3 에 객체가 없으면 400 이고 문서를 만들지 않아야 한다', async () => {
    headObjectSize.mockResolvedValue(null)

    const outcome = await createDocument(CREATE_INPUT, UPLOADER, deps())

    expect(outcome).toEqual({ ok: false, status: 400, error: '업로드된 파일을 찾을 수 없습니다.' })
    expect(documentCreate).not.toHaveBeenCalled()
  })

  it('실제 크기가 MAX_UPLOAD_BYTES 를 넘으면 400 이고 문서를 만들지 않아야 한다', async () => {
    headObjectSize.mockResolvedValue(MAX_UPLOAD_BYTES + 1)

    const outcome = await createDocument(CREATE_INPUT, UPLOADER, deps())

    expect(outcome).toMatchObject({ ok: false, status: 400 })
    expect(outcome.ok === false && outcome.error).toContain('파일이 너무 큽니다')
    expect(documentCreate).not.toHaveBeenCalled()
  })

  it('실제 크기가 정확히 MAX_UPLOAD_BYTES 면 통과해야 한다', async () => {
    headObjectSize.mockResolvedValue(MAX_UPLOAD_BYTES)

    const outcome = await createDocument(CREATE_INPUT, UPLOADER, deps())

    expect(outcome.ok).toBe(true)
  })
})

describe('createDocument — 저장', () => {
  beforeEach(() => {
    documentVersionFindFirst.mockReset().mockResolvedValue(null)
  })

  it('정상이면 201 {id,title} 이고 v1 을 올린 사람 = 소유자로 만들어야 한다', async () => {
    const outcome = await createDocument(CREATE_INPUT, UPLOADER, deps())

    expect(outcome).toEqual({ ok: true, status: 201, value: { id: 'doc_1', title: '보고서' } })
    const { data } = documentCreate.mock.calls[0][0]
    expect(data.createdById).toBe(UPLOADER.id)
    expect(data.versions.create.versionNo).toBe(1)
    expect(data.versions.create.uploadedById).toBe(UPLOADER.id)
    // 크기는 클라이언트 신고값이 아니라 HeadObject 결과여야 한다.
    expect(data.versions.create.sizeBytes).toBe(1234)
  })

  it('파일 정보는 DocumentVersion 에만 쓰고 Document 에는 올리지 않아야 한다 (분리 불변식)', async () => {
    await createDocument(CREATE_INPUT, UPLOADER, deps())

    const { data } = documentCreate.mock.calls[0][0]
    for (const field of ['fileName', 's3Key', 'mimeType', 'sizeBytes']) {
      expect(data).not.toHaveProperty(field)
    }
    // 1문서 = 1파일 — 버전 생성은 배열이 아니라 단일 객체다.
    expect(Array.isArray(data.versions.create)).toBe(false)
    expect(data.versions.create).toMatchObject({
      s3Key: CREATE_INPUT.s3Key,
      fileName: CREATE_INPUT.fileName,
      mimeType: CREATE_INPUT.mimeType,
    })
  })

  it('create 가 s3_key 유일 제약(P2002)으로 던지면 400 이어야 한다', async () => {
    documentCreate.mockRejectedValue({ code: 'P2002', meta: { target: ['s3_key'] } })

    const outcome = await createDocument(CREATE_INPUT, UPLOADER, deps())

    expect(outcome).toEqual({ ok: false, status: 400, error: S3_KEY_ALREADY_USED })
    expect(notifyUpload).not.toHaveBeenCalled()
  })

  // 화면은 폴더 선택기에서 고르지만 MCP create_document 는 아무 문자열이나 받는다.
  // 500 으로 새면 호출자가 뒷정리(discard)할 실마리를 못 받고 S3 객체가 고아로 남는다.
  it('create 가 없는 folderId(P2003)로 던지면 400 이어야 한다', async () => {
    documentCreate.mockRejectedValue({ code: 'P2003', meta: { field_name: 'folder_id' } })

    const outcome = await createDocument(CREATE_INPUT, UPLOADER, deps())

    expect(outcome).toMatchObject({ ok: false, status: 400 })
    expect(notifyUpload).not.toHaveBeenCalled()
  })

  it('create 가 모르는 오류로 던지면 그대로 다시 던져야 한다', async () => {
    const boom = new Error('db down')
    documentCreate.mockRejectedValue(boom)

    await expect(createDocument(CREATE_INPUT, UPLOADER, deps())).rejects.toBe(boom)
  })

  it('알림을 v1·올린 사람 이름으로 보내야 한다', async () => {
    await createDocument(CREATE_INPUT, UPLOADER, deps())

    expect(notifyUpload).toHaveBeenCalledWith({
      documentId: 'doc_1',
      title: '보고서',
      versionNo: 1,
      fileName: CREATE_INPUT.fileName,
      uploaderName: UPLOADER.username,
    })
  })

  it('알림이 던져도 이미 저장된 문서는 ok 로 남아야 한다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    notifyUpload.mockRejectedValue(new Error('webhook down'))

    const outcome = await createDocument(CREATE_INPUT, UPLOADER, deps())

    expect(outcome).toEqual({ ok: true, status: 201, value: { id: 'doc_1', title: '보고서' } })
    consoleError.mockRestore()
  })
})

describe('addVersion — 소유자 검사가 맨 앞', () => {
  it('남의 문서면 403 VERSION_FORBIDDEN 이고 토큰 검증에도 가지 않아야 한다', async () => {
    documentFindUnique.mockResolvedValue({ createdById: 'user_2' })

    const outcome = await addVersion('doc_1', VERSION_INPUT, UPLOADER, deps())

    expect(outcome).toEqual({ ok: false, status: 403, error: VERSION_FORBIDDEN })
    expect(verifyUploadToken).not.toHaveBeenCalled()
    expect(headObjectSize).not.toHaveBeenCalled()
    expect(documentUpdate).not.toHaveBeenCalled()
  })

  it('소유자는 Document.createdById 로 판정해야 한다 (uploadedById 가 아니다)', async () => {
    await addVersion('doc_1', VERSION_INPUT, UPLOADER, deps())

    expect(documentFindUnique).toHaveBeenCalledWith({
      where: { id: 'doc_1' },
      select: { createdById: true },
    })
  })

  it('관리자 discordId 면 남의 문서에도 새 판을 올릴 수 있어야 한다', async () => {
    documentFindUnique.mockResolvedValue({ createdById: 'user_2' })
    const admin: Uploader = { ...UPLOADER, discordId: ADMIN_DISCORD_ID }

    const outcome = await addVersion('doc_1', VERSION_INPUT, admin, deps(ADMIN_DISCORD_ID))

    expect(outcome.ok).toBe(true)
    expect(documentUpdate).toHaveBeenCalled()
  })

  it('adminDiscordId 가 빈 문자열이면 관리자가 없어 남의 문서는 403 이어야 한다', async () => {
    documentFindUnique.mockResolvedValue({ createdById: 'user_2' })

    const outcome = await addVersion('doc_1', VERSION_INPUT, UPLOADER, deps(''))

    expect(outcome).toEqual({ ok: false, status: 403, error: VERSION_FORBIDDEN })
  })

  it('문서가 없으면 소유자 검사는 통과하고 최신 판 조회에서 404 여야 한다', async () => {
    documentFindUnique.mockResolvedValue(null)
    mockVersionLookups(null)

    const outcome = await addVersion('doc_gone', VERSION_INPUT, UPLOADER, deps())

    expect(outcome).toEqual({ ok: false, status: 404, error: ACTIVE_DOCUMENT_NOT_FOUND })
    expect(verifyUploadToken).toHaveBeenCalled()
    expect(documentUpdate).not.toHaveBeenCalled()
  })
})

describe('addVersion — 공통 차단 단계', () => {
  it('토큰 검증에 실패하면 400 이고 재사용 확인에 가지 않아야 한다', async () => {
    verifyUploadToken.mockResolvedValue(null)

    const outcome = await addVersion('doc_1', VERSION_INPUT, UPLOADER, deps())

    expect(outcome).toMatchObject({ ok: false, status: 400 })
    expect(verifyUploadToken).toHaveBeenCalledWith(VERSION_INPUT.keyToken, VERSION_INPUT.s3Key, UPLOADER.id)
    expect(documentVersionFindFirst).not.toHaveBeenCalled()
  })

  it('이미 쓰인 s3Key 면 400 이고 HeadObject 에 가지 않아야 한다', async () => {
    mockVersionLookups(LATEST, { id: 'ver_1' })

    const outcome = await addVersion('doc_1', VERSION_INPUT, UPLOADER, deps())

    expect(outcome).toEqual({ ok: false, status: 400, error: S3_KEY_ALREADY_USED })
    expect(headObjectSize).not.toHaveBeenCalled()
  })

  it('S3 에 객체가 없거나 너무 크면 400 이고 update 에 가지 않아야 한다', async () => {
    headObjectSize.mockResolvedValueOnce(null)
    const missing = await addVersion('doc_1', VERSION_INPUT, UPLOADER, deps())

    headObjectSize.mockResolvedValueOnce(MAX_UPLOAD_BYTES + 1)
    const tooLarge = await addVersion('doc_1', VERSION_INPUT, UPLOADER, deps())

    expect(missing).toMatchObject({ ok: false, status: 400 })
    expect(tooLarge).toMatchObject({ ok: false, status: 400 })
    expect(documentUpdate).not.toHaveBeenCalled()
  })
})

describe('addVersion — 최신 판과 제목', () => {
  it('최신 판은 versionNo desc 정렬로 구하고 제목 판정용 값을 같은 조회에 얹어야 한다', async () => {
    await addVersion('doc_1', VERSION_INPUT, UPLOADER, deps())

    const latestCall = documentVersionFindFirst.mock.calls.find(
      ([args]) => 'documentId' in args.where,
    )
    expect(latestCall).toBeDefined()
    const args = latestCall![0]
    expect(args.where).toEqual({ documentId: 'doc_1', document: { deletedAt: null } })
    expect(args.orderBy).toEqual({ versionNo: 'desc' })
    expect(args.select).toEqual({
      versionNo: true,
      fileName: true,
      document: { select: { title: true } },
    })
    // "최신" 컬럼이 스며들면 여기서 잡힌다.
    expect(JSON.stringify(args)).not.toMatch(/isLatest|latestVersion/)
  })

  it('제목 판정을 위해 쿼리를 더 내지 않아야 한다 (조회 총수 고정)', async () => {
    await addVersion('doc_1', VERSION_INPUT, UPLOADER, { ...deps() })

    // 소유자 1 · 재사용 1 · 최신 1 · update 1 = 4
    expect(documentFindUnique).toHaveBeenCalledTimes(1)
    expect(documentVersionFindFirst).toHaveBeenCalledTimes(2)
    expect(documentFindFirst).not.toHaveBeenCalled()
    expect(documentUpdate).toHaveBeenCalledTimes(1)
  })

  it('현재 제목이 이전 파일명 자동 생성값이면 새 파일명을 따라가야 한다', async () => {
    mockVersionLookups({ versionNo: 2, fileName: '보고서_v1.pdf', document: { title: '보고서_v1' } })

    await addVersion('doc_1', VERSION_INPUT, UPLOADER, deps())

    expect(documentUpdate.mock.calls[0][0].data.title).toBe('보고서_v2')
  })

  it('사람이 고친 제목이면 data 에 title 키가 아예 없어야 한다', async () => {
    await addVersion('doc_1', VERSION_INPUT, UPLOADER, deps())

    expect(documentUpdate.mock.calls[0][0].data).not.toHaveProperty('title')
  })

  it('versionNo 는 최신 + 1 이고 공백만 있는 변경 메모는 null 이어야 한다', async () => {
    // zod trim 을 거친 뒤의 값 — 공백만 쓴 메모는 빈 문자열로 들어온다.
    const outcome = await addVersion('doc_1', { ...VERSION_INPUT, changeNote: '' }, UPLOADER, deps())

    const { where, data } = documentUpdate.mock.calls[0][0]
    expect(where).toEqual({ id: 'doc_1', deletedAt: null })
    expect(data.versions.create.versionNo).toBe(3)
    expect(data.versions.create.changeNote).toBeNull()
    expect(data.versions.create.uploadedById).toBe(UPLOADER.id)
    expect(outcome).toEqual({ ok: true, status: 201, value: { id: 'doc_1', title: '문서', versionNo: 3 } })
  })

  it('파일 정보는 새 DocumentVersion 에만 쓰고 Document 로 올리지 않아야 한다 (분리 불변식)', async () => {
    await addVersion('doc_1', VERSION_INPUT, UPLOADER, deps())

    const { data } = documentUpdate.mock.calls[0][0]
    for (const field of ['fileName', 's3Key', 'mimeType', 'sizeBytes', 'createdById']) {
      expect(data).not.toHaveProperty(field)
    }
    expect(Array.isArray(data.versions.create)).toBe(false)
    expect(data.versions.create).toMatchObject({
      s3Key: VERSION_INPUT.s3Key,
      fileName: VERSION_INPUT.fileName,
      mimeType: VERSION_INPUT.mimeType,
      sizeBytes: 1234,
    })
  })

  it('알림이 던져도 ok 로 남아야 한다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    notifyUpload.mockRejectedValue(new Error('webhook down'))

    const outcome = await addVersion('doc_1', VERSION_INPUT, UPLOADER, deps())

    expect(outcome.ok).toBe(true)
    consoleError.mockRestore()
  })
})

describe('addVersion — update 오류 해석', () => {
  it.each([
    [{ code: 'P2002', meta: { target: ['s3_key'] } }, 400, S3_KEY_ALREADY_USED],
    [{ code: 'P2002', meta: { target: ['document_id', 'version_no'] } }, 409, VERSION_CONFLICT],
    [{ code: 'P2025' }, 404, ACTIVE_DOCUMENT_NOT_FOUND],
  ])('%o 로 던지면 %i 여야 한다', async (err, status, error) => {
    documentUpdate.mockRejectedValue(err)

    const outcome = await addVersion('doc_1', VERSION_INPUT, UPLOADER, deps())

    expect(outcome).toEqual({ ok: false, status, error })
    expect(notifyUpload).not.toHaveBeenCalled()
  })

  it('모르는 오류는 다시 던져야 한다', async () => {
    const boom = new Error('db down')
    documentUpdate.mockRejectedValue(boom)

    await expect(addVersion('doc_1', VERSION_INPUT, UPLOADER, deps())).rejects.toBe(boom)
  })
})

describe('discardUpload', () => {
  const INPUT = { s3Key: 'documents/abc.pdf', keyToken: 'token_1' }

  it('토큰 검증에 실패하면 400 이고 참조 수를 세지 않아야 한다', async () => {
    verifyUploadToken.mockResolvedValue(null)

    const outcome = await discardUpload(INPUT, UPLOADER, deps())

    expect(outcome).toMatchObject({ ok: false, status: 400 })
    expect(documentVersionCount).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('이미 문서가 된 키면 deleted:false 이고 deleteObject 를 부르지 않아야 한다', async () => {
    documentVersionCount.mockResolvedValue(1)

    const outcome = await discardUpload(INPUT, UPLOADER, deps())

    expect(outcome).toEqual({ ok: true, status: 200, value: { deleted: false } })
    expect(documentVersionCount).toHaveBeenCalledWith({ where: { s3Key: INPUT.s3Key } })
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('참조가 없으면 그 키를 지우고 deleted:true 여야 한다', async () => {
    const outcome = await discardUpload(INPUT, UPLOADER, deps())

    expect(outcome).toEqual({ ok: true, status: 200, value: { deleted: true } })
    expect(verifyUploadToken).toHaveBeenCalledWith(INPUT.keyToken, INPUT.s3Key, UPLOADER.id)
    expect(deleteObject).toHaveBeenCalledWith(INPUT.s3Key)
  })

  it('deleteObject 가 던지면 ok 이고 deleted:false 여야 한다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    deleteObject.mockRejectedValue(new Error('s3 down'))

    const outcome = await discardUpload(INPUT, UPLOADER, deps())

    expect(outcome).toEqual({ ok: true, status: 200, value: { deleted: false } })
    consoleError.mockRestore()
  })
})
