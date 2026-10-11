// 종류별 일괄 받기 실측. 단위 테스트는 가짜 fetch 로 돈다 — 브라우저가 우리 라우트의 307 을 따라
// S3 에서 본문을 읽을 수 있는지(CORS · 첨부 처분), zip 이 실제로 저장되는지는 여기서만 본다.
// 읽기만 한다: 문서를 만들거나 지우지 않는다. dev 서버(3002) + 실 자격증명이 필요하다.
import { chromium } from 'playwright'
import JSZip from 'jszip'
import { mkdirSync, readFileSync } from 'node:fs'
import { APP, mintSession, cookieFor, withDb } from './helpers.mjs'

const SHOT = 'test/e2e/shots'
mkdirSync(SHOT, { recursive: true })

const results = []
const ok = (id, desc, pass, detail = '') => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${desc}${detail ? ' — ' + detail : ''}`)
}

// 기대값은 화면이 아니라 DB 에서 따로 센다 — 화면이 준 숫자로 화면을 검증하면 같이 틀린다.
const db = await withDb(async (c) => {
  const folders = (await c.query('select id, name, parent_id from folders')).rows
  const docs = (
    await c.query(
      `select d.id, d.folder_id, v.file_name, v.size_bytes
         from documents d
         join lateral (
           select file_name, size_bytes from document_versions
            where document_id = d.id order by version_no desc limit 1
         ) v on true
        where d.deleted_at is null`,
    )
  ).rows
  return { folders, docs }
})
const byId = new Map(db.folders.map((f) => [f.id, f]))
const rootOf = (folderId) => {
  let current = byId.get(folderId)
  while (current?.parent_id) current = byId.get(current.parent_id)
  return current ?? null
}
const expectedBytes = db.docs.reduce((sum, d) => sum + Number(d.size_bytes), 0)
const topLevel = db.folders.filter((f) => f.parent_id === null)
// 문서가 가장 많은 종류 하나 — 하위 폴더가 포함되는지 볼 대상
const perRoot = new Map()
for (const d of db.docs) {
  const root = d.folder_id ? rootOf(d.folder_id) : null
  if (!root) continue
  perRoot.set(root.id, (perRoot.get(root.id) ?? 0) + 1)
}
const [biggestId, biggestCount] = [...perRoot.entries()].sort((a, b) => b[1] - a[1])[0]
const biggest = byId.get(biggestId)
const nestedCount = db.docs.filter((d) => d.folder_id && d.folder_id !== biggestId && rootOf(d.folder_id)?.id === biggestId).length
console.log(`기대값: 활성 문서 ${db.docs.length}건 · ${expectedBytes}바이트 · 최상위 폴더 ${topLevel.length}개 · 가장 큰 종류 "${biggest.name}" ${biggestCount}건(하위 폴더 ${nestedCount}건)`)

const { token } = await mintSession()
const browser = await chromium.launch()
try {
  // 좁은 화면: 버튼이 둘이 된 제목 줄
  const narrow = await browser.newContext({ viewport: { width: 390, height: 780 } })
  await narrow.addCookies([cookieFor(token)])
  const narrowPage = await narrow.newPage()
  await narrowPage.goto(`${APP}/`, { waitUntil: 'networkidle' })
  const overflow = await narrowPage.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  ok('B1', '390px 에서 가로 스크롤이 생기지 않는다', overflow === false)
  await narrowPage.screenshot({ path: `${SHOT}/BD1-narrow.png` })
  await narrow.close()

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  await ctx.addCookies([cookieFor(token)])
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  // 콘솔 문구에는 주소가 없다 — 어느 요청이 실패했는지는 응답에서 따로 모은다.
  const failedResponses = []
  page.on('response', (res) => {
    if (res.status() >= 400) failedResponses.push(`${res.status()} ${new URL(res.url()).origin}${new URL(res.url()).pathname}`)
  })
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${SHOT}/BD2-header.png` })

  const trigger = page.getByRole('button', { name: '일괄 다운로드', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor({ state: 'visible' })
  const rows = dialog.locator('label').filter({ hasNot: page.getByText('전체 선택/해제') })
  const rowTexts = await rows.allInnerTexts()
  ok('B2', '최상위 폴더가 전부 종류로 나온다',
    topLevel.every((f) => rowTexts.some((t) => t.includes(f.name))), `${rowTexts.length}줄`)
  ok('B3', '종류의 문서 수에 하위 폴더 문서가 들어간다',
    rowTexts.some((t) => t.includes(biggest.name) && t.includes(`${biggestCount}개`)),
    `"${biggest.name}" ${biggestCount}개 기대`)
  // 열리는 애니메이션이 끝난 뒤에 찍는다 — 바로 찍으면 반투명한 중간 프레임이 남는다.
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOT}/BD3-dialog.png` })

  // 한 종류만: 그 종류의 문서만 들어온다
  await dialog.locator('label', { hasText: biggest.name }).first().locator('input').check()
  ok('B4', '고른 합계가 그 종류의 건수다', await dialog.getByText(`고른 문서 ${biggestCount}개`).isVisible())
  let [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    dialog.getByRole('button', { name: '받기', exact: true }).click(),
  ])
  let zip = await JSZip.loadAsync(readFileSync(await download.path()))
  let files = Object.values(zip.files).filter((f) => !f.dir)
  ok('B5', '한 종류만 받으면 그 건수만 들어 있다', files.length === biggestCount, `${files.length}건`)
  ok('B6', '경로가 전부 그 종류 폴더 아래다', files.every((f) => f.name.startsWith(`${biggest.name}/`)))
  ok('B7', '하위 폴더 문서는 한 단계 더 들어간 경로다',
    files.filter((f) => f.name.split('/').length >= 3).length === nestedCount,
    `3단 이상 ${files.filter((f) => f.name.split('/').length >= 3).length}건`)
  ok('B8', 'zip 파일명이 DMS_문서_날짜_시각.zip 이다', /^DMS_문서_\d{8}_\d{4}\.zip$/.test(download.suggestedFilename()),
    download.suggestedFilename())

  // 전체: 건수와 바이트 합이 DB 와 같다
  await trigger.click()
  await dialog.waitFor({ state: 'visible' })
  await dialog.getByLabel('전체 선택/해제').check()
  const started = Date.now()
  ;[download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    dialog.getByRole('button', { name: '받기', exact: true }).click(),
  ])
  const elapsed = Date.now() - started
  zip = await JSZip.loadAsync(readFileSync(await download.path()))
  files = Object.values(zip.files).filter((f) => !f.dir)
  let bytes = 0
  for (const f of files) bytes += (await f.async('uint8array')).byteLength
  ok('B9', '전체를 받으면 활성 문서 수만큼 들어 있다', files.length === db.docs.length,
    `${files.length}/${db.docs.length}건 · ${elapsed}ms`)
  ok('B10', '내용 크기 합이 DB 의 최신판 크기 합과 같다', bytes === expectedBytes, `${bytes}/${expectedBytes}바이트`)
  // zip 의 시각에는 시간대가 없다. 푼 파일의 수정 시각이 지금(로컬)과 맞아야 한다 — 보정이 빠지면 9시간 어긋난다.
  const wall = (d) => d.getUTCHours() * 60 + d.getUTCMinutes()
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
  const drift = Math.abs(wall(files[0].date) - wall(nowLocal))
  ok('B14', 'zip 항목 시각이 로컬 벽시계와 맞는다', Math.min(drift, 1440 - drift) <= 2, `차이 ${Math.min(drift, 1440 - drift)}분`)
  ok('B11', '경로가 겹치지 않는다', new Set(files.map((f) => f.name.normalize('NFC').toLowerCase())).size === files.length)
  await page.getByText(`문서 ${db.docs.length}개를 받았습니다.`).waitFor({ state: 'visible', timeout: 10000 })
  ok('B12', '토스트가 받은 건수를 알린다', true)
  // 헤더의 `/avatar-fallback.svg` 는 파일이 없어 원래 404 다(이 기능과 무관, 2026-10-11 실측). 그것만 뺀다.
  const unexpected = failedResponses.filter((line) => !line.endsWith('/avatar-fallback.svg'))
  ok('B13', '받는 동안 실패한 요청(CORS 포함)이 없다',
    unexpected.length === 0 && consoleErrors.length <= failedResponses.length - unexpected.length,
    [...unexpected.slice(0, 4), `콘솔 오류 ${consoleErrors.length}건`].join(' | '))
  await ctx.close()
} finally {
  await browser.close()
}

const failed = results.filter((pass) => !pass).length
console.log(`\n${results.length - failed}/${results.length} 통과`)
process.exit(failed ? 1 : 0)
