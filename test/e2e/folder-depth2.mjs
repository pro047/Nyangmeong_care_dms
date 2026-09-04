/**
 * 폴더 2뎁스 자동 분류 브라우저 실측 (VERIFY.md §4 의 B1~B10).
 *
 * `npm test` 는 순수 함수만 지나므로 upload-dialog.tsx 는 한 줄도 실행되지 않는다.
 * JUDGE #29: 호출부가 이미 FolderAliasRow 를 넘기므로 ClassifyFolder 에 parentId 를
 * 넣어도 **타입 오류가 안 난다** — 경로 라벨·createFolder(parentId, name)·흡수 판정은
 * 컴파일러가 침묵한다. 그 구간을 덮는 것이 이 파일이다.
 *
 * 기대 문자열은 관찰이 아니라 VERIFY.md §4 에서 온다 — 버그를 미리 알아야만 쓸 수 있는
 * assert 가 아니다.
 *
 * 실행: npm run test:e2e:fd2   (dev 서버가 3002 에 떠 있어야 한다)
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { APP, mintSession, cookieFor, purgeDocument, purgeFolders, withDb } from './helpers.mjs'

const SHOT = 'test/e2e/shots'
mkdirSync(SHOT, { recursive: true })
const TMP = 'test/e2e/_files'
mkdirSync(TMP, { recursive: true })

// created_at 비교 기준. purgeFolders 와 같은 이유로 UTC 벽시계를 쓴다.
const START = new Date()

let PASS = 0
let FAIL = 0
const results = []
const green = (s) => console.log(`\x1b[32m${s}\x1b[0m`)
const red = (s) => console.log(`\x1b[31m${s}\x1b[0m`)

function check(id, what, ok, detail = '') {
  results.push({ id, what, ok, detail })
  if (ok) {
    green(`  PASS  ${id} ${what}`)
    PASS++
  } else {
    red(`  FAIL  ${id} ${what}${detail ? ` — ${detail}` : ''}`)
    FAIL++
  }
}

// ── 픽스처. 파일명이 곧 입력이므로 내용은 아무래도 좋다.
const F_SUB = '03_마이페이지_화면설계서_v0_3_260817.html'
const F_SUB2 = '03_마이페이지_화면설계서_v0_4_260825.html'
const F_FSPEC_MY = '04_기능명세서_마이페이지_v0.1_260826.xlsx'
const F_FSPEC = '04_기능명세서_v0.1_2026_08_26.xlsx'
const F_IA = '02_IA 구조도_v0.2_2026_08_17.xlsx'
const F_ALIAS = '06_로그인_회원가입_와이어프레임.html'
const F_CANCEL = '03_설정_화면설계서_v0_1_260902.html'
const F_MANUAL = '자동검증_수동모드_260902.html'

const filePath = (name) => {
  const p = `${TMP}/${name}`
  writeFileSync(p, `<p>${name}</p>`)
  return p
}

// ── DB 도우미
const folderRows = () =>
  withDb((c) =>
    c
      .query(
        `select f.id, f.name, f.aliases, f.parent_id, p.name as parent,
                (select count(*)::int from documents d
                  where d.folder_id = f.id and d.deleted_at is null) as docs
           from folders f left join folders p on p.id = f.parent_id
          order by coalesce(p.name, '') , f.name`,
      )
      .then((r) => r.rows),
  )

/** 폴더 트리 지문. 실행 전후가 같아야 소급 이동의 26행 기준선이 안 깨진다. */
const fingerprint = (rows) =>
  rows
    .map((r) => `${r.parent ?? '/'}/${r.name}[${r.docs}]{${[...r.aliases].sort().join(',')}}`)
    .sort()
    .join('\n')

const findFolder = (rows, name, parent = null) =>
  rows.find((r) => r.name === name && (r.parent ?? null) === parent)

const docsCreatedSince = () =>
  withDb((c) =>
    c
      .query('select id from documents where created_at >= $1::timestamp', [START.toISOString()])
      .then((r) => r.rows.map((x) => x.id)),
  )

// ── 브라우저
const { token } = await mintSession()
const browser = await chromium.launch()
const ctx = await browser.newContext({ baseURL: APP, viewport: { width: 1440, height: 900 } })
await ctx.addCookies([cookieFor(token)])
const page = await ctx.newPage()

// 업로드 중 닫기는 shadcn 이 아니라 네이티브 confirm 이다 (upload-dialog.tsx:320).
let acceptConfirm = false
page.on('dialog', (d) => (acceptConfirm ? d.accept() : d.dismiss()))

