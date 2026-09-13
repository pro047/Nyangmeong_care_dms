/**
 * 목록에서 이력을 보는 것 · "판" 이 화면에서 사라진 것 브라우저 검증.
 *
 * 전제: `npm run dev`(3002) + 실제 .env (dev 브랜치).
 * 실행:  npm run test:e2e:version-history
 *
 * **왜 있나** (2026-09-13, 사람 신고): 운영에서 새 버전을 올렸는데 목록이 한 글자도 안 바뀌어
 * *"이전 문서가 하나도 없다"* 로 읽혔다. 실제로는 5회가 쌓여 있었고 상세에만 보였다.
 * 운영 실측으로 **활성 33건 중 10건(30%)이 이력 보유** — 세 문서 중 하나에서 나는 오해다.
 *
 * 렌더 테스트가 없는 리포라(vitest 가 node 환경) 이 화면은 여기서만 덮인다.
 */
import { chromium } from '@playwright/test'
import { APP, mintSession, cookieFor, withDb, seedDocument, purgeDocument } from './helpers.mjs'

const results = []
const check = (id, desc, pass, detail = '') => {
  results.push({ id, desc, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${desc}${detail ? ` — ${detail}` : ''}`)
}

const STAMP = Date.now()
const ONCE = `이력검증_한번만_v0.1_${STAMP}.txt`
const MANY = `이력검증_여러번_v0.1_${STAMP}.txt`

console.log(`■ 대상 APP : ${APP}`)
console.log(`■ 대상 DB  : ${(process.env.DATABASE_URL ?? '').split('@')[1]?.split('/')[0] ?? '?'}`)
console.log('■ 로컬이면 localhost + ep-aged-king 이어야 한다\n')

const { token } = await mintSession()
const made = []

/** 같은 문서에 새 버전을 더 올린다. 앱이 쓰는 경로(presign → PUT → /versions) 그대로. */
async function addVersion(documentId, fileName, body) {
  const H = { 'Content-Type': 'application/json', Cookie: `dms_session=${token}` }
  const pre = await fetch(`${APP}/api/documents/presign`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ fileName, contentType: 'text/plain', size: body.length }),
  })
  const { url, key, keyToken } = await pre.json()
  await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body })
  const res = await fetch(`${APP}/api/documents/${documentId}/versions`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      s3Key: key,
      keyToken,
      fileName,
      mimeType: 'text/plain',
      sizeBytes: body.length,
    }),
  })
  if (!res.ok) throw new Error(`새 버전 실패: ${res.status} ${await res.text()}`)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addCookies([cookieFor(token)])
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (err) => pageErrors.push(err.message))

try {
  const onceId = await seedDocument(token, { title: ONCE, fileName: ONCE, body: 'a' })
  const manyId = await seedDocument(token, { title: MANY, fileName: MANY, body: 'b' })
  made.push(onceId, manyId)
  // 3회짜리를 만든다 — 1회(신호 없음)와 여러 회(신호 있음)를 같은 화면에서 본다.
  await addVersion(manyId, `이력검증_여러번_v0.2_${STAMP}.txt`, 'bb')
  await addVersion(manyId, `이력검증_여러번_v0.3_${STAMP}.txt`, 'bbb')

  await page.goto(APP, { waitUntil: 'networkidle' })
  const rowOf = (title) => page.locator('tr', { hasText: title }).first()

  // ── 목록 신호 ────────────────────────────────────────────────
  const onceText = await rowOf(ONCE).innerText()
  check('H1', '1회만 올린 문서에는 횟수를 안 붙인다', !onceText.includes('회'),
    onceText.replace(/\s+/g, ' ').slice(0, 60))

  const manyRow = rowOf(MANY)
  const manyText = await manyRow.innerText()
  check('H2', '여러 번 올린 문서에 "3회" 가 붙는다', manyText.includes('3회'),
    manyText.replace(/\s+/g, ' ').slice(0, 60))
  check('H3', '파일명 버전도 같이 보인다', manyText.includes('v0.3'))

  // ── 펼치기 ───────────────────────────────────────────────────
  const before = await page.locator('a[href*="/download?v="]').count()
  check('H4', '펼치기 전에는 회차별 링크가 없다', before === 0, `${before}개`)

  await manyRow.getByRole('button', { name: /3회/ }).click()
  await page.waitForTimeout(200)
  const links = await page.locator('a[href*="/download?v="]').count()
  check('H5', '펼치면 회차 3개가 각자 링크로 나온다', links === 3, `${links}개`)

  const opened = await page.locator('li', { hasText: '이력검증_여러번_v0.1' }).count()
  check('H6', '펼친 목록에 옛 파일명이 그대로 보인다', opened > 0, `${opened}건`)

  await page.screenshot({ path: 'test/e2e/shots/VH-expanded.png' })

  await manyRow.getByRole('button', { name: /3회/ }).click()
  await page.waitForTimeout(200)
  check('H7', '다시 누르면 접힌다', (await page.locator('a[href*="/download?v="]').count()) === 0)

  // ── 화면에서 "판" 이 사라졌나 ────────────────────────────────
  const listText = await page.locator('main').innerText()
  check('H8', '목록에 "판" 이라는 말이 없다', !listText.includes('판'),
    listText.split('\n').filter((l) => l.includes('판')).join(' / ') || '없음')

  // ── 상세: 열 이름이 회차 ─────────────────────────────────────
  await page.goto(`${APP}/documents/${manyId}`, { waitUntil: 'networkidle' })
  const detail = await page.locator('main').innerText()
  check('H9', '상세 이력 열 이름이 "회차" 다', detail.includes('회차'))
  check('H10', '상세에도 "판" 이 없다', !detail.includes('판'),
    detail.split('\n').filter((l) => l.includes('판')).join(' / ') || '없음')

  check('H11', '콘솔 에러가 없다', pageErrors.length === 0, pageErrors.join(' / ') || '없음')
} finally {
  await browser.close()
  for (const id of made) await purgeDocument(id).catch(() => {})
  const left = await withDb((c) =>
    c.query('select count(*)::int as n from documents where title like $1', [`이력검증_%${STAMP}`]),
  )
  console.log(`\n정리: 이 스위트가 만든 문서 ${left.rows[0].n}건 남음`)
}

const passed = results.filter((r) => r.pass).length
console.log(`\n===== ${passed}/${results.length} PASS =====`)
process.exit(passed === results.length ? 0 : 1)
