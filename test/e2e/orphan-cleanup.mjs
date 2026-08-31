// S3 고아 객체 정리 + keyToken 재사용 차단 실측.
//
// mock 테스트는 "라우트가 무엇을 부르는가"까지만 본다. 여기서 보는 것은 실제 S3 에
// 객체가 남는가·사라지는가다 — 그건 HeadObject 로만 판정된다.
//
// DESIGN.md §4 의 A~G 에 대응한다. dev 서버(3002) + 실 자격증명이 필요하다.
// dev DB 는 운영과 갈린 Neon 브랜치이므로(2026-08-30 실측) 팀 화면에 닿지 않는다.
import { chromium } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'
import { APP, mintSession, cookieFor, purgeDocument, withDb } from './helpers.mjs'

const SHOT = '.pipeline/shots'
mkdirSync(SHOT, { recursive: true })

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

/**
 * S3 에 객체가 있는가.
 *
 * **`dms-app` IAM 에 `s3:ListBucket` 이 없어서 없는 객체는 404 가 아니라 403 이 온다**
 * (HANDOFF 지뢰와 같은 자리 — 2026-08-30 이 스크립트로 재실측). 그래서 403 을 "없음"으로
 * 읽어야 하는데, 그것을 가정으로 두면 권한 사고를 "삭제 성공"으로 오독한다.
 * 아래 assertProbeSemantics() 가 실행 시작에 대조 프로브로 그 전제를 확인한다.
 */
async function headStatus(Key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key }))
    return 200
  } catch (err) {
    const code = err.$metadata?.httpStatusCode
    if (code) return code
    throw err
  }
}

async function objectExists(Key) {
  const code = await headStatus(Key)
  if (code === 200) return true
  if (code === 404 || code === 403) return false
  throw new Error(`HeadObject 예상 밖 상태코드 ${code} (key=${Key})`)
}

/** "없음"이 정말 없음인지 대조. 이게 깨지면 아래 모든 삭제 판정이 무의미하다. */
async function assertProbeSemantics() {
  const missing = await headStatus(`documents/${'0'.repeat(8)}-probe-does-not-exist.txt`)
  console.log(`[프로브] 없는 키의 HeadObject 상태코드 = ${missing} (403 = ListBucket 없음, 404 = 정상)`)
  if (missing !== 403 && missing !== 404) {
    throw new Error(`없는 키가 ${missing} 을 준다 — 삭제 판정을 신뢰할 수 없다`)
  }
  return missing
}

/**
 * 그 키로 만들어진 버전 행이 있는가. 취소 케이스의 판정에 반드시 필요하다 —
 * "객체가 남았다"만 보면 **고아**와 **정상 완료된 문서**를 구분하지 못한다.
 * 업로드가 abort 전에 끝나 버리면 그 회차는 실패가 아니라 무효(측정 못 함)다.
 */
async function versionRowFor(key) {
  return withDb(async (c) => {
    const { rows } = await c.query(
      'select document_id from document_versions where s3_key = $1', [key])
    return rows[0]?.document_id ?? null
  })
}

const results = []
/** pass === null 은 무효(측정 못 함)다. 통과로도 실패로도 세지 않는다. */
const ok = (id, desc, pass, detail = '') => {
  results.push({ id, desc, pass, detail })
  const tag = pass === null ? 'SKIP' : pass ? 'PASS' : 'FAIL'
  console.log(`${tag}  ${id}  ${desc}${detail ? ' — ' + detail : ''}`)
}

const MISSING_CODE = await assertProbeSemantics()
const { token } = await mintSession()
const H = { 'Content-Type': 'application/json', Cookie: `dms_session=${token}` }
const cleanupDocs = []
const cleanupKeys = []

// ─────────────────────────────────────────── fetch 로 보는 것 (브라우저 불필요)

