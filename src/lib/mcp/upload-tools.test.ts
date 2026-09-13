import { describe, expect, it } from 'vitest'
import type { AuthInfo } from '@modelcontextprotocol/server'
import {
  addVersionInputSchema,
  createDocumentInputSchema,
  discardUploadInputSchema,
  requestUploadInputSchema,
  SIMILAR_CANDIDATES_EXIST,
  similarRejection,
  toRequestUploadResult,
  toSimilarMatches,
  toolTitle,
  toSuggestedFolder,
  uploadFailure,
  viewerFromAuthInfo,
  type SimilarMatch,
} from '@/lib/mcp/upload-tools'
import { verifyMcpBearer } from '@/lib/mcp/auth'
import { clientIdHash, signAccessToken } from '@/lib/oauth/tokens'
import { MAX_UPLOAD_BYTES } from '@/lib/s3'
import { classifyFileName, type ClassifyFolder } from '@/lib/classify'
import { documentCreateSchema, discardUploadSchema } from '@/lib/upload-commit'
import { versionCreateSchema } from '@/lib/version-create'
import type { SimilarCandidate } from '@/lib/similar-document'

const USER = { id: 'user_1', discordId: '1000000000000000001', username: '홍길동', avatarUrl: null }

function authInfo(extra: Record<string, unknown> | undefined): AuthInfo {
  return { token: 't', clientId: 'c', scopes: ['dms'], extra }
}

describe('viewerFromAuthInfo', () => {
  it.each([
    ['authInfo 없음', undefined],
    ['extra 없음', authInfo(undefined)],
    ['userId 없음', authInfo({ discordId: USER.discordId, username: USER.username })],
    ['discordId 없음', authInfo({ userId: USER.id, username: USER.username })],
    ['username 없음', authInfo({ userId: USER.id, discordId: USER.discordId })],
    ['userId 가 문자열이 아님', authInfo({ userId: 1, discordId: USER.discordId, username: USER.username })],
  ])('%s 이면 null 이어야 한다', (_label, info) => {
    expect(viewerFromAuthInfo(info)).toBeNull()
  })

  it('verifyMcpBearer 가 실제로 만드는 AuthInfo 를 넣으면 올린 사람이 나와야 한다', async () => {
    const token = await signAccessToken({ user: USER, clientIdHash: clientIdHash('client-jwt') })
    const info = await verifyMcpBearer(new Request('http://localhost:3002/api/mcp'), token)

    expect(viewerFromAuthInfo(info)).toEqual({
      id: USER.id,
      discordId: USER.discordId,
      username: USER.username,
    })
  })
})

describe('toSuggestedFolder', () => {
  const FOLDERS: ClassifyFolder[] = [
    { id: 'f-req', name: '요구사항정의서', parentId: null, aliases: [] },
    { id: 'f-screen', name: '화면설계서', parentId: null, aliases: [] },
  ]

  it('match 면 그 폴더의 id 와 이름을 돌려줘야 한다', () => {
    expect(toSuggestedFolder({ kind: 'match', folderId: 'f-req', reason: '일치' }, FOLDERS)).toEqual({
      folderId: 'f-req',
      name: '요구사항정의서',
      reason: '일치',
    })
  })

  it('실제 분류기 결과를 넣어도 같은 폴더를 가리켜야 한다 (화면 미리보기와 같은 규칙)', () => {
    const result = classifyFileName('01_요구사항 정의서_v0.3_2026_08_17.xlsx', FOLDERS)

    expect(toSuggestedFolder(result, FOLDERS)).toMatchObject({ folderId: 'f-req', name: '요구사항정의서' })
  })

  it('propose 면 folderId 는 null 이고 제안 이름과 화면에서 만들라는 안내를 담아야 한다', () => {
    const suggested = toSuggestedFolder(
      { kind: 'propose', parentId: null, proposedName: 'IA 구조도', reason: '새 카테고리' },
      FOLDERS,
    )

    expect(suggested.folderId).toBeNull()
    expect(suggested.name).toBeNull()
    expect(suggested.reason).toContain('새 카테고리')
    expect(suggested.reason).toContain("'IA 구조도'")
    expect(suggested.reason).toContain('화면에서')
  })

  it('unclassified 면 folderId 는 null 이고 사유를 그대로 실어야 한다', () => {
    expect(toSuggestedFolder({ kind: 'unclassified', reason: '일치 없음' }, FOLDERS)).toEqual({
      folderId: null,
      name: null,
      reason: '일치 없음',
    })
  })
})

