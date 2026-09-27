/**
 * docKey API 왕복 검증 (정합성 이관).
 *
 * 전제: `npm run dev`(3002) + 실제 .env (dev 브랜치, `ADMIN_DISCORD_ID` 계정이 users 에 있어야 한다).
 * 실행:  npm run test:e2e:doc-key
 *
 * **화면은 없다** (2026-09-27 사람 결정 — 문서 상세에서 정합성 키 항목을 걷었다. 키 달기는 스크립트로만).
 * API 두 개(`PUT …/doc-key` · `GET …/doc-key/suggest`)는 남겼으므로 여기서 권한·외래키·옮기기·측정 예약을 본다.
 * dev 에 문서가 없는 키(SCR-LAN)를 빌려 쓰고, 끝나면 테스트 문서와 이 스위트가 만든 스냅샷을 지운다.
 */
import { APP, mintSession, purgeDocument, seedDocument, withDb } from './helpers.mjs'

const KEY = 'SCR-LAN'
const EXPECTED_CHECKS = 9
const results = []
const check = (id, desc, pass, detail = '') => {
  results.push({ id, desc, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${desc}${detail ? ` — ${detail}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const keyOf = (id) => withDb(async (c) => (await c.query('select doc_key from documents where id = $1', [id])).rows[0]?.doc_key ?? null)

console.log(`■ 대상 APP : ${APP}`)
console.log(`■ 대상 DB  : ${(process.env.DATABASE_URL ?? '').split('@')[1]?.split('/')[0] ?? '?'}\n`)

// 본문이 SCR-LAN-001 을 정의하는 화면설계서 — 제안 API 가 이것을 집어야 한다
const LANDING = '<section class="frame"><div class="frame-bar">SCR-LAN-001 랜딩</div><p>REQ-MAN-007 SCR-ACC-001</p></section>'

const since = new Date(Date.now() - 1000)
const made = []

try {
  if (!process.env.ADMIN_DISCORD_ID) throw new Error('ADMIN_DISCORD_ID 가 비어 있다')
  const taken = await withDb(async (c) => (await c.query('select id from documents where doc_key = $1', [KEY])).rows)
  if (taken.length) throw new Error(`${KEY} 를 이미 쓰는 문서가 있다: ${taken[0].id}`)

  const admin = await mintSession({ discordId: process.env.ADMIN_DISCORD_ID })
  const member = await mintSession()
  if (member.user.discord_id === process.env.ADMIN_DISCORD_ID) throw new Error('팀원 계정이 관리자다 — 다른 계정이 필요하다')
  const as = (token) => ({ 'Content-Type': 'application/json', Cookie: `dms_session=${token}` })
  const put = (token, id, body) => fetch(`${APP}/api/documents/${id}/doc-key`, { method: 'PUT', headers: as(token), body: JSON.stringify(body) })

  const stamp = Date.now()
  const docA = await seedDocument(admin.token, { title: `키검증_A_${stamp}`, fileName: `키검증_A_v0.1_${stamp}.html`, body: LANDING })
  made.push(docA)
  const docB = await seedDocument(admin.token, { title: `키검증_B_${stamp}`, fileName: `키검증_B_v0.1_${stamp}.html`, body: LANDING })
  made.push(docB)

  // 화면에는 아무것도 없다 — 관리자에게도
  const page = await fetch(`${APP}/documents/${docA}`, { headers: { Cookie: `dms_session=${admin.token}` } })
  const html = await page.text()
  check('K1', '문서 상세에 정합성 키 항목이 없다 (관리자 화면에도)', page.status === 200 && !html.includes('정합성 키'), `status ${page.status}`)

  // 팀원은 두 API 다 403
  const mPut = await put(member.token, docA, { docKey: KEY })
  const mSug = await fetch(`${APP}/api/documents/${docA}/doc-key/suggest`, { headers: as(member.token) })
  check('K2', '팀원은 저장·제안 API 가 403', mPut.status === 403 && mSug.status === 403 && (await keyOf(docA)) === null,
    `PUT ${mPut.status} · 제안 ${mSug.status}`)

  // 제안
  const sug = await fetch(`${APP}/api/documents/${docA}/doc-key/suggest`, { headers: as(admin.token) })
  const sugBody = await sug.json().catch(() => null)
  check('K3', '제안 API 가 본문의 정의 ID 로 키를 제안한다', sug.status === 200 && sugBody?.suggested === KEY,
    `status ${sug.status} ${JSON.stringify(sugBody)}`)

  // 달기
  const set = await put(admin.token, docA, { docKey: KEY })
  check('K4', '관리자가 키를 단다', set.status === 200 && (await keyOf(docA)) === KEY, `status ${set.status}`)

  // 등록 안 된 키 (외래키)
  const unknown = await put(admin.token, docB, { docKey: 'SCR-ZZZ' })
  check('K5', '등록되지 않은 키는 400', unknown.status === 400 && (await keyOf(docB)) === null, `status ${unknown.status}`)

  // 충돌 → move
  const conflict = await put(admin.token, docB, { docKey: KEY })
  const conflictBody = await conflict.json().catch(() => null)
  check('K6', '다른 문서가 쓰는 키는 move 없이 409 + 누가 쓰는지', conflict.status === 409 && conflictBody?.holder?.id === docA,
    `status ${conflict.status} holder ${conflictBody?.holder?.id}`)
  const moved = await put(admin.token, docB, { docKey: KEY, move: true })
  const after = [await keyOf(docA), await keyOf(docB)]
  check('K7', 'move 면 옛 문서에서 떼고 이 문서에 단다', moved.status === 200 && after[0] === null && after[1] === KEY,
    `A ${after[0]} · B ${after[1]}`)

  // 떼기
  const cleared = await put(admin.token, docB, { docKey: null })
  check('K8', '떼기', cleared.status === 200 && (await keyOf(docB)) === null, `status ${cleared.status}`)

  // 키를 바꿀 때마다 측정이 돈다 (달기 · 옮기기 · 떼기)
  // 5초 조용한 시간 + 측정 — 세 번 연달아 바꿨으므로 합쳐져 한 번일 수 있다
  await sleep(15_000)
  const snaps = await withDb(async (c) =>
    (await c.query('select count(*)::int n from consistency_snapshots where created_at >= $1::timestamp', [since.toISOString()])).rows[0].n)
  check('K9', 'docKey 를 바꾸면 측정이 예약된다', snaps >= 1, `새 스냅샷 ${snaps}건`)
} catch (err) {
  console.error('중단:', err)
} finally {
  const removed = await withDb(async (c) =>
    (await c.query('delete from consistency_snapshots where created_at >= $1::timestamp', [since.toISOString()])).rowCount)
  for (const id of made) await purgeDocument(id)
  console.log(`정리: 스냅샷 ${removed}건 · 문서 ${made.length}건`)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${EXPECTED_CHECKS} 통과`)
process.exit(results.length === EXPECTED_CHECKS && failed.length === 0 ? 0 : 1)
