import { describe, expect, it } from 'vitest'
import { SignJWT } from 'jose'
import { signUploadToken, verifyUploadToken } from '@/lib/upload-token'

const KEY = 'documents/11111111-2222-3333-4444-555555555555.xlsx'
const OTHER_KEY = 'documents/99999999-8888-7777-6666-555555555555.xlsx'
const USER = 'user_1'
const OTHER_USER = 'user_2'

describe('signUploadToken / verifyUploadToken', () => {
  it('발급한 사용자와 키가 그대로면 통과해야 한다', async () => {
    // Arrange
    const token = await signUploadToken(KEY, USER)

    // Act
    const result = await verifyUploadToken(token, KEY, USER)

    // Assert
    expect(result).toEqual({ s3Key: KEY })
  })

  it('다른 키로 바꿔치기하면 거부해야 한다', async () => {
    // 이 검사가 없으면 로그인만 한 사람이 남의 s3Key 로 문서를 만들 수 있다.
    const token = await signUploadToken(KEY, USER)

    expect(await verifyUploadToken(token, OTHER_KEY, USER)).toBeNull()
  })

  it('다른 사용자가 남의 토큰을 쓰면 거부해야 한다', async () => {
    const token = await signUploadToken(KEY, USER)

    expect(await verifyUploadToken(token, KEY, OTHER_USER)).toBeNull()
  })

  it('토큰이 망가져 있으면 거부해야 한다', async () => {
    const token = await signUploadToken(KEY, USER)

    expect(await verifyUploadToken(token + 'x', KEY, USER)).toBeNull()
    expect(await verifyUploadToken('아무말', KEY, USER)).toBeNull()
    expect(await verifyUploadToken('', KEY, USER)).toBeNull()
  })

  it('만료된 토큰은 거부해야 한다', async () => {
    // Arrange: 같은 비밀키·같은 aud 로 서명하되 만료만 과거로 둔다.
    const key = new TextEncoder().encode(process.env.AUTH_SECRET)
    const expired = await new SignJWT({ s3Key: KEY })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('dms:upload-key')
      .setSubject(USER)
      .setIssuedAt(0)
      .setExpirationTime(1)
      .sign(key)

    expect(await verifyUploadToken(expired, KEY, USER)).toBeNull()
  })

  it('세션 쿠키를 업로드 토큰 자리에 넣으면 거부해야 한다', async () => {
    // Arrange: 세션 토큰은 같은 AUTH_SECRET 으로 서명되지만 aud 가 없다.
    // 용도를 분리하지 않았으면 이게 통과한다.
    const key = new TextEncoder().encode(process.env.AUTH_SECRET)
    const sessionLike = await new SignJWT({ id: USER, s3Key: KEY })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(key)

    expect(await verifyUploadToken(sessionLike, KEY, USER)).toBeNull()
  })
})