describe('toSimilarMatches', () => {
  function candidate(id: string, latestFileName: string): SimilarCandidate {
    return { id, folderId: 'f-screen', createdById: USER.id, latestFileName }
  }

  it('낮은 판을 올리면 danger 경고를 붙여야 한다', () => {
    const [match] = toSimilarMatches('설계서_v0.3.html', [candidate('doc_1', '설계서_v0.6.html')])

    expect(match.documentId).toBe('doc_1')
    expect(match.latestFileName).toBe('설계서_v0.6.html')
    expect(match.warning?.level).toBe('danger')
  })

  it('판번호를 읽을 수 없으면 notice 경고를 붙여야 한다', () => {
    const [match] = toSimilarMatches('와이어프레임.html', [candidate('doc_1', '설계서_v0.6.html')])

    expect(match.warning?.level).toBe('notice')
  })

  it('더 높은 판을 올리면 warning 은 null 이어야 한다', () => {
    const [match] = toSimilarMatches('설계서_v0.6.html', [candidate('doc_1', '설계서_v0.3.html')])

    expect(match.warning).toBeNull()
  })

  it('후보 순서를 그대로 유지해야 한다', () => {
    const matches = toSimilarMatches('설계서_v0.9.html', [
      candidate('doc_a', '설계서_v0.6.html'),
      candidate('doc_b', '설계서_v0.3.html'),
    ])

    expect(matches.map((m) => m.documentId)).toEqual(['doc_a', 'doc_b'])
  })
})

describe('similarRejection', () => {
  const MATCHES: SimilarMatch[] = [{ documentId: 'doc_1', latestFileName: '설계서_v0.6.html', warning: null }]

  it('후보가 있고 ignoreSimilar 가 false 면 거절 페이로드에 후보를 담아야 한다', () => {
    expect(similarRejection(MATCHES, false)).toEqual({ error: SIMILAR_CANDIDATES_EXIST, candidates: MATCHES })
  })

  it('후보가 있어도 ignoreSimilar 가 true 면 null 이어야 한다', () => {
    expect(similarRejection(MATCHES, true)).toBeNull()
  })

  it('후보가 없으면 null 이어야 한다', () => {
    expect(similarRejection([], false)).toBeNull()
  })
})

describe('requestUploadInputSchema', () => {
  const BASE = { fileName: '보고서.pdf', contentType: 'application/pdf' }

  it('size 가 MAX_UPLOAD_BYTES 를 넘으면 거부해야 한다', () => {
    expect(requestUploadInputSchema.safeParse({ ...BASE, size: MAX_UPLOAD_BYTES + 1 }).success).toBe(false)
  })

  it('size 가 정확히 MAX_UPLOAD_BYTES 면 받아야 한다', () => {
    expect(requestUploadInputSchema.safeParse({ ...BASE, size: MAX_UPLOAD_BYTES }).success).toBe(true)
  })

  it.each([0, -1, 1.5])('size 가 %s 면 거부해야 한다', (size) => {
    expect(requestUploadInputSchema.safeParse({ ...BASE, size }).success).toBe(false)
  })

  it('파일 내용을 받는 필드가 없어야 한다 — 파일은 presigned PUT 으로만 간다', () => {
    expect(Object.keys(requestUploadInputSchema.shape).sort()).toEqual(['contentType', 'fileName', 'size'])
  })
})

describe('createDocumentInputSchema', () => {
  const FILE = {
    s3Key: 'documents/abc.pdf',
    keyToken: 'token_1',
    fileName: '보고서.pdf',
    mimeType: 'application/pdf',
  }

  it('ignoreSimilar 를 안 주면 false 여야 한다', () => {
    expect(createDocumentInputSchema.parse(FILE).ignoreSimilar).toBe(false)
  })

  // request_upload 의 suggestedFolder.folderId 는 분류 실패 시 null 이고, 에이전트는
  // 그 값을 그대로 넘긴다. 거부하면 이미 PUT 된 객체가 고아가 된다.
  it('folderId 가 null 이어도 받아야 한다', () => {
    expect(createDocumentInputSchema.safeParse({ ...FILE, folderId: null }).success).toBe(true)
  })

  it('title 은 선택이지만 빈 문자열은 거부해야 한다', () => {
    expect(createDocumentInputSchema.safeParse(FILE).success).toBe(true)
    expect(createDocumentInputSchema.safeParse({ ...FILE, title: '' }).success).toBe(false)
  })

  it.each([
    ['정상', { ...FILE, title: '보고서' }],
    ['fileName 255자 초과', { ...FILE, title: '보고서', fileName: 'a'.repeat(256) }],
    ['title 상한 초과', { ...FILE, title: 'a'.repeat(201) }],
    ['description 상한 초과', { ...FILE, title: '보고서', description: 'a'.repeat(2001) }],
    ['s3Key 빈 문자열', { ...FILE, title: '보고서', s3Key: '' }],
    ['mimeType 빈 문자열', { ...FILE, title: '보고서', mimeType: '' }],
  ])('%s — 화면 경로 documentCreateSchema 와 판정이 같아야 한다', (_label, input) => {
    expect(createDocumentInputSchema.safeParse(input).success).toBe(documentCreateSchema.safeParse(input).success)
  })
})