// X7 참조된 키는 지우지 않는다 — 이 기능의 데이터 유실 방어선이다.
{
  const pre = await fetch(`${APP}/api/documents/presign`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ fileName: 'orphan-x7.txt', contentType: 'text/plain', size: 5 }),
  }).then((r) => r.json())
  await fetch(pre.url, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'x7\n' })
  const created = await fetch(`${APP}/api/documents`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      title: '[실측] 고아정리 X7', s3Key: pre.key, keyToken: pre.keyToken,
      fileName: 'orphan-x7.txt', mimeType: 'text/plain',
    }),
  })
  const doc = await created.json()
  cleanupDocs.push(doc.id)

  const res = await fetch(`${APP}/api/uploads/discard`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ s3Key: pre.key, keyToken: pre.keyToken }),
  })
  const body = await res.json()
  const alive = await objectExists(pre.key)
  ok('X7', '문서가 된 키는 discard 해도 안 지운다 (파일 유실 방어선)',
     res.status === 200 && body.deleted === false && alive,
     `status=${res.status} deleted=${body.deleted} S3존재=${alive}`)

  // X4 같은 (s3Key, keyToken) 재사용 → 400
  const reuse = await fetch(`${APP}/api/documents`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      title: '[실측] 재사용 시도', s3Key: pre.key, keyToken: pre.keyToken,
      fileName: 'orphan-x7.txt', mimeType: 'text/plain',
    }),
  })
  const reuseBody = await reuse.json().catch(() => ({}))
  ok('X4', 'documents: 같은 keyToken 재사용이 400 으로 막힌다',
     reuse.status === 400 && /이미 사용된 업로드/.test(reuseBody.error ?? ''),
     `status=${reuse.status} error="${reuseBody.error ?? ''}"`)

  // X5 versions 라우트도 같은 구멍이 막혔는가 (두 곳을 같이 막는 것이 요건이었다)
  const reuseVer = await fetch(`${APP}/api/documents/${doc.id}/versions`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      s3Key: pre.key, keyToken: pre.keyToken,
      fileName: 'orphan-x7.txt', mimeType: 'text/plain',
    }),
  })
  const reuseVerBody = await reuseVer.json().catch(() => ({}))
  ok('X5', 'versions: 같은 keyToken 재사용이 400 으로 막힌다',
     reuseVer.status === 400 && /이미 사용된 업로드/.test(reuseVerBody.error ?? ''),
     `status=${reuseVer.status} error="${reuseVerBody.error ?? ''}"`)
}

// X6 없는 키로 discard — 멱등성 (JUDGE #14 미확인 항목)
{
  const pre = await fetch(`${APP}/api/documents/presign`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ fileName: 'orphan-x6.txt', contentType: 'text/plain', size: 5 }),
  }).then((r) => r.json())
  // PUT 을 하지 않는다 — 객체가 없는 키다.
  const res = await fetch(`${APP}/api/uploads/discard`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ s3Key: pre.key, keyToken: pre.keyToken }),
  })
  const body = await res.json()
  ok('X6', '없는 키로 discard 해도 200 (DeleteObject 멱등 — JUDGE #14)',
     res.status === 200 && body.deleted === true,
     `status=${res.status} deleted=${body.deleted}`)
}

// X9 동시 재사용 — @@unique([s3Key]) 가 최종 방어선으로 실제 작동하는가.
//
// 라우트의 사전 조회는 check-then-act 라 두 발이 동시에 들어오면 **둘 다 통과한다**
// (코드리뷰 [medium]). 그때 DB 제약이 한쪽을 P2002 로 떨어뜨리고, 라우트가 그것을
// "이미 사용된 업로드"로 번역해야 한다 — 500 으로 새면 사용자가 원인을 못 본다.
{
  const pre = await fetch(`${APP}/api/documents/presign`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ fileName: 'orphan-x9.txt', contentType: 'text/plain', size: 5 }),
  }).then((r) => r.json())
  await fetch(pre.url, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'x9\n' })

  const shoot = () =>
    fetch(`${APP}/api/documents`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        title: '[실측] 동시 재사용 X9', s3Key: pre.key, keyToken: pre.keyToken,
        fileName: 'orphan-x9.txt', mimeType: 'text/plain',
      }),
    })
  const [a, b] = await Promise.all([shoot(), shoot()])
  const codes = [a.status, b.status].sort()
  for (const r of [a, b]) {
    if (r.status === 201 || r.status === 200) cleanupDocs.push((await r.clone().json()).id)
  }
  const bodies = await Promise.all([a.clone().json().catch(() => ({})), b.clone().json().catch(() => ({}))])
  const rows = await withDb(async (c) => {
    const { rows } = await c.query(
      'select count(*)::int n from document_versions where s3_key = $1', [pre.key])
    return rows[0].n
  })
  ok('X9', '동시 재사용: 한쪽만 성공하고 나머지는 400, 버전 행은 1개',
     codes[1] === 400 && rows === 1 && bodies.some((x) => /이미 사용된 업로드/.test(x.error ?? '')),
     `상태=${codes.join('/')} 버전행=${rows}`)
}

