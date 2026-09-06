// 카테고리 폴더 본문에 자식 폴더를 그리는 변경의 실측 (DESIGN.md §7.3 의 B1~B9).
//
// 2026-09-06 화면 실측 뒤 모양이 바뀌었다 — 별도 카드 격자가 아니라 **문서 표 안의 폴더 행**
// 이고, 제목·브레드크럼은 크기를 안 섞는다. 이 파일의 셀렉터는 그 모양을 본다.
//
// build·lint·test 가 원리상 못 잡는 구간을 태운다. vitest 는 순수 함수만 지나가고
// (`vitest.config.mts` 가 environment: 'node' · include: src/**/*.test.ts 라 .tsx 는 수집조차
// 안 된다) 렌더·라우팅·Prisma 런타임은 아무 검사도 안 받는다.
//
// 특히 B6 이 이 파일의 존재 이유다 — 관계 _count 의 where 가 Prisma 7 + @prisma/adapter-pg
// 런타임에서 적용되는지는 타입검사·빌드가 통과해도 알 수 없고, 안 먹으면 카드 숫자에
// 휴지통 문서가 조용히 섞인다.
//
// 기대값은 문서에서 베끼지 않고 매번 SQL 로 센다. dev DB 는 계속 바뀐다.
import { chromium } from 'playwright'
import { APP, mintSession, cookieFor, withDb } from './helpers.mjs'

const results = []
let ok = true