// B10 용. 브라우저가 S3 로 직접 PUT 하는지 본다.
const s3Puts = []
page.on('request', (req) => {
  if (req.method() === 'PUT' && /amazonaws\.com/.test(req.url())) s3Puts.push(req.url())
})

const dialog = () => page.getByRole('dialog')
const destSelect = (file) => page.getByLabel(`${file} 저장할 폴더`)
const startBtn = () => dialog().getByRole('button', { name: '업로드 시작' })

/** 담긴 행의 근거 줄. li 안 두 번째 p 다. */
async function reasonOf(file) {
  const li = dialog().locator('li', { hasText: file }).first()
  return (await li.locator('p').nth(1).innerText()).trim()
}

/** 그 행이 어느 미리보기 그룹에 있는지. 그룹 제목은 section 안에 있다. */
async function groupOf(file) {
  const li = dialog().locator('li', { hasText: file }).first()
  const section = li.locator('xpath=ancestor::section[1]')
  const text = await section.innerText()
  for (const name of ['기존 폴더로 이동', '새 폴더 생성 후 이동', '미분류']) {
    if (text.startsWith(name)) return name
  }
  return `(모름: ${text.slice(0, 20)})`
}

/** 셀렉트에서 지금 고른 옵션의 보이는 문구. 라벨 검증은 여기서 한다. */
async function selectedLabel(file) {
  return destSelect(file).evaluate((el) => el.selectedOptions[0]?.textContent?.trim() ?? '')
}

async function openWith(files) {
  await page.goto('/')
  await page.getByRole('button', { name: '업로드' }).first().click()
  await dialog().waitFor({ state: 'visible' })
  await page.locator('input[type=file]').setInputFiles(files.map(filePath))
  await page.waitForTimeout(400)
}

async function closeDialog() {
  // 헤더의 X 도 aria-label 이 '닫기' 라 같이 잡힌다. 푸터가 뒤에 있으므로 last().
  await dialog()
    .getByRole('button', { name: /^(취소|닫기|완료)$/ })
    .last()
    .click()
  await dialog().waitFor({ state: 'hidden' }).catch(() => {})
}

/** 업로드가 끝날 때까지. 알림 경로까지 await 하므로 넉넉히 준다. */
async function startAndSettle() {
  await startBtn().click()
  await dialog()
    .getByText(/완료/)
    .first()
    .waitFor({ timeout: 60000 })
    .catch(() => {})
  await page.waitForTimeout(1500)
}

const before = await folderRows()
const beforePrint = fingerprint(before)
const 화면설계서 = findFolder(before, '화면설계서')
const 기능명세서 = findFolder(before, '기능명세서')