// ─────────────────────────────────────────── 브라우저로 보는 것

const browser = await chromium.launch()
const ctx = await browser.newContext({ baseURL: APP })
await ctx.addCookies([cookieFor(token)])
const page = await ctx.newPage()

// 업로드 흐름이 실제로 쏜 요청을 기록한다. "discard 가 나갔는가"가 판정의 절반이다.
const seen = { presign: [], discard: [], create: 0 }
page.on('response', async (res) => {
  const u = res.url()
  if (u.includes('/api/documents/presign')) {
    try { seen.presign.push(await res.json()) } catch {}
  } else if (u.includes('/api/uploads/discard')) {
    try { seen.discard.push({ status: res.status(), body: await res.json() }) } catch {}
  } else if (/\/api\/documents$/.test(u) && res.request().method() === 'POST') {
    seen.create += 1
  }
})

writeFileSync('.pipeline/orphan-a.txt', 'A 정상 업로드 실측용\n')
writeFileSync('.pipeline/orphan-b.txt', 'B create 실패 주입 실측용\n')

async function openUploadDialog() {
  await page.goto('/')
  await page.getByRole('button', { name: /업로드|문서 올리기|올리기/ }).first().click()
  await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 10000 })
}

// X1 (기준 B) 정상 업로드 — discard 가 나가면 안 된다
{
  seen.presign.length = 0; seen.discard.length = 0; seen.create = 0
  await openUploadDialog()
  await page.setInputFiles('input[type=file]', '.pipeline/orphan-a.txt')
  await page.getByRole('button', { name: /올리기|업로드/ }).last().click()
  await page.waitForTimeout(6000)
  const key = seen.presign[0]?.key
  const alive = key ? await objectExists(key) : false
  const row = await page.getByText('orphan-a').count()
  await page.screenshot({ path: `${SHOT}/X1-normal.png`, fullPage: true })
  ok('X1', '정상 업로드: discard 가 안 나가고 객체·문서가 남는다',
     seen.discard.length === 0 && alive && key != null,
     `discard=${seen.discard.length} S3존재=${alive} 목록행=${row}`)
  if (key) cleanupKeys.push(key)
  const id = await withDb(async (c) => {
    const { rows } = await c.query(
      'select document_id from document_versions where s3_key = $1', [key])
    return rows[0]?.document_id
  })
  if (id) cleanupDocs.push(id)
  await page.keyboard.press('Escape')
}

// X2 (기준 D) create 를 400 으로 주입 → discard 가 나가고 객체가 사라져야 한다.
// 설계는 "임시 코드 + 스로틀링"을 제안했지만 route 가로채기면 소스를 안 건드린다.
{
  seen.presign.length = 0; seen.discard.length = 0; seen.create = 0
  await page.route('**/api/documents', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    await route.fulfill({
      status: 400, contentType: 'application/json',
      body: JSON.stringify({ error: '실측 주입: 문서 생성 실패' }),
    })
  })
  await openUploadDialog()
  await page.setInputFiles('input[type=file]', '.pipeline/orphan-b.txt')
  await page.getByRole('button', { name: /올리기|업로드/ }).last().click()
  await page.waitForTimeout(8000)
  const key = seen.presign[0]?.key
  const gone = key ? !(await objectExists(key)) : false
  await page.screenshot({ path: `${SHOT}/X2-create-fail.png`, fullPage: true })
  ok('X2', 'create 실패: discard 가 나가고 S3 객체가 사라진다',
     seen.discard.length === 1 && seen.discard[0]?.body?.deleted === true && gone,
     `discard=${JSON.stringify(seen.discard)} S3삭제됨=${gone} key=${key}`)
  if (key && !gone) cleanupKeys.push(key)
  await page.unroute('**/api/documents')
  await page.keyboard.press('Escape')
}

