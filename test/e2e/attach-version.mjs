/**
 * 붙이기 기능(업로드 때 "새 판으로 붙일까, 새 문서로 올릴까") 브라우저 검증.
 *
 * 전제: `npm run dev`(3002) + 실제 .env (dev 브랜치). 전용 폴더를 하나 만들어 쓰므로
 *       기존 데이터에 의존하지 않는다.
 * 실행:  node --env-file=.env test/e2e/attach-version.mjs
 *
 * 여기서만 볼 수 있는 것을 담는다 — 판정 자체(같은 문서인가·판번호 비교)는 순수 함수라
 * vitest 가 덮는다. 이 파일이 보는 것은 **선택이 실제로 서버 경로를 가르는가**다:
 * 붙이기를 고르면 문서가 안 늘고 버전 행만 는다.
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { APP, mintSession, cookieFor, purgeDocument, withDb } from './helpers.mjs'

const TMP = 'test/e2e/_files'
mkdirSync(TMP, { recursive: true })
const SHOT = 'test/e2e/shots'
mkdirSync(SHOT, { recursive: true })

/** 이 스위트가 끝까지 갔다면 나와야 할 검사 수. 중간에 죽으면 요약이 거짓말을 한다. */
const EXPECTED_CHECKS = 7

const results = []
const check = (id, desc, pass, detail = '') => {
  results.push({ id, desc, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${desc}${detail ? ` — ${detail}` : ''}`)
}

const FOLDER = `자동검증_붙이기_${Date.now()}`
const F_BASE = '자동검증_설계서_v0.3.html'
const F_NEXT = '자동검증_설계서_v0.6.html'
const F_OLD = '자동검증_설계서_v0.1.html'
/** 같은 폴더에 있어도 키가 달라 후보가 되면 안 되는 파일. C2 의 대조군이다. */
const F_OTHER = '자동검증_회의록_v0.2.html'

const filePath = (name) => {
  const p = `${TMP}/${name}`
  writeFileSync(p, `<p>${name}</p>`)
  return p
}

const token = (await mintSession()).token
const H = { 'Content-Type': 'application/json', Cookie: `dms_session=${token}` }

const folderRes = await fetch(`${APP}/api/folders`, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({ name: FOLDER }),
})
if (!folderRes.ok) {
  console.error(`전제 불충족: 폴더 생성 ${folderRes.status} — 제품 결함이 아니라 픽스처 문제다.`)
  rmSync(TMP, { recursive: true, force: true })
  process.exit(2)
}
const folderId = (await folderRes.json()).id

/** 이 폴더의 문서와 버전 수. 붙이기가 됐는지는 이 두 수의 관계로만 판정한다. */
const docsInFolder = () =>
  withDb(async (c) => {
    const { rows } = await c.query(
      `select d.id, d.title,
              (select count(*)::int from document_versions v where v.document_id = d.id) versions,
              (select max(v.version_no) from document_versions v where v.document_id = d.id) latest
         from documents d
        where d.folder_id = $1
        order by d.created_at`,
      [folderId],
    )
    return rows
  })

const browser = await chromium.launch()
const ctx = await browser.newContext({ baseURL: APP, viewport: { width: 1440, height: 780 } })
await ctx.addCookies([cookieFor(token)])
const page = await ctx.newPage()

const dialog = () => page.getByRole('dialog')
const modeSelect = () => page.getByLabel('저장할 폴더')
const attachSelect = (file) => page.getByLabel(`${file} 올리는 방식`)
const confirmBtn = () => dialog().getByRole('button', { name: '선택 확정하고 올리기' })

/** 다이얼로그를 열고 이 스위트의 폴더를 고른 뒤 파일을 담는다. 셀렉트는 담기 전에만 열린다. */
async function openWith(files) {
  await page.goto('/')
  await page.getByRole('button', { name: '업로드' }).first().click()
  await dialog().waitFor({ state: 'visible' })
  await modeSelect().selectOption(folderId)
  await page.locator('input[type=file]').setInputFiles(files.map(filePath))
  await page.waitForTimeout(400)
}

/** 업로드가 끝날 때까지 기다린다. 알림(디스코드)까지 await 하는 경로라 넉넉히 준다. */
async function waitUploadSettled() {
  await dialog()
    .getByText(/^완료 \d+건/)
    .first()
    .waitFor({ timeout: 60000 })
    .catch(() => {})
  await page.waitForTimeout(1500)
}

try {
  // ── C1 후보가 없으면 지금까지처럼 담는 즉시 올라간다 (클릭이 안 늘어난다)
  await openWith([F_BASE])
  const askedOnFirst = await attachSelect(F_BASE).count()
  await waitUploadSettled()
  const afterFirst = await docsInFolder()
  check('C1', '후보가 없으면 묻지 않고 바로 올라간다',
        askedOnFirst === 0 && afterFirst.length === 1,
        `선택칸=${askedOnFirst} 문서=${afterFirst.length}`)
  await dialog().getByRole('button', { name: '완료' }).click()

  // ── C2 같은 문서의 다음 판을 담으면 멈추고 묻는다. 다른 문서는 안 멈춘다.
  await openWith([F_NEXT, F_OTHER])
  const asked = await attachSelect(F_NEXT).count()
  const notAsked = await attachSelect(F_OTHER).count()
  const chosen = await attachSelect(F_NEXT).inputValue()
  check('C2', '후보가 있는 건만 멈춰 묻고, 기본값은 새 문서다',
        asked === 1 && notAsked === 0 && chosen === '',
        `후보건 선택칸=${asked} 무관건 선택칸=${notAsked} 기본값="${chosen}"`)

  // ── C3 후보를 **파일명**으로 말한다 (제목은 사람이 고칠 수 있어 파일과 어긋난다)
  const optionText = (await attachSelect(F_NEXT).locator('option').allInnerTexts())
    .map((t) => t.trim())
  check('C3', '후보 옵션이 기존 판의 파일명을 말한다',
        optionText.includes(`‘${F_BASE}’ 의 새 판으로 붙이기`),
        `옵션=${JSON.stringify(optionText)}`)

  // ── C4 더 높은 판을 붙일 때는 경고가 없다
  const options = await attachSelect(F_NEXT).locator('option').all()
  const targetValue = await options[1].getAttribute('value')
  await attachSelect(F_NEXT).selectOption(targetValue)
  await page.waitForTimeout(200)
  const warned = await dialog().getByText(/보다 낮은|같은 v|판번호를 읽을 수 없어/).count()
  check('C4', 'v0.3 → v0.6 은 판번호 경고가 없다', warned === 0, `경고=${warned}`)
  await page.screenshot({ path: `${SHOT}/ATTACH-choice.png` })

  // ── C5 붙이기를 고르면 문서가 안 늘고 버전만 는다 (이 기능의 존재 이유)
  await confirmBtn().click()
  await waitUploadSettled()
  const afterAttach = await docsInFolder()
  const attached = afterAttach.find((r) => r.versions === 2)
  check('C5', '붙이면 새 문서가 안 생기고 버전이 2가 된다',
        afterAttach.length === 2 && attached !== undefined && attached.latest === 2,
        `문서=${JSON.stringify(afterAttach.map((r) => [r.title, r.versions]))}`)

  // ── C6 낮은 판을 붙이려 하면 빨간 경고가 뜬다. 이 사고는 앱 어디에도 에러가 안 난다.
  await dialog().getByRole('button', { name: '완료' }).click()
  await openWith([F_OLD])
  const oldOptions = await attachSelect(F_OLD).locator('option').all()
  await attachSelect(F_OLD).selectOption(await oldOptions[1].getAttribute('value'))
  await page.waitForTimeout(200)
  const danger = dialog().getByText(/현재 판 v0\.6 보다 낮은 v0\.1 입니다/)
  check('C6', '낮은 판을 붙이려 하면 두 판을 짚어 경고한다', (await danger.count()) === 1,
        `경고=${(await danger.count())}`)
  await page.screenshot({ path: `${SHOT}/ATTACH-warning.png` })

  // ── C7 경고는 막지 않는다. 기본값이 안전한 쪽이므로 여기까지 온 것은 사람의 선택이다.
  const canProceed = await confirmBtn().isEnabled()
  await confirmBtn().click()
  await waitUploadSettled()
  const afterOld = await docsInFolder()
  const grown = afterOld.find((r) => r.versions === 3)
  check('C7', '경고가 떠도 붙일 수 있다 (판단은 사람이 한다)',
        canProceed && afterOld.length === 2 && grown?.latest === 3,
        `버튼=${canProceed} 문서=${JSON.stringify(afterOld.map((r) => [r.title, r.versions]))}`)
} finally {
  await browser.close()

  let objects = 0
  for (const row of await docsInFolder()) objects += (await purgeDocument(row.id)).length
  await fetch(`${APP}/api/folders/${folderId}`, { method: 'DELETE', headers: H }).catch(() => null)
  rmSync(TMP, { recursive: true, force: true })
  console.log(`\n정리: 폴더 '${FOLDER}' + 그 안의 문서 전부 + S3 객체 ${objects}개`)

  const pass = results.filter((r) => r.pass).length
  const missing = EXPECTED_CHECKS - results.length
  if (missing > 0) console.log(`!! 검사 ${missing}건이 실행되지 않았다 — 중간에 죽었다는 뜻이다.`)
  console.log(`===== ${pass}/${EXPECTED_CHECKS} PASS =====`)
  process.exitCode = pass === EXPECTED_CHECKS ? 0 : 1
}