try {
  if (!화면설계서 || !기능명세서) throw new Error('선행 작업 미완: 화면설계서·기능명세서 루트가 필요하다')

  // 앞선 실행이 죽어 잔여물이 남았으면 여기서 멈춘다. 그대로 진행하면 "이미 있는 폴더"
  // 때문에 B1·B2·B5 가 무더기로 실패해 원인이 제품인지 오염인지 구분이 안 된다.
  const stale = before.filter((r) => r.parent !== null)
  if (stale.length) {
    throw new Error(
      `이전 실행의 잔여 하위 폴더가 남아 있다 — 지우고 다시 돌려라: ` +
        stale.map((r) => `${r.parent} > ${r.name}(문서 ${r.docs})`).join(', '),
    )
  }
  check(
    'B0',
    '선행 작업 — 화면설계서 별칭에 와이어프레임이 있다',
    화면설계서.aliases.includes('와이어프레임'),
    JSON.stringify(화면설계서.aliases),
  )

  // ── B1 경로 라벨. 2뎁스면 "카테고리 > 하위" 로 보여야 한다.
  await openWith([F_SUB])
  const b1Label = await selectedLabel(F_SUB)
  const b1Reason = await reasonOf(F_SUB)
  check('B1', '새 폴더 라벨이 경로로 보인다', b1Label.includes('화면설계서 > 마이페이지'), b1Label)
  check('B1r', '근거가 카테고리·하위 두 단계를 말한다',
        b1Reason === `'화면설계서' 일치 · 새 하위 폴더 제안`, b1Reason)
  check('B1g', '"새 폴더 생성 후 이동" 그룹에 있다',
        (await groupOf(F_SUB)) === '새 폴더 생성 후 이동', await groupOf(F_SUB))
  await page.screenshot({ path: `${SHOT}/FD2-B1.png` })

  // ── B2 실제로 2뎁스로 만들어지는가. 라벨이 맞아도 여기서 갈릴 수 있다 (JUDGE #29).
  await startAndSettle()
  await closeDialog()
  let rows = await folderRows()
  const 마이페이지 = findFolder(rows, '마이페이지', '화면설계서')
  check('B2', '화면설계서 밑에 마이페이지가 생긴다', Boolean(마이페이지),
        마이페이지 ? `parent=${마이페이지.parent}` : '없음')
  check('B2d', '그 폴더에 문서가 1건 들어갔다', 마이페이지?.docs === 1, `docs=${마이페이지?.docs}`)

  // ── B3 두 번째 파일은 새로 만들지 않고 그리로 붙는다.
  const foldersBeforeB3 = rows.length
  await openWith([F_SUB2])
  const b3Reason = await reasonOf(F_SUB2)
  check('B3', '기존 하위 폴더에 매칭된다',
        b3Reason === `'화면설계서' 일치 · 하위 '마이페이지' 일치`, b3Reason)
  check('B3g', '"기존 폴더로 이동" 그룹에 있다',
        (await groupOf(F_SUB2)) === '기존 폴더로 이동', await groupOf(F_SUB2))
  await startAndSettle()
  await closeDialog()
  rows = await folderRows()
  check('B3n', '폴더가 늘지 않았다', rows.length === foldersBeforeB3,
        `${foldersBeforeB3} → ${rows.length}`)
  check('B3d', '마이페이지 문서가 2건이 됐다',
        findFolder(rows, '마이페이지', '화면설계서')?.docs === 2,
        `docs=${findFolder(rows, '마이페이지', '화면설계서')?.docs}`)

  // ── B5 부모가 다른 동명. 흡수되면 안 된다 (@@unique([parentId, name]) 가 부모별이다).
  await openWith([F_FSPEC_MY])
  const b5Label = await selectedLabel(F_FSPEC_MY)
  check('B5', '기능명세서 밑 마이페이지로 제안된다', b5Label.includes('기능명세서 > 마이페이지'), b5Label)
  await startAndSettle()
  await closeDialog()
  rows = await folderRows()
  const 마이페이지들 = rows.filter((r) => r.name === '마이페이지')
  check('B5n', '마이페이지가 부모 다른 2개로 존재한다', 마이페이지들.length === 2,
        마이페이지들.map((r) => `${r.parent}/${r.name}`).join(', '))
  check('B5d', '화면설계서 밑 마이페이지의 문서 수는 그대로다',
        findFolder(rows, '마이페이지', '화면설계서')?.docs === 2,
        `docs=${findFolder(rows, '마이페이지', '화면설계서')?.docs}`)

  // ── B8 하위 이름이 안 잡히면 카테고리 루트로 간다.
  await openWith([F_FSPEC])
  const b8Reason = await reasonOf(F_FSPEC)
  check('B8', '하위 이름이 없으면 카테고리 루트로', b8Reason === `'기능명세서' 일치 · 하위 이름 없음`, b8Reason)
  check('B8g', '"기존 폴더로 이동" 그룹에 있다',
        (await groupOf(F_FSPEC)) === '기존 폴더로 이동', await groupOf(F_FSPEC))
  await closeDialog()

  // ── B9 별칭 경로. 0-① 이 끝나 있어야 성립한다.
  await openWith([F_ALIAS])
  const b9Label = await selectedLabel(F_ALIAS)
  const b9Reason = await reasonOf(F_ALIAS)
  check('B9', '별칭으로 카테고리를 찾고 하위를 제안한다',
        b9Label.includes('화면설계서 > 로그인 회원가입'), b9Label)
  check('B9r', '근거가 별칭 일치를 밝힌다',
        b9Reason === `별칭 '와이어프레임' 일치 · 새 하위 폴더 제안`, b9Reason)
  await page.screenshot({ path: `${SHOT}/FD2-B9.png` })
  await closeDialog()

  // ── B6 카테고리가 없으면 루트에 1뎁스로 제안한다 (경로 구분자가 없어야 한다).
  await openWith([F_IA])
  const b6Label = await selectedLabel(F_IA)
  const b6Reason = await reasonOf(F_IA)
  check('B6', '새 카테고리는 경로 없이 제안된다',
        b6Label.includes('IA 구조도') && !b6Label.includes('>'), b6Label)
  check('B6r', '근거가 새 폴더 제안이다', b6Reason === '맞는 폴더가 없어 새 폴더를 제안', b6Reason)
  await startAndSettle()
  await closeDialog()
  rows = await folderRows()
  const ia = findFolder(rows, 'IA 구조도')
  check('B6n', '루트에 생긴다 (부모 없음)', Boolean(ia) && ia.parent_id === null, ia ? `parent=${ia.parent}` : '없음')

  // ── B7 시작 직후 닫으면 방금 만든 하위 폴더는 사라지고 부모는 남는다.
  // S3 PUT 을 붙잡아 취소 창을 결정적으로 만든다. 안 그러면 업로드가 250ms 안에 끝나
  // 문서가 들어간 폴더가 되고, 그건 안 지워지는 것이 정상이라 테스트가 흔들린다.
  // 취소는 XHR 을 중단시킨다 — 그때 route 는 이미 처리된 상태다. 여기서 던지면
  // 핸들러가 try/finally 밖이라 uncaughtException 으로 프로세스가 죽고 **뒷정리가
  // 통째로 건너뛰어진다** (실제로 겪었다: dev DB 에 폴더 3개·문서 4건이 남았다).
  await page.route('**://*.amazonaws.com/**', async (route) => {
    try {
      await new Promise((r) => setTimeout(r, 5000))
      await route.continue()
    } catch {
      // 취소로 이미 처리된 라우트다. 무시한다.
    }
  })
  await openWith([F_CANCEL])
  acceptConfirm = true
  await startBtn().click()
  await page.waitForTimeout(400) // 폴더는 만들어지고 업로드는 아직인 창
  await dialog()
    .getByRole('button', { name: /업로드 취소하고 닫기|닫기/ })
    .click()
    .catch(() => {})
  await page.waitForTimeout(4000)
  acceptConfirm = false
  await page.unroute('**://*.amazonaws.com/**')
  rows = await folderRows()
  // 계약은 "폴더가 사라진다"가 아니라 "**빈** 자동 생성 폴더가 안 남는다"다
  // (upload-dialog.tsx:166). 취소가 늦어 문서가 들어갔다면 남는 것이 옳다.
  const 설정 = findFolder(rows, '설정', '화면설계서')
  check('B7', '취소하면 빈 하위 폴더가 남지 않는다', !설정 || 설정.docs > 0,
        설정 ? `설정 폴더가 문서 ${설정.docs}건으로 남았다` : '폴더 없음 (취소 정리됨)')
  check('B7c', '취소가 실제로 걸렸다 (안 걸리면 B7 은 공회전이다)', !설정,
        설정 ? '업로드가 먼저 끝나 취소 경로를 안 지났다' : '')
  check('B7p', '부모(화면설계서)는 남는다', Boolean(findFolder(rows, '화면설계서')))

  // ── B10 수동 모드 회귀. 파일이 앱 서버를 거치지 않는다는 불변식.
  s3Puts.length = 0
  await page.goto('/')
  await page.getByRole('button', { name: '업로드' }).first().click()
  await dialog().waitFor({ state: 'visible' })
  await page.locator('#upload-folder').selectOption(기능명세서.id)
  await page.locator('input[type=file]').setInputFiles([filePath(F_MANUAL)])
  await page.waitForTimeout(500)
  const manualHasPreview = await dialog().getByText('새 폴더 생성 후 이동').isVisible().catch(() => false)
  check('B10p', '수동 모드에는 미리보기가 없다', !manualHasPreview)
  await page.waitForTimeout(6000)
  check('B10', '브라우저가 S3 로 직접 PUT 한다', s3Puts.length >= 1, `PUT ${s3Puts.length}건`)
  await closeDialog()
} catch (err) {
  red(`\n스크립트가 중단됐다: ${err.message}`)
  FAIL++
} finally {
  // ── 뒷정리. 소급 이동의 기준선이 곧 이 DB 라 하나라도 새면 26행 대조가 어긋난다.
  const ids = await docsCreatedSince()
  for (const id of ids) await purgeDocument(id).catch(() => {})
  const purged = await purgeFolders(START)
  console.log(`\n뒷정리: 문서 ${ids.length}건, 폴더 ${purged.length}개 (${purged.join(', ')})`)

  const after = await folderRows()
  const same = fingerprint(after) === beforePrint
  check('Z', '폴더 트리가 실행 전과 같다', same,
        same ? '' : `\n--- 전 ---\n${beforePrint}\n--- 후 ---\n${fingerprint(after)}`)

  rmSync(TMP, { recursive: true, force: true })
  await browser.close()

  console.log(`\n${PASS} passed, ${FAIL} failed`)
  const failed = results.filter((r) => !r.ok)
  if (failed.length) console.log('실패:', failed.map((r) => r.id).join(', '))
  process.exit(FAIL ? 1 : 0)
}