// X3 취소하면 정리 요청이 나간다 (이번 수정의 핵심 동작).
//
// 원래 이 자리는 JUDGE #7("abort 된 PUT 은 객체를 커밋하지 않는다")을 확인하려 했다.
// **그 전제는 이제 중요하지 않다** — 커밋됐든 아니든 정리를 부르도록 고쳤고, 객체가
// 없을 때 불려도 DeleteObject 가 멱등이라 무해하다(X6). 그래서 확인할 것은 하나다:
// 사람이 취소했을 때 `/api/uploads/discard` 가 실제로 나가는가.
//
// 타이밍으로는 못 잡는다 — 회선이 빨라 40MB 도 2.5초에 끝나고, CDP 대역 조임은
// S3 PUT 에 안 먹는다(무효 회차 3번으로 확인). 그래서 PUT 을 **S3 로 보내지 않고**
// 붙잡아 둔 채 취소한다. 객체는 애초에 안 생기므로 하네스가 만든 부작용도 없다.
{
  seen.presign.length = 0; seen.discard.length = 0
  writeFileSync('.pipeline/orphan-hold.txt', 'X3 취소 정리 실측용\n')

  const page3 = await ctx.newPage()
  // close() 의 첫 줄이 window.confirm 이다 (upload-dialog.tsx:306). Playwright 는
  // 기본으로 자동 취소(false)하므로 이걸 안 받으면 **취소가 아예 일어나지 않는다** —
  // 그 상태로도 "객체가 아직 없다"라서 통과하는 가짜 PASS 가 나왔다.
  page3.on('dialog', (d) => d.accept())
  const diag = { req: 0, putAborted: false }
  page3.on('request', (r) => { if (r.url().includes('/api/uploads/discard')) diag.req += 1 })
  page3.on('requestfailed', (r) => {
    if (r.method() === 'PUT' && /amazonaws\.com/.test(r.url())) diag.putAborted = true
  })
  page3.on('response', async (res) => {
    const u = res.url()
    if (u.includes('/api/documents/presign')) { try { seen.presign.push(await res.json()) } catch {} }
    else if (u.includes('/api/uploads/discard')) {
      try { seen.discard.push({ status: res.status(), body: await res.json() }) } catch {}
    }
  })

  let putSeen = false
  const forever = new Promise(() => {})
  await page3.route(/amazonaws\.com/, async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    putSeen = true
    await forever            // 영원히 붙잡는다 — S3 에 보내지 않는다
  })

  await page3.goto('/')
  await page3.getByRole('button', { name: /업로드|문서 올리기|올리기/ }).first().click()
  await page3.waitForSelector('input[type=file]', { state: 'attached', timeout: 15000 })
  await page3.setInputFiles('input[type=file]', '.pipeline/orphan-hold.txt')
  await page3.getByRole('button', { name: /올리기|업로드/ }).last().click()
  for (let i = 0; i < 60 && !putSeen; i++) await page3.waitForTimeout(250)
  // 업로드 중에는 하단 '취소' 가 실제 컨트롤이다. 헤더 × 는 클릭해도 닫히지 않았다
  // (스크린샷으로 확인) — 이름으로 고른 버튼이 눌린다는 보장이 없다는 실측 사례.
  await page3.getByRole('button', { name: '취소', exact: true }).click()
  await page3.waitForTimeout(4000)

  const key = seen.presign[0]?.key
  const docId = key ? await versionRowFor(key) : null
  await page3.screenshot({ path: `${SHOT}/X3-cancel-discard.png`, fullPage: true })
  if (!putSeen) {
    ok('X3', '취소하면 정리 요청이 나간다', null, '무효 — PUT 이 시작되지 않았다')
  } else if (docId) {
    ok('X3', '취소하면 정리 요청이 나간다', null, `무효 — 문서가 됐다 (doc=${docId})`)
    cleanupDocs.push(docId)
  } else {
    ok('X3', '취소하면 정리 요청이 나간다 (abort 경로)',
       diag.req === 1 && seen.discard[0]?.status === 200,
       `discard요청=${diag.req} 응답=${seen.discard[0]?.status ?? '없음'} PUT중단=${diag.putAborted}`)
  }
  await page3.unroute(/amazonaws\.com/)
}