describe('addVersionInputSchema', () => {
  const FILE = {
    s3Key: 'documents/abc.pdf',
    keyToken: 'token_1',
    fileName: '보고서.pdf',
    mimeType: 'application/pdf',
  }

  it('documentId 가 없거나 비면 거부해야 한다', () => {
    expect(addVersionInputSchema.safeParse(FILE).success).toBe(false)
    expect(addVersionInputSchema.safeParse({ ...FILE, documentId: '' }).success).toBe(false)
  })

  it.each([
    ['정상', FILE],
    ['changeNote 500자 초과', { ...FILE, changeNote: 'a'.repeat(501) }],
    ['keyToken 빈 문자열', { ...FILE, keyToken: '' }],
    ['fileName 255자 초과', { ...FILE, fileName: 'a'.repeat(256) }],
  ])('%s — 화면 경로 versionCreateSchema 와 판정이 같아야 한다', (_label, input) => {
    expect(addVersionInputSchema.safeParse({ ...input, documentId: 'doc_1' }).success).toBe(
      versionCreateSchema.safeParse(input).success,
    )
  })

  it('changeNote 를 화면 경로와 같이 trim 해야 한다', () => {
    const parsed = addVersionInputSchema.parse({ ...FILE, documentId: 'doc_1', changeNote: '   ' })

    expect(parsed.changeNote).toBe('')
    expect(parsed.changeNote).toBe(versionCreateSchema.parse({ ...FILE, changeNote: '   ' }).changeNote)
  })
})

describe('discardUploadInputSchema', () => {
  it.each([
    [{ s3Key: 'documents/abc.pdf', keyToken: 'token_1' }],
    [{ s3Key: '', keyToken: 'token_1' }],
    [{ s3Key: 'documents/abc.pdf' }],
  ])('%o — 화면 경로 discardUploadSchema 와 판정이 같아야 한다', (input) => {
    expect(discardUploadInputSchema.safeParse(input).success).toBe(discardUploadSchema.safeParse(input).success)
  })
})

describe('toRequestUploadResult', () => {
  const RESULT = toRequestUploadResult({
    s3Key: 'documents/abc.pdf',
    url: 'https://s3.example/signed',
    keyToken: 'token_1',
    contentType: 'application/vnd.ms-excel',
    suggestedFolder: { folderId: null, name: null, reason: '일치 없음' },
  })

  it('method 는 PUT 이고 만료는 presign 과 같은 300초여야 한다', () => {
    expect(RESULT.method).toBe('PUT')
    expect(RESULT.expiresInSeconds).toBe(300)
  })

  it('instructions 에 서명된 Content-Type 값을 그대로 담아야 한다', () => {
    expect(RESULT.instructions).toContain('application/vnd.ms-excel')
    expect(RESULT.contentType).toBe('application/vnd.ms-excel')
  })

  it('방금 발급한 s3Key·url·keyToken·suggestedFolder 를 그대로 실어야 한다', () => {
    expect(RESULT).toMatchObject({
      s3Key: 'documents/abc.pdf',
      url: 'https://s3.example/signed',
      keyToken: 'token_1',
      suggestedFolder: { folderId: null, name: null, reason: '일치 없음' },
    })
  })
})

describe('toolTitle', () => {
  it('title 을 주면 그대로 써야 한다', () => {
    expect(toolTitle('보고서.pdf', '손으로 지은 제목')).toBe('손으로 지은 제목')
  })

  it('title 이 없으면 파일명에서 만들되 상한(200자)에서 잘라야 한다', () => {
    const longName = `${'가'.repeat(250)}.pdf`

    const title = toolTitle(longName, undefined)

    // 화면은 zod max 로 거부한다. 도구가 그 값을 저장하면 경로마다 규칙이 갈린다.
    expect(title.length).toBe(200)
  })
})

describe('uploadFailure', () => {
  it('s3Key 와 discard_upload 안내를 실어야 한다', () => {
    const payload = uploadFailure('업로드된 파일을 찾을 수 없습니다.', 'documents/abc.pdf')

    expect(payload).toMatchObject({ error: '업로드된 파일을 찾을 수 없습니다.', s3Key: 'documents/abc.pdf' })
    expect(payload.hint).toContain('discard_upload')
  })

  it('extra 를 얹어도 s3Key·hint 가 남아야 한다', () => {
    const payload = uploadFailure(SIMILAR_CANDIDATES_EXIST, 'documents/abc.pdf', { candidates: [] })

    expect(payload).toMatchObject({ s3Key: 'documents/abc.pdf', candidates: [] })
    expect(payload.hint).toContain('discard_upload')
  })
})