const check = (name, pass, detail) => {
  if (!pass) ok = false
  results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

const one = async (sql, params) => (await withDb((c) => c.query(sql, params))).rows[0]
const all = async (sql, params) => (await withDb((c) => c.query(sql, params))).rows

const kidsOf = (id) =>
  all(
    `select f.id, f.name,
            (select count(*) from documents d
              where d.folder_id = f.id and d.deleted_at is null)::int as docs
       from folders f where f.parent_id = $1`,
    [id],
  )
const activeDocs = async (id) =>
  (await one(
    'select count(*)::int n from documents where folder_id = $1 and deleted_at is null',
    [id],
  )).n

// 폴더 행은 문서 표 안에서 colSpan 한 칸을 통째로 쓴다. 문서 행과 셀렉터가 갈리는 지점이다.
const FOLDER_ROW = 'table tbody td[colspan] a'
const DOC_ROW = 'table tbody tr a[href^="/documents/"]'

const readCards = (page) =>
  page.$$eval(FOLDER_ROW, (as) =>
    as.map((a) => ({
      name: a.querySelector('span.truncate-cell')?.textContent?.trim(),
      count: [...a.querySelectorAll('span')].pop()?.textContent?.trim(),
      href: a.getAttribute('href'),
      y: Math.round(a.getBoundingClientRect().y),
      right: Math.round(a.getBoundingClientRect().right),
    })),
  )
const folderRowCount = (page) => page.locator(FOLDER_ROW).count()
const rowCount = (page) => page.locator(DOC_ROW).count()
const subtitle = (page) => page.locator('h1').locator('xpath=../following-sibling::p[1]').innerText()

const root = async (name) =>
  one('select id from folders where name = $1 and parent_id is null', [name])

const { token, user } = await mintSession()
const 화면설계서 = await root('화면설계서')
const 기능명세서 = await root('기능명세서')
if (!화면설계서 || !기능명세서) throw new Error('기준 카테고리 폴더가 dev DB 에 없다')
const 마이페이지 = await one('select id from folders where parent_id = $1 and name = $2', [
  화면설계서.id,
  '마이페이지',
])

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addCookies([cookieFor(token)])
const page = await ctx.newPage()

let seededDoc = null // B6 이 만든 문서. finally 에서 반드시 지운다
let seededFolder = null // B9 이 만든 3뎁스 폴더

try {
  // ── B1 · 카테고리를 열면 카드가 뜨고 점선 박스가 안 뜬다 ────────────────
  const kids1 = await kidsOf(화면설계서.id)
  await page.goto(`${APP}/?folder=${화면설계서.id}`, { waitUntil: 'networkidle' })

  const cards1 = await readCards(page)
  check(
    'B1 폴더 행 수 = SQL 자식 수',
    cards1.length === kids1.length,
    `화면=${cards1.length} SQL=${kids1.length}`,
  )
  const byName = new Map(kids1.map((k) => [k.name, k.docs]))
  const wrong = cards1.filter(
    (c) => c.count !== (byName.get(c.name) > 0 ? `${byName.get(c.name)}개 문서` : '문서 없음'),
  )
  check(
    'B1 폴더 행 숫자 = SQL 활성 문서 수',
    wrong.length === 0,
    wrong.length ? JSON.stringify(wrong) : cards1.map((c) => `${c.name}:${c.count}`).join(' '),
  )
  check(
    'B1 폴더 행이 한국어 이름 오름차순',
    JSON.stringify(cards1.map((c) => c.name)) ===
      JSON.stringify([...cards1.map((c) => c.name)].sort((a, b) => a.localeCompare(b, 'ko'))),
    cards1.map((c) => c.name).join(' < '),
  )
  check('B1 제목이 폴더 이름', (await page.locator('h1').innerText()) === '화면설계서', await page.locator('h1').innerText())
  check('B1 부제가 하위 폴더 수', (await subtitle(page)) === `하위 폴더 ${kids1.length}개`, await subtitle(page))
  // 문서가 0건이어도 표는 그려야 한다 — 폴더 행이 그 표 안에 산다.
  check('B1 표가 있다', (await page.locator('table').count()) === 1, `table=${await page.locator('table').count()}`)
  check('B1 문서 행은 0', (await rowCount(page)) === 0, `문서행=${await rowCount(page)}`)
  // 이번에 고친 증상이 정확히 이것이다 — 자식이 있는데 점선 박스가 뜨는 것.
  check('B1 점선 박스가 없다', (await page.locator('.border-dashed').count()) === 0, `dashed=${await page.locator('.border-dashed').count()}`)
  // 폴더 행이 문서 행과 같은 표 폭을 쓴다 — 다르면 목록 하나로 안 읽힌다.
  const tableRight = Math.round((await page.locator('table').boundingBox()).width + (await page.locator('table').boundingBox()).x)
  check(
    'B1 폴더 행이 표 전체 폭을 쓴다',
    cards1.every((c) => Math.abs(c.right - tableRight) <= 20),
    `표 우변=${tableRight} 행 우변=${[...new Set(cards1.map((c) => c.right))].join(',')}`,
  )
  await page.screenshot({ path: 'test/e2e/shots/FCV-B1-category.png' })

  // ── B2 · 카드를 누르면 그 폴더로 들어간다 ──────────────────────────────
  await page.locator(FOLDER_ROW, { hasText: '마이페이지' }).first().click()
  await page.waitForURL(`**/?folder=${마이페이지.id}`)
  await page.waitForLoadState('networkidle')
  const docs2 = await activeDocs(마이페이지.id)
  check('B2 URL 이 자식 폴더', page.url().includes(`folder=${마이페이지.id}`), page.url())
  check('B2 제목이 마지막 세그먼트', (await page.locator('h1').innerText()) === '마이페이지', await page.locator('h1').innerText())
  const crumbLink = page.locator('nav[aria-label="폴더 경로"] a')
  check('B2 브레드크럼 조상이 링크', (await crumbLink.count()) === 1 && (await crumbLink.innerText()) === '화면설계서', `${await crumbLink.count()}개`)
  check('B2 폴더 행 없음', (await folderRowCount(page)) === 0, '')
  // 제목과 조상의 글자 크기가 같아야 한다 (2026-09-06 요청 — 작은 쪽으로 통일).
  const [crumbSize, titleSize] = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="폴더 경로"]')
    return [
      getComputedStyle(nav.querySelector('a')).fontSize,
      getComputedStyle(nav.querySelector('h1')).fontSize,
    ]
  })
  check('B2 브레드크럼 글자 크기 통일', crumbSize === titleSize, `조상=${crumbSize} 제목=${titleSize}`)
  check('B2 표 행 수 = SQL', (await rowCount(page)) === docs2, `화면=${await rowCount(page)} SQL=${docs2}`)
  // 사이드바의 '전체 문서'는 usePathname() 이 쿼리스트링을 빼는 탓에 /?folder= 에서도 계속
  // aria-current 다 (app-sidebar.tsx:25, 이번 변경 밖의 기존 동작). 폴더 링크만 골라 본다.
  const active = await page.locator('a[href*="?folder="][aria-current="page"]').innerText()
  check('B2 사이드바 활성 표시가 이동', active.trim() === '마이페이지', active.trim())
  await page.screenshot({ path: 'test/e2e/shots/FCV-B2-child.png' })

  // ── B3 · 브레드크럼으로 되돌아온다 ────────────────────────────────────
  // 소프트 내비게이션이라 networkidle 이 URL 교체보다 먼저 풀린다 — URL 자체를 기다린다.
  await crumbLink.click()
  await page.waitForURL(`**/?folder=${화면설계서.id}`)
  await page.waitForLoadState('networkidle')
  check(
    'B3 브레드크럼으로 부모 복귀',
    page.url().includes(`folder=${화면설계서.id}`) && (await readCards(page)).length === kids1.length,
    page.url(),
  )

  // ── B4 · 자식과 문서가 둘 다 있는 카테고리 ────────────────────────────
  const kids4 = await kidsOf(기능명세서.id)
  const docs4 = await activeDocs(기능명세서.id)
  await page.goto(`${APP}/?folder=${기능명세서.id}`, { waitUntil: 'networkidle' })
  check('B4 폴더 행 수 = SQL', (await readCards(page)).length === kids4.length, `${(await readCards(page)).length} vs ${kids4.length}`)
  check('B4 표 행 수 = SQL', (await rowCount(page)) === docs4, `${await rowCount(page)} vs ${docs4}`)
  check('B4 부제가 둘 다 표기', (await subtitle(page)) === `하위 폴더 ${kids4.length}개 · ${docs4}개 문서`, await subtitle(page))
  // 폴더가 문서보다 위여야 한다 (파일 탐색기 순서). 같은 표 안이므로 tbody 행 순서로 본다.
  const order = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('table tbody tr')]
    const isFolder = (tr) => tr.querySelector('td[colspan]') !== null
    const lastFolder = rows.findLastIndex(isFolder)
    const firstDoc = rows.findIndex((tr) => !isFolder(tr))
    return { lastFolder, firstDoc, total: rows.length }
  })
  check('B4 폴더 행이 문서 행보다 위', order.lastFolder < order.firstDoc, JSON.stringify(order))
  check('B4 표가 하나다 (테두리가 안 갈린다)', (await page.locator('table').count()) === 1, '')
  await page.screenshot({ path: 'test/e2e/shots/FCV-B4-mixed.png' })

  // ── B5 · 카드가 뜨면 안 되는 화면들 + 죽은 링크 회귀 ──────────────────
  const totalActive = (await one('select count(*)::int n from documents where deleted_at is null')).n
  const anyTag = await one('select name from tags limit 1')

  await page.goto(`${APP}/`, { waitUntil: 'networkidle' })
  check('B5 / 에 폴더 행 없음', (await folderRowCount(page)) === 0, '')
  if (anyTag) {
    await page.goto(`${APP}/?tag=${encodeURIComponent(anyTag.name)}`, { waitUntil: 'networkidle' })
    check('B5 태그 화면에 폴더 행 없음', (await folderRowCount(page)) === 0, `태그=${anyTag.name}`)
  }
  await page.goto(`${APP}/?folder=존재하지않는id`, { waitUntil: 'networkidle' })
  check('B5 죽은 링크에 폴더 행 없음', (await folderRowCount(page)) === 0, '')
  // findUnique 를 없애고 folderRows.find 로 바꾼 D4 가 이 규칙을 깼는지 보는 자리다.
  check('B5 죽은 링크는 전체 목록으로 (빈 화면 아님)', (await rowCount(page)) === totalActive, `화면=${await rowCount(page)} 전체=${totalActive}`)

  // ── B6 · _count.where 런타임 실증 (생략 불가) ─────────────────────────
  // 팀 문서를 건드리지 않으려고 이 테스트만의 문서를 하나 만들어 그것을 휴지통에 넣는다.
  // S3 객체는 만들지 않는다 — 목록은 DB 만 읽고 이 문서를 내려받지 않는다.
  const before = await activeDocs(마이페이지.id)
  seededDoc = (await one(
    `with d as (
       insert into documents (id, title, folder_id, created_by, created_at, updated_at)
       values (gen_random_uuid()::text, $1, $2, $3, now(), now()) returning id
     )
     insert into document_versions
       (id, document_id, version_no, s3_key, file_name, mime_type, size_bytes, uploaded_by, created_at)
     select gen_random_uuid()::text, d.id, 1, $4, 'fcv-probe.txt', 'text/plain', 1, $3, now()
       from d returning document_id as id`,
    [`_실측_카드카운트_${Date.now()}`, 마이페이지.id, user.id, `e2e/fcv-${Date.now()}.txt`],
  )).id

  const readFolderRow = async () => {
    await page.goto(`${APP}/?folder=${화면설계서.id}`, { waitUntil: 'networkidle' })
    return (await readCards(page)).find((c) => c.name === '마이페이지')?.count
  }
  const seeded = await readFolderRow()
  check('B6-1 새 문서가 폴더 행 숫자에 반영', seeded === `${before + 1}개 문서`, `${seeded} (기대 ${before + 1}개 문서)`)

  await withDb((c) => c.query('update documents set deleted_at = now() where id = $1', [seededDoc]))
  const trashed = await readFolderRow()
  check(
    'B6-2 휴지통에 넣으면 폴더 행 숫자가 준다 (_count.where 런타임 적용)',
    trashed === `${before}개 문서`,
    `${trashed} (기대 ${before}개 문서 — 안 줄면 where 가 무시된 것이다)`,
  )

  await withDb((c) => c.query('update documents set deleted_at = null where id = $1', [seededDoc]))
  const restored = await readFolderRow()
  check('B6-3 복구하면 되돌아온다', restored === `${before + 1}개 문서`, `${restored}`)

  // ── B7 · 업로드 다이얼로그 기본 폴더 회귀 ─────────────────────────────
  await page.goto(`${APP}/?folder=${화면설계서.id}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '업로드' }).first().click()
  await page.waitForSelector('#upload-folder')
  const selected = await page.$eval('#upload-folder', (s) => s.value)
  const optionCount = await page.$eval('#upload-folder', (s) => s.options.length)
  check('B7 업로드 기본 폴더 = 열어 둔 폴더', selected === 화면설계서.id, `value=${selected}`)
  // _count 가 붙은 행을 그대로 넘기므로 옵션 목록이 이전과 같아야 한다.
  // 옵션은 '자동 분류' + '— (미분류)' + 폴더 전부다 (upload-dialog.tsx:532-539).
  const folderTotal = (await one('select count(*)::int n from folders')).n
  check('B7 셀렉트 옵션 수 = 폴더 수 + 2', optionCount === folderTotal + 2, `옵션=${optionCount} 폴더=${folderTotal}`)
  await page.keyboard.press('Escape')

  // ── B8 · 반응형 ───────────────────────────────────────────────────────
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${APP}/?folder=${화면설계서.id}`, { waitUntil: 'networkidle' })
  const wideRows = await readCards(page)
  check('B8 넓은 화면에서 폴더가 한 줄에 하나씩', new Set(wideRows.map((r) => r.y)).size === wideRows.length, `행=${wideRows.length} y=${new Set(wideRows.map((r) => r.y)).size}`)

  await page.setViewportSize({ width: 600, height: 900 })
  await page.waitForTimeout(300)
  const narrowRows = await readCards(page)
  check('B8 좁은 화면에서도 행 수가 같다', narrowRows.length === wideRows.length, `${narrowRows.length} vs ${wideRows.length}`)
  // 좁아지면 이름이 잘려야 한다 — 잘리지 않고 밀면 표가 가로로 넘친다.
  const bodyOverflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 1)
  check('B8 좁은 화면에서 가로 스크롤이 안 생긴다', bodyOverflow === false, `bodyOverflow=${bodyOverflow}`)
  await page.screenshot({ path: 'test/e2e/shots/FCV-B8-narrow.png' })
  await page.setViewportSize({ width: 1440, height: 900 })

  // ── B9 · 3뎁스에서도 안 깨진다 (막는 것은 범위 밖) ────────────────────
  const created = await fetch(`${APP}/api/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `dms_session=${token}` },
    body: JSON.stringify({ name: `_실측_3뎁스_${Date.now()}`, parentId: 마이페이지.id }),
  })
  if (created.ok) {
    seededFolder = (await created.json()).id
    await page.goto(`${APP}/?folder=${마이페이지.id}`, { waitUntil: 'networkidle' })
    const cards9 = await readCards(page)
    check('B9 3뎁스에서도 직계 폴더 행 1개', cards9.length === 1, `행=${cards9.length}`)
    check('B9 표도 같이 그려진다', (await rowCount(page)) === (await activeDocs(마이페이지.id)), `${await rowCount(page)}`)
  } else {
    check('B9 3뎁스 폴더 생성', false, `POST /api/folders ${created.status}`)
  }
} finally {
  await browser.close()
  // 실패로 빠져나가도 dev DB 에 흔적을 남기지 않는다.
  if (seededFolder) {
    await withDb((c) => c.query('delete from folders where id = $1', [seededFolder]))
  }
  if (seededDoc) {
    await withDb(async (c) => {
      await c.query('delete from document_versions where document_id = $1', [seededDoc])
      await c.query('delete from documents where id = $1', [seededDoc])
    })
  }
}

console.log(results.join('\n'))
console.log(ok ? '\n전부 통과' : '\n실패 있음')
process.exit(ok ? 0 : 1)