// X8 본문을 다 보낸 뒤·응답이 오기 전에 취소 (코드리뷰 [medium] 실증).
//
// X3 은 전송 **도중**에 끊는다 — 그때는 객체가 안 남는다(위 PASS). 리뷰가 지적한 창은
// 다르다: S3 가 본문을 다 받아 **객체를 저장한 뒤** 응답 헤더가 브라우저에 닿기 전에
// abort 가 걸리는 구간이다.
//
// CDP latency 로는 못 벌린다 — S3 PUT 에 적용되지 않아 1.2초 만에 끝나 버렸다(무효 2회).
// 대신 route.fetch() 로 **진짜 S3 PUT 을 완료시켜 객체를 커밋한 뒤** 응답만 붙잡고
// 브라우저 XHR 을 abort 시킨다. 하네스가 객체를 만든 것이 아니라, 앱이 보낸 그 요청이
// 완료된 것이다 — S3 는 본문을 다 받으면 누가 보냈든 커밋한다.
{
  seen.presign.length = 0; seen.discard.length = 0
  writeFileSync('.pipeline/orphan-late.txt', 'X8 응답 지연 창 실측용\n')

  const page4 = await ctx.newPage()
  page4.on('dialog', (d) => d.accept())
  page4.on('response', async (res) => {
    const u = res.url()
    if (u.includes('/api/documents/presign')) { try { seen.presign.push(await res.json()) } catch {} }
    else if (u.includes('/api/uploads/discard')) {
      try { seen.discard.push({ status: res.status(), body: await res.json() }) } catch {}
    }
  })

  let committed = false
  let release
  const held = new Promise((r) => (release = r))
  await page4.route(/amazonaws\.com/, async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    const resp = await route.fetch()   // 실제 S3 PUT — 여기서 객체가 커밋된다
    committed = true
    await held                          // 응답만 붙잡아 둔다
    try { await route.fulfill({ response: resp }) } catch {}
  })

  await page4.goto('/')
  await page4.getByRole('button', { name: /업로드|문서 올리기|올리기/ }).first().click()
  await page4.waitForSelector('input[type=file]', { state: 'attached', timeout: 15000 })
  await page4.setInputFiles('input[type=file]', '.pipeline/orphan-late.txt')
  await page4.getByRole('button', { name: /올리기|업로드/ }).last().click()

  for (let i = 0; i < 80 && !committed; i++) await page4.waitForTimeout(250)
  await page4.keyboard.press('Escape')  // 객체는 이미 S3 에 있다. 여기서 abort 가 걸린다.
  await page4.waitForTimeout(1500)
  release()
  await page4.waitForTimeout(6000)

  const key = seen.presign[0]?.key
  const alive = key ? await objectExists(key) : null
  const docId8 = key ? await versionRowFor(key) : null
  await page4.screenshot({ path: `${SHOT}/X8-late-abort.png`, fullPage: true })
  if (!committed) {
    ok('X8', '본문 전송 후 응답 전 취소: 객체가 남지 않는다', null, '무효 — PUT 이 커밋에 도달하지 못했다')
  } else if (docId8) {
    ok('X8', '본문 전송 후 응답 전 취소: 객체가 남지 않는다', null,
       `무효 — 취소가 늦어 문서가 됐다 (doc=${docId8})`)
    cleanupDocs.push(docId8)
  } else {
    ok('X8', '본문 전송 후 응답 전 취소: 객체가 남지 않는다',
       alive === false,
       `key=${key} S3존재=${alive} 버전행=없음 discard=${seen.discard.length}`)
    if (alive) cleanupKeys.push(key)
  }
}

await browser.close()

// ─────────────────────────────────────────── 정리
for (const id of cleanupDocs) await purgeDocument(id, [])
if (cleanupKeys.length) await purgeDocument('00000000-0000-0000-0000-000000000000', cleanupKeys)
  .catch(() => {})

console.log(`\n[프로브] 없는 키 = ${MISSING_CODE}`)
console.log('\n── 결과')
console.table(results.map((r) => ({ id: r.id, pass: r.pass, desc: r.desc })))
const failed = results.filter((r) => r.pass === false)
const skipped = results.filter((r) => r.pass === null).length
console.log(`${results.filter((r) => r.pass === true).length}/${results.length - skipped} 통과 (무효 ${skipped})`)
process.exit(failed.length ? 1 : 0)
