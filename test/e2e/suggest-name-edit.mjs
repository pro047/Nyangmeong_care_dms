/**
 * 0-1(제안 폴더 이름 편집) 브라우저 검증. 원본 VERIFY.md §5 는 Windows worktree 에만
 * 있어 복구할 수 없다 — `8e3ef4b` 의 코드와 커밋 메시지에서 역산한 재구성본이다.
 *
 * 전제: `npm run dev`(3002) + 실제 .env (dev 브랜치). 개발 DB 는 Neon 이라 터널이 없다.
 *       DB 에 `화면설계서` 폴더가 **정확히 하나** 있어야 한다 (A5·B2 의 흡수 대상).
 * 실행:  node --env-file=.env test/e2e/suggest-name-edit.mjs
 *
 * 판정이 문자열 매칭으로 되는 것만 담는다. 제안 이름의 **적절성**과 첫 화면 인상은
 * 사람 눈이어야 하므로 여기 없다 (HANDOFF "실측 방법" 절).
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { APP, mintSession, cookieFor, purgeDocument, purgeFolders, withDb } from './helpers.mjs'

const SHOT = 'test/e2e/shots'
mkdirSync(SHOT, { recursive: true })
const TMP = 'test/e2e/_files'
mkdirSync(TMP, { recursive: true })

// 뒷정리 기준점. 이 시각 이후에 생긴 폴더만 지운다.
const startedAt = new Date()

/** 이 스위트가 끝까지 갔다면 나와야 할 검사 수. 중간에 죽으면 요약이 거짓말을 한다. */
const EXPECTED_CHECKS = 11

