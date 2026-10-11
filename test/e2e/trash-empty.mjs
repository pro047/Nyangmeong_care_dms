// 휴지통 비우기 실측. mock 테스트는 "무엇을 부르는가"까지만 본다 — 여기서는 실제 DB 행과
// S3 객체가 사라지는가·남는가를 본다. dev 서버(3002) + 실 자격증명이 필요하다.
//
// **관리자 계정으로 돌리지 않는다.** 관리자의 범위는 전원의 휴지통이라 dev 에 쌓여 있는
// 옛 문서까지 지워지고, 버킷이 운영과 하나라(SETUP.md) 그 객체를 운영 DB 가 아직 가리킬 수 있다.
// 휴지통이 빈 비관리자 두 명을 골라, 이 스크립트가 만든 문서만 범위에 들어오게 한다.
import { SignJWT } from 'jose'
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'
import { APP, mintSession, seedDocument, purgeDocument, withDb } from './helpers.mjs'

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

/** ListBucket 권한이 없어 없는 객체는 404 가 아니라 403 이 온다 (orphan-cleanup.mjs 와 같은 전제). */
async function objectExists(Key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key }))
    return true
  } catch (err) {
    const code = err.$metadata?.httpStatusCode
    if (code === 403 || code === 404) return false
    throw err
  }
}

const results = []
const ok = (id, desc, pass, detail = '') => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${desc}${detail ? ' — ' + detail : ''}`)
}

const keysOf = (id) =>
  withDb(async (c) => {
    const { rows } = await c.query('select s3_key from document_versions where document_id = $1', [id])
    return rows.map((r) => r.s3_key)
  })
const rowExists = (id) =>
  withDb(async (c) => (await c.query('select 1 from documents where id = $1', [id])).rowCount > 0)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 휴지통이 빈 비관리자 두 명. 못 찾으면 돌리지 않는다 — 남의 실제 휴지통 문서를 지우게 된다.
const candidates = await withDb(async (c) => {
  const { rows } = await c.query(
    `select u.discord_id from users u
      where u.discord_id <> $1
        and not exists (select 1 from documents d where d.created_by = u.id and d.deleted_at is not null)
      order by u.username limit 2`,
    [process.env.ADMIN_DISCORD_ID ?? ''],
  )
  return rows.map((r) => r.discord_id)
})
if (candidates.length < 2) throw new Error('휴지통이 빈 비관리자 계정이 2명 필요하다')

const owner = await mintSession({ discordId: candidates[0] })
const other = await mintSession({ discordId: candidates[1] })
const headers = (token) => ({ Cookie: `dms_session=${token}` })
const trash = (token, id) => fetch(`${APP}/api/documents/${id}`, { method: 'DELETE', headers: headers(token) })
const empty = (token, query) =>
  fetch(`${APP}/api/documents/trash${query}`, { method: 'DELETE', headers: headers(token) })

const seeded = []
const seed = async (token, n) => {
  const id = await seedDocument(token, {
    title: `[실측] 휴지통 비우기 ${n}`,
    fileName: `trash-empty-${n}.txt`,
    body: `trash-empty ${n}\n`,
  })
  seeded.push(id)
  return id
}

try {
  const a1 = await seed(owner.token, 'A1')
  const a2 = await seed(owner.token, 'A2')
  const b1 = await seed(other.token, 'B1')
  const keys = { a1: await keysOf(a1), a2: await keysOf(a2), b1: await keysOf(b1) }
  for (const [token, id] of [[owner.token, a1], [owner.token, a2], [other.token, b1]]) {
    const res = await trash(token, id)
    if (!res.ok) throw new Error(`소프트 삭제 실패 ${res.status}`)
  }

  // 화면을 그린 시각. 이 뒤에 휴지통에 들어온 A3 는 사람이 본 적 없는 문서다.
  await sleep(1100)
  const before = new Date().toISOString()
  await sleep(1100)
  const a3 = await seed(owner.token, 'A3')
  keys.a3 = await keysOf(a3)
  // 이게 실패하면 A3 가 활성으로 남아 E8 이 before 와 무관하게 통과한다.
  if (!(await trash(owner.token, a3)).ok) throw new Error('A3 소프트 삭제 실패')

  // 차단
  ok('E1', 'before 가 없으면 400', (await empty(owner.token, '')).status === 400)
  ok('E2', 'before 가 날짜가 아니면 400', (await empty(owner.token, '?before=abc')).status === 400)
  // 업로드 토큰과 같은 모양: 서명은 맞지만 id 가 없다.
  const idless = await new SignJWT({ s3Key: 'documents/x.txt' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('300s')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET))
  const forged = await empty(idless, `?before=${encodeURIComponent(new Date().toISOString())}`)
  ok('E3', 'id 없는 세션은 401', forged.status === 401, `status ${forged.status}`)
  ok('E4', '차단된 요청은 아무것도 지우지 않았다',
    (await rowExists(a1)) && (await rowExists(a2)) && (await rowExists(a3)) && (await rowExists(b1)))

  // 비우기
  const started = Date.now()
  const res = await empty(owner.token, `?before=${encodeURIComponent(before)}`)
  const elapsed = Date.now() - started
  const body = await res.json()
  ok('E5', '라우트가 [id] 가 아니라 trash 로 잡혀 200 { count: 2 }',
    res.status === 200 && body.count === 2, `status ${res.status} body ${JSON.stringify(body)} · ${elapsed}ms`)
  ok('E6', 'before 까지 들어온 내 문서 2건의 행이 사라졌다', !(await rowExists(a1)) && !(await rowExists(a2)))
  ok('E7', '그 문서들의 S3 객체가 사라졌다',
    !(await objectExists(keys.a1[0])) && !(await objectExists(keys.a2[0])))
  ok('E8', 'before 뒤에 들어온 내 문서는 행도 객체도 남았다',
    (await rowExists(a3)) && (await objectExists(keys.a3[0])))
  ok('E9', '남이 올린 휴지통 문서는 행도 객체도 남았다',
    (await rowExists(b1)) && (await objectExists(keys.b1[0])))

  const again = await empty(owner.token, `?before=${encodeURIComponent(before)}`)
  ok('E10', '같은 요청을 다시 보내면 200 { count: 0 }',
    again.status === 200 && (await again.json()).count === 0)

  // 단건 영구삭제 회귀 (공용 함수로 옮긴 경로)
  const purge = (token, id) =>
    fetch(`${APP}/api/documents/${id}/purge`, { method: 'DELETE', headers: headers(token) })
  ok('E11', '남의 문서 단건 영구삭제는 403', (await purge(owner.token, b1)).status === 403)
  ok('E12', '내 문서 단건 영구삭제는 200 이고 행·객체가 사라진다',
    (await purge(owner.token, a3)).status === 200 && !(await rowExists(a3)) && !(await objectExists(keys.a3[0])))
  ok('E13', '없는 문서 단건 영구삭제는 404', (await purge(owner.token, a3)).status === 404)
} finally {
  // 실패해도 dev DB 와 버킷에 테스트 문서를 남기지 않는다.
  for (const id of seeded) await purgeDocument(id)
}

const failed = results.filter((pass) => !pass).length
console.log(`\n${results.length - failed}/${results.length} 통과`)
process.exit(failed ? 1 : 0)
