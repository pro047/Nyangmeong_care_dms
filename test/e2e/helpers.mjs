// E2E 공용 도우미. 디스코드 OAuth 를 자동화하지 않고 세션 쿠키를 직접 발급한다 —
// session.ts 와 같은 방식(HS256 over AUTH_SECRET)이라 proxy.ts 와 getSession() 을 둘 다 통과한다.
import { SignJWT } from 'jose'
import pg from 'pg'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'

export const APP = process.env.APP_URL ?? 'http://localhost:3002'

export async function withDb(fn) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

/** 실제 users 행으로 서명한다 — 재업로드의 uploadedById 가 FK 라 가짜 id 로는 깨진다. */
export async function mintSession() {
  const { rows } = await withDb((c) =>
    c.query('select id, discord_id, username, avatar_url from users limit 1'),
  )
  if (!rows.length) throw new Error('users 테이블이 비어 있다 — 먼저 브라우저로 한 번 로그인할 것')
  const u = rows[0]
  const token = await new SignJWT({
    id: u.id, discordId: u.discord_id, username: u.username, avatarUrl: u.avatar_url,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${60 * 60 * 24 * 30}s`)
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET))
  return { token, user: u }
}

export const cookieFor = (token) => ({
  name: 'dms_session', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax',
})

/** presign → S3 PUT → POST /api/documents. 앱이 쓰는 경로 그대로 태운다. */
export async function seedDocument(token, { title, fileName, body }) {
  const H = { 'Content-Type': 'application/json', Cookie: `dms_session=${token}` }
  const pre = await fetch(`${APP}/api/documents/presign`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ fileName, contentType: 'text/plain', size: body.length }),
  })
  if (!pre.ok) throw new Error(`presign ${pre.status} ${await pre.text()}`)
  const { key, url, keyToken } = await pre.json()

  const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body })
  if (!put.ok) throw new Error(`S3 PUT ${put.status}`)

  const res = await fetch(`${APP}/api/documents`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ title, s3Key: key, keyToken, fileName, mimeType: 'text/plain' }),
  })
  if (!res.ok) throw new Error(`create ${res.status} ${await res.text()}`)
  return (await res.json()).id
}

/**
 * 테스트가 만든 것을 지운다. 소프트 삭제는 S3 객체를 남기므로(HANDOFF "S3 고아 객체" 지뢰)
 * 여기서는 행과 객체를 둘 다 없앤다 — 테스트가 팀 DB 에 쓰레기를 쌓으면 안 된다.
 */
export async function purgeDocument(documentId, extraKeys = []) {
  const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  })
  const keys = await withDb(async (c) => {
    const { rows } = await c.query(
      'select s3_key from document_versions where document_id = $1', [documentId],
    )
    await c.query('delete from document_versions where document_id = $1', [documentId])
    await c.query('delete from documents where id = $1', [documentId])
    return rows.map((r) => r.s3_key)
  })
  // extraKeys 는 DB 행이 안 생긴 객체(업로드는 됐는데 문서 생성이 막힌 경우)다.
  const all = [...new Set([...keys, ...extraKeys])]
  for (const Key of all) {
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key }))
  }
  return all
}