const results = []
const check = (id, desc, pass, detail = '') => {
  results.push({ id, desc, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${desc}${detail ? ` — ${detail}` : ''}`)
}

/** 기존 폴더 어느 것도 파일명에 통째로 들어 있지 않아야 제안 그룹으로 온다. */
const F_NEW = '07_회의록_2026_08_27.html'
const F_CODE = '08_점검항목_HLT.html'
const EDITED = '자동검증_임시폴더'
const ABSORB = '화면설계서'
/** 스크롤을 넘겨야 "첫 화면에 몇 행"이 의미를 갖는다. 8건이면 어떤 화면에도 안 들어간다. */
const F_MANY = Array.from({ length: 8 }, (_, i) => `자동검증_배분측정_${i + 1}.html`)

/** 문서 제목은 확장자를 뗀 파일명이다 (upload-dialog 의 titleFromFileName). */
const titleOf = (fileName) => fileName.slice(0, fileName.lastIndexOf('.'))
const OUR_TITLES = [F_NEW, F_CODE, ...F_MANY].map(titleOf)

const filePath = (name) => {
  const p = `${TMP}/${name}`
  writeFileSync(p, `<p>${name}</p>`)
  return p
}

/**
 * 이 스위트가 만든 문서만 고른다. 시각만으로 고르면 실행 중에 남이 올린 문서까지
 * 긁어 오고, purgeDocument 는 **소프트 삭제가 아니라 행 + S3 객체 하드 삭제**라
 * 되돌릴 수 없다. 제목(=고정된 픽스처 파일명)으로 신원을 확인한 뒤 시각으로 좁힌다.
 */
const ourDocuments = () =>
  withDb(async (c) => {
    const { rows } = await c.query(
      `select d.id, d.title, f.name folder
         from documents d left join folders f on f.id = d.folder_id
        where d.title = any($1) and d.created_at >= $2::timestamp
        order by d.created_at`,
      [OUR_TITLES, startedAt.toISOString()],
    )
    return rows
  })

const preconditionFailed = await withDb(async (c) => {
  const { rows } = await c.query('select count(*)::int n from folders where name = $1', [ABSORB])
  return rows[0].n === 1 ? null : `'${ABSORB}' 폴더가 ${rows[0].n}개다 (1개여야 함)`
})
if (preconditionFailed) {
  console.error(`전제 불충족: ${preconditionFailed} — 제품 결함이 아니라 픽스처 문제다.`)
  rmSync(TMP, { recursive: true, force: true })
  process.exit(2)
}

const token = (await mintSession()).token
const browser = await chromium.launch()
// 첫 화면 배분 측정은 노트북 기준이다 — HANDOFF 이 2.4행을 잰 것과 같은 뷰포트.
const ctx = await browser.newContext({ baseURL: APP, viewport: { width: 1440, height: 780 } })
await ctx.addCookies([cookieFor(token)])
const page = await ctx.newPage()

const dialog = () => page.getByRole('dialog')
const nameInput = (file) => page.getByLabel(`${file} 새 폴더 이름`)
const destSelect = (file) => page.getByLabel(`${file} 저장할 폴더`)
const startBtn = () => dialog().getByRole('button', { name: '업로드 시작' })

/** 업로드 다이얼로그를 열고 파일을 담는다. 드롭존은 숨은 input 을 여는 것뿐이다. */
async function openWith(files) {
  await page.goto('/')
  await page.getByRole('button', { name: '업로드' }).first().click()
  await dialog().waitFor({ state: 'visible' })
  await page.locator('input[type=file]').setInputFiles(files.map(filePath))
  await page.waitForTimeout(300)
}

/** 업로드가 끝날 때까지 기다린다. 알림(디스코드)까지 await 하는 경로라 넉넉히 준다. */
async function waitUploadSettled() {
  await dialog()
    .getByText(/완료|업로드 완료/)
    .first()
    .waitFor({ timeout: 60000 })
    .catch(() => {})
  await page.waitForTimeout(2000)
}

const createdDocs = []

try {
  // ── A8 첫 화면에 판단 대상이 몇 행 보이는가 (기준선 2.4행)
  // 스크롤을 넘긴 상태에서만 유효하다 — 내용이 적으면 flex-1 스크롤러가 뷰포트가 아니라
  // 내용 크기로 줄어들어 "행이 몇 개 들어가는가"가 아닌 값이 나온다.
  await openWith(F_MANY)
  const scroller = dialog().locator('div.overflow-y-auto')
  const rowBox = await dialog().locator('section ul > li').first().boundingBox()
  const scrollBox = await scroller.boundingBox()
  const overflowing = await scroller.evaluate((el) => el.scrollHeight > el.clientHeight + 1)
  const visibleRows = rowBox && scrollBox ? scrollBox.height / rowBox.height : 0
  check('A8', '미리보기 첫 화면 행 수 (측정값, 기준선 2.4)', overflowing,
        `${visibleRows.toFixed(1)}행 (행 ${rowBox?.height.toFixed(0)}px / 영역 ${scrollBox?.height.toFixed(0)}px, 넘침=${overflowing})`)

  // 아무것도 만들지 않은 채 닫는다 — 업로드 시작 전이라 부작용이 없다.
  await dialog().getByRole('button', { name: '취소' }).click()

  // ── A1 제안 행에 이름 편집칸이 뜬다
  await openWith([F_NEW])
  const editor = nameInput(F_NEW)
  const proposed = await editor.inputValue().catch(() => null)
  check('A1', '제안 행에 이름 편집칸 + 제안 이름이 채워져 있다',
        proposed !== null && proposed.trim() !== '', `제안="${proposed}"`)

  // ── A9 그룹 요약이 스크롤 영역 밖에 있다
  const summary = dialog().getByText(/^기존 \d+ · 새 폴더 \d+ · 미분류 \d+$/)
  const summaryInScroller = await scroller.getByText(/^기존 \d+ · 새 폴더/).count()
  check('A9', '그룹 요약이 뜨고 스크롤 영역 밖이다',
        (await summary.count()) === 1 && summaryInScroller === 0,
        `요약=${await summary.count()} 스크롤안=${summaryInScroller}`)

  // ── A6 빈 이름이면 시작이 잠긴다
  await editor.fill('')
  await page.waitForTimeout(150)
  const blocked = await startBtn().isDisabled()
  const warn = await dialog().getByText('새 폴더 이름 1건을 고쳐야 시작할 수 있습니다').count()
  check('A6', '빈 이름 → 시작 버튼 잠김 + 경고 문구', blocked && warn === 1,
        `disabled=${blocked} 문구=${warn}`)

  // ── A7 100자에서 잘린다. 101자로는 저장을 시도조차 못 한다.
  // folderNameError 의 101자 분기 자체는 folder.test.ts:105 가 덮는다. 여기서 보는 것은
  // **화면이 그 분기에 도달하지 못하게 먼저 막는가**이고, 그 수단이 maxLength 다.
  await editor.fill('가'.repeat(101))
  await page.waitForTimeout(150)
  const len = (await editor.inputValue()).length
  const tooLong = await dialog().getByText('폴더 이름은 100자까지입니다.').count()
  check('A7', '101자 입력 → 100자로 잘리고 오류 문구가 필요 없다',
        len === 100 && tooLong === 0, `입력길이=${len} 오류문구=${tooLong}`)

  // ── A5 기존 폴더명과 같아지면 흡수 힌트가 뜬다
  await editor.fill(ABSORB)
  await page.waitForTimeout(150)
  const hint = await dialog().getByText(`기존 폴더 ‘${ABSORB}’와 같아 그 폴더로 들어갑니다`).count()
  const stillInNew = await destSelect(F_NEW).isVisible()
  check('A5', '기존 폴더명 입력 → 흡수 힌트, 행은 그대로 (포커스 유지)',
        hint === 1 && stillInNew, `힌트=${hint}`)

  // ── A3 셀렉트 라벨이 편집한 이름을 따라간다 (같은 행이 두 이름을 말하면 안 된다)
  await editor.fill(EDITED)
  await page.waitForTimeout(150)
  const label = (await destSelect(F_NEW).locator('option:checked').innerText()).trim()
  check('A3', '셀렉트 라벨이 편집한 이름을 따라간다',
        label === `새 폴더 ‘${EDITED}’`, `라벨="${label}"`)

  // ── A4 이름을 고치면 "만들지 않음" 이 덮지 않는다 (destTouched)
  await dialog().getByRole('checkbox').check()
  await page.waitForTimeout(150)
  const survives = await nameInput(F_NEW).count()
  check('A4', '고친 행은 "만들지 않음" 체크가 덮지 않는다', survives === 1,
        `체크 후 편집칸=${survives}`)
  await dialog().getByRole('checkbox').uncheck()

  // ── A2 끝에 붙은 영문 코드가 제안에서 떨어진다
  await page.locator('input[type=file]').setInputFiles([filePath(F_CODE)])
  await page.waitForTimeout(300)
  const codeName = await nameInput(F_CODE).inputValue().catch(() => '(제안 아님)')
  check('A2', '끝의 영문 대문자 코드가 제안 이름에서 떨어진다',
        !codeName.includes('HLT') && codeName.trim() !== '', `제안="${codeName}"`)
  await page.screenshot({ path: `${SHOT}/SNE-preview.png` })

  // ── B1 고친 이름으로 폴더가 생기고 문서가 그 안에 들어간다
  await nameInput(F_CODE).fill(EDITED)
  await page.waitForTimeout(150)
  await startBtn().click()
  await waitUploadSettled()

  const placed = await ourDocuments()
  placed.forEach((r) => createdDocs.push(r.id))
  const inEdited = placed.filter((r) => r.folder === EDITED).length
  check('B1', `고친 이름 '${EDITED}' 폴더가 생기고 문서가 들어간다`, inEdited === 2,
        `배치=${JSON.stringify(placed.map((r) => [r.title, r.folder]))}`)

  // ── B2 기존 폴더명으로 고치면 새 폴더를 만들지 않고 흡수한다
  await openWith([F_NEW])
  await nameInput(F_NEW).fill(ABSORB)
  await page.waitForTimeout(200)
  await startBtn().click()
  await waitUploadSettled()

  const after = await ourDocuments()
  after.forEach((r) => !createdDocs.includes(r.id) && createdDocs.push(r.id))
  const dupCount = await withDb(async (c) =>
    (await c.query('select count(*)::int n from folders where name = $1', [ABSORB])).rows[0].n,
  )
  // B1 이 올린 것과 같은 제목이 두 건이 되므로 이번 회차 것은 가장 나중 행이다.
  const absorbed = after.filter((r) => r.title === titleOf(F_NEW)).at(-1)
  check('B2', '기존 폴더명으로 고치면 중복 폴더 없이 그리로 들어간다',
        dupCount === 1 && absorbed?.folder === ABSORB,
        `${ABSORB} 폴더 수=${dupCount} 배정=${absorbed?.folder}`)
} finally {
  await browser.close()
  let objects = 0
  for (const id of [...new Set(createdDocs)]) objects += (await purgeDocument(id)).length
  const folders = await purgeFolders(startedAt)
  rmSync(TMP, { recursive: true, force: true })
  console.log(`\n정리: 문서 ${createdDocs.length}건 + S3 객체 ${objects}개 + 폴더 ${folders.length}개 (${folders.join(', ')})`)

  const pass = results.filter((r) => r.pass).length
  const missing = EXPECTED_CHECKS - results.length
  if (missing > 0) console.log(`!! 검사 ${missing}건이 실행되지 않았다 — 중간에 죽었다는 뜻이다.`)
  console.log(`===== ${pass}/${EXPECTED_CHECKS} PASS =====`)
  process.exitCode = pass === EXPECTED_CHECKS ? 0 : 1
}
