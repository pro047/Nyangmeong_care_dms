// 0-2 실측 — 파괴적 확인 버튼(폴더 삭제 · 영구삭제)의 배경색이 실제로 danger 인지 본다.
// 이 결함은 build·lint·test 가 원리상 못 잡는다(2026-08-26 "색이 깨져 있었다"와 같은 계열).
// 판정 근거는 클래스 문자열이 아니라 getComputedStyle 이다.
import { chromium } from 'playwright'
import { APP, mintSession, cookieFor, withDb, seedDocument, purgeDocument, purgeFolders } from './helpers.mjs'

const DANGER = 'rgb(197, 0, 0)' // --color-danger: #c50000
const since = new Date()
const results = []
let ok = true

const check = (name, got) => {
  const pass = got === DANGER
  if (!pass) ok = false
  results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}  배경=${got}${pass ? '' : ` (기대 ${DANGER})`}`)
}

const { token } = await mintSession()
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 780 } })
await ctx.addCookies([cookieFor(token)])
const page = await ctx.newPage()

let folderId = null
let docId = null
try {
  // ── 1. 폴더 삭제 ─────────────────────────────────────────
  const fRes = await fetch(`${APP}/api/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `dms_session=${token}` },
    body: JSON.stringify({ name: `_실측_삭제색_${Date.now()}` }),
  })
  if (!fRes.ok) throw new Error(`folder create ${fRes.status} ${await fRes.text()}`)
  const folder = await fRes.json()
  folderId = folder.id

  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: `${folder.name} 삭제` }).click()
  const del = page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true })
  await del.waitFor({ state: 'visible' })
  check('폴더 삭제', await del.evaluate((el) => getComputedStyle(el).backgroundColor))
  await page.screenshot({ path: 'test/e2e/shots/DC1-folder-delete.png' })
  await page.keyboard.press('Escape')

  // ── 2. 영구삭제 (휴지통) ────────────────────────────────
  docId = await seedDocument(token, {
    title: `_실측_삭제색_${Date.now()}`, fileName: 'danger.txt', body: 'x',
  })
  await withDb((c) => c.query('update documents set deleted_at = now() where id = $1', [docId]))

  await page.goto(`${APP}/trash`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /영구삭제$/ }).first().click()
  const purge = page.getByRole('alertdialog').getByRole('button', { name: '영구삭제', exact: true })
  await purge.waitFor({ state: 'visible' })
  check('영구삭제', await purge.evaluate((el) => getComputedStyle(el).backgroundColor))
  await page.screenshot({ path: 'test/e2e/shots/DC2-purge.png' })

  // ── 3. 대조 — 일반 확인 버튼은 여전히 primary 여야 한다 ──
  const cancel = page.getByRole('alertdialog').getByRole('button', { name: '취소' })
  const cancelBg = await cancel.evaluate((el) => getComputedStyle(el).backgroundColor)
  results.push(`대조   취소(outline) 배경=${cancelBg} — danger 가 아니어야 정상`)
  if (cancelBg === DANGER) { ok = false; results.push('FAIL  취소 버튼까지 빨개졌다') }
} finally {
  await browser.close()
  if (docId) await purgeDocument(docId).catch((e) => console.error('purgeDocument', e.message))
  if (folderId) {
    await withDb((c) => c.query('delete from folders where id = $1', [folderId]))
      .catch((e) => console.error('folder cleanup', e.message))
  }
  const left = await purgeFolders(since).catch(() => [])
  if (left.length) console.log(`정리된 잔여 폴더: ${left.join(', ')}`)
}

console.log(results.join('\n'))
console.log(ok ? '\n전부 통과' : '\n실패 있음')
process.exit(ok ? 0 : 1)
