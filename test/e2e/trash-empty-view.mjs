// 휴지통 비우기 버튼의 화면 실측. 버튼 → 확인 다이얼로그 → 취소 / 확인 → 토스트 → 빈 화면.
// vitest 는 node 환경이라 컴포넌트를 못 그린다 — 눌러서 무슨 일이 생기는지는 브라우저로만 본다.
//
// **관리자 계정으로 돌리지 않는다** (이유는 trash-empty.mjs 머리말). 휴지통이 빈 비관리자로
// 들어가므로 화면에 보이는 것도 지워지는 것도 이 스크립트가 만든 문서뿐이다.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { APP, mintSession, cookieFor, withDb, seedDocument, purgeDocument } from './helpers.mjs'

const SHOT = 'test/e2e/shots'
mkdirSync(SHOT, { recursive: true })

// text-sm(20px) + py-1(8px) = 28px 가 한 줄이다 (trash-row-layout.mjs 와 같은 기준).
const ONE_LINE_MAX = 38

const results = []
const ok = (id, desc, pass, detail = '') => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${desc}${detail ? ' — ' + detail : ''}`)
}

const candidates = await withDb(async (c) => {
  const { rows } = await c.query(
    `select u.discord_id from users u
      where u.discord_id <> $1
        and not exists (select 1 from documents d where d.created_by = u.id and d.deleted_at is not null)
      order by u.username limit 1`,
    [process.env.ADMIN_DISCORD_ID ?? ''],
  )
  return rows.map((r) => r.discord_id)
})
if (candidates.length < 1) throw new Error('휴지통이 빈 비관리자 계정이 필요하다')
const { token } = await mintSession({ discordId: candidates[0] })

const rowExists = (id) =>
  withDb(async (c) => (await c.query('select 1 from documents where id = $1', [id])).rowCount > 0)

const browser = await chromium.launch()
const seeded = []
try {
  for (const n of [1, 2, 3]) {
    const id = await seedDocument(token, {
      title: `[실측] 휴지통 비우기 화면 ${n}`,
      fileName: `trash-empty-view-${n}.txt`,
      body: `view ${n}\n`,
    })
    seeded.push(id)
  }
  // 앱이 하는 대로 지운다 — deleted_at 을 DB 시계로 찍으면 앱 시계로 찍는 before 와 기준이 갈린다.
  for (const id of seeded) {
    const res = await fetch(`${APP}/api/documents/${id}`, {
      method: 'DELETE', headers: { Cookie: `dms_session=${token}` },
    })
    if (!res.ok) throw new Error(`소프트 삭제 실패 ${res.status}`)
  }

  // 좁은 화면: 제목 줄이 버튼 때문에 깨지지 않는가
  const narrow = await browser.newContext({ viewport: { width: 390, height: 780 } })
  await narrow.addCookies([cookieFor(token)])
  const narrowPage = await narrow.newPage()
  await narrowPage.goto(`${APP}/trash`, { waitUntil: 'networkidle' })
  const narrowButton = narrowPage.getByRole('button', { name: '휴지통 비우기', exact: true })
  await narrowButton.waitFor({ state: 'visible' })
  const nb = await narrowButton.boundingBox()
  ok('V1', '390px 에서 버튼이 한 줄이고 화면 안에 있다',
    nb.height <= ONE_LINE_MAX && nb.x + nb.width <= 390,
    `높이 ${Math.round(nb.height)}px · 오른쪽 끝 ${Math.round(nb.x + nb.width)}px`)
  const overflow = await narrowPage.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  ok('V2', '390px 에서 가로 스크롤이 생기지 않는다', overflow === false)
  await narrowPage.screenshot({ path: `${SHOT}/TEV1-narrow.png` })
  await narrow.close()

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 780 } })
  await ctx.addCookies([cookieFor(token)])
  const page = await ctx.newPage()
  await page.goto(`${APP}/trash`, { waitUntil: 'networkidle' })

  const button = page.getByRole('button', { name: '휴지통 비우기', exact: true })
  await button.waitFor({ state: 'visible' })
  const bb = await button.boundingBox()
  const hb = await page.getByRole('heading', { name: '휴지통', exact: true }).boundingBox()
  ok('V3', '버튼이 제목 줄 오른쪽에 있다', bb.x > hb.x + hb.width && bb.y < hb.y + hb.height + 30,
    `버튼 x ${Math.round(bb.x)} · y ${Math.round(bb.y)} / 제목 y ${Math.round(hb.y)}`)
  const rowCount = await page.locator('tbody tr').count()
  ok('V4', '문구에 화면의 건수가 찍힌다', (await page.getByText('3개 문서').isVisible()) && rowCount === 3)
  // 이 계정의 휴지통에 다른 문서가 섞였으면 아래 확인 클릭이 그것까지 지운다. 여기서 멈춘다.
  if (rowCount !== 3) throw new Error(`휴지통에 스크립트가 만든 3건 말고 다른 문서가 있다 (${rowCount}행)`)
  await page.screenshot({ path: `${SHOT}/TEV2-header.png` })

  // 취소: 아무것도 지워지지 않는다
  await button.click()
  const dialog = page.getByRole('alertdialog')
  await dialog.waitFor({ state: 'visible' })
  const text = await dialog.innerText()
  ok('V5', '확인 문구에 건수와 되돌릴 수 없다는 말이 있다',
    text.includes('3개') && text.includes('되돌릴 수 없습니다'), text.replace(/\s+/g, ' ').slice(0, 80))
  await page.screenshot({ path: `${SHOT}/TEV3-dialog.png` })
  await dialog.getByRole('button', { name: '취소' }).click()
  await dialog.waitFor({ state: 'hidden' })
  const afterCancel = await Promise.all(seeded.map(rowExists))
  ok('V6', '취소하면 문서가 그대로다', afterCancel.every(Boolean))

  // 확인: 요청은 before 를 싣고 한 번만 나간다
  const requests = []
  page.on('request', (req) => {
    if (req.method() === 'DELETE' && req.url().includes('/api/documents/trash')) requests.push(req.url())
  })
  await button.click()
  await dialog.waitFor({ state: 'visible' })
  const started = Date.now()
  await dialog.getByRole('button', { name: '휴지통 비우기', exact: true }).click()
  const toast = page.getByText('문서 3개를 영구삭제했습니다.')
  await toast.waitFor({ state: 'visible', timeout: 15000 })
  const emptyState = page.getByText('휴지통이 비어 있습니다')
  await emptyState.waitFor({ state: 'visible', timeout: 15000 })
  const elapsed = Date.now() - started
  ok('V7', '토스트가 지운 건수를 알린다', true, `누른 뒤 빈 화면까지 ${elapsed}ms`)
  ok('V8', '요청이 before 를 싣고 한 번만 나갔다',
    requests.length === 1 && /[?&]before=\d{4}-\d{2}-\d{2}T/.test(requests[0]), `${requests.length}회`)
  ok('V9', '비운 뒤에는 버튼이 없다', (await page.getByRole('button', { name: '휴지통 비우기', exact: true }).count()) === 0)
  const afterEmpty = await Promise.all(seeded.map(rowExists))
  ok('V10', '문서 3건의 행이 사라졌다', afterEmpty.every((exists) => !exists))
  await page.screenshot({ path: `${SHOT}/TEV4-emptied.png` })
  await ctx.close()
} finally {
  await browser.close()
  for (const id of seeded) await purgeDocument(id)
}

const failed = results.filter((pass) => !pass).length
console.log(`\n${results.length - failed}/${results.length} 통과`)
process.exit(failed ? 1 : 0)
