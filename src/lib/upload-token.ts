import { SignJWT, jwtVerify } from 'jose'
import { env } from './env'

/**
 * presign 이 발급한 S3 키를 앱이 다시 신뢰할 수 있게 서명해 두는 토큰.
 *
 * 이게 없으면 `POST /api/documents` 는 클라이언트가 보낸 s3Key 를 그대로 믿는다.
 * 로그인만 하면 임의의 키 — 남의 문서 s3Key 를 포함해 — 로 Document 를 만들 수 있다.
 * 토큰은 "우리가, 이 사용자에게, 방금 발급한 키"임을 증명한다.
 *
 * 세션과 같은 AUTH_SECRET 을 쓰되 용도(aud)를 분리한다. 섞이면 세션 쿠키를
 * 업로드 토큰 자리에 넣는 것이 통과한다.
 */
const key = new TextEncoder().encode(env.AUTH_SECRET)
const AUDIENCE = 'dms:upload-key'

/** presign URL 과 같은 5분. 더 길게 둘 이유가 없다. */
const TTL_SECONDS = 300

export async function signUploadToken(s3Key: string, userId: string) {
  return new SignJWT({ s3Key })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(AUDIENCE)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(key)
}

/**
 * 토큰이 유효하고, 담긴 키가 body 의 s3Key 와 같고, 그 사용자에게 발급된 것인지.
 * 셋 중 하나라도 어긋나면 null — 호출자는 이유를 구분하지 않고 400 으로 떨어뜨린다.
 * (어느 조건에서 틀렸는지 알려주면 키를 탐색하는 데 쓸 수 있다)
 */
export async function verifyUploadToken(token: string, s3Key: string, userId: string) {
  try {
    const { payload } = await jwtVerify(token, key, { audience: AUDIENCE, subject: userId })
    return payload.s3Key === s3Key ? { s3Key } : null
  } catch {
    return null
  }
}
