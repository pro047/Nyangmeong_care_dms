/**
 * 붙이기(업로드 때 기존 문서의 새 버전으로 올리기) 브라우저 검증.
 *
 * 전제: `npm run dev`(3002) + 실제 .env (dev 브랜치). 전용 폴더를 하나 만들어 쓰고 끝나면
 *       그 안의 문서·S3 객체를 전부 지운다.
 * 실행:  npm run test:e2e:attach
 *
 * **2026-09-22 에 통째로 다시 썼다.** 예전 판은 "후보가 있으면 항상 멈춰 묻고 기본값은 새
 * 문서"를 검사했는데, 팀원이 그 선택칸의 뜻을 몰라 같은 문서가 여러 건으로 쪼개졌다(운영
 * 13묶음). 지금은 확실한 경우(버전이 더 높음 · 같은 버전에 날짜가 같거나 늦음)는 묻지 않고
 * 붙이고, 후보가 여럿이면 가장 최신 문서에 붙는다. 판정 자체는 순수 함수라 vitest
 * (`attach-plan.test.ts`)가 덮는다 — 여기서 보는 것은 **그 판정이 실제로 서버 경로를
 * 가르는가**(문서 수와 버전 수)와 화면이 사람에게 무엇을 보여 주는가다.
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { APP, mintSession, cookieFor, purgeDocument, withDb } from './helpers.mjs'

const TMP = 'test/e2e/_files'
mkdirSync(TMP, { recursive: true })
const SHOT = 'test/e2e/shots'
mkdirSync(SHOT, { recursive: true })

/** 이 스위트가 끝까지 갔다면 나와야 할 검사 수. 중간에 죽으면 요약이 거짓말을 한다. */
const EXPECTED_CHECKS = 14
const results = []
const check = (id, desc, pass, detail = '') => {
  results.push({ id, desc, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${desc}${detail ? ` — ${detail}` : ''}`)
}

const FOLDER = `자동검증_자동버전_${Date.now()}`
const F1 = '자동검증_설계서_v0.3_20260901.html'
const F2 = '자동검증_설계서_v0.4_20260902.html' // higher version
const F3 = '자동검증_설계서_v0.4_20260903.html' // same version, later date
const F4 = '자동검증_설계서_v0.4_20260903.html' // same name again (same date)
const F5 = '자동검증_설계서_v0.2_20260904.html' // lower version
const F6 = '자동검증_설계서_v0.5_20260905.html' // multiple candidates
const F7a = '자동검증_설계서_v0.6_20260906.html'
const F7b = '자동검증_설계서_v0.7_20260907.html' // same batch clash
const F_OTHER = '자동검증_회의록_v0.2.html'

let seq = 0
const filePath = (name) => {
  // Same name twice must still be a different body (S3 key is per upload anyway).
  const dir = `${TMP}/${seq++}`
  mkdirSync(dir, { recursive: true })
  const p = `${dir}/${name}`
  writeFileSync(p, `<p>${name} #${seq}</p>`)
  return p
}

const token = (await mintSession()).token
const H = { 'Content-Type': 'application/json', Cookie: `dms_session=${token}` }
const folderRes = await fetch(`${APP}/api/folders`, {
  method: 'POST', headers: H, body: JSON.stringify({ name: FOLDER }),
})
if (!folderRes.ok) {
  console.error(`전제 불충족: 폴더 생성 ${folderRes.status}`)
  process.exit(2)
}
const folderId = (await folderRes.json()).id

const docsInFolder = () =>
  withDb(async (c) => {
    const { rows } = await c.query(
      `select d.id, d.title,
              (select count(*)::int from document_versions v where v.document_id = d.id) versions
         from documents d where d.folder_id = $1 order by d.created_at`,
      [folderId],
    )
    return rows
  })
const shape = (rows) => JSON.stringify(rows.map((r) => [r.title, r.versions]))

const browser = await chromium.launch()
const ctx = await browser.newContext({ baseURL: APP, viewport: { width: 1440, height: 900 } })
await ctx.addCookies([cookieFor(token)])
const page = await ctx.newPage()

const dialog = () => page.getByRole('dialog')
const attachSelect = (file) => page.getByLabel(`${file} 올리는 방식`)
const confirmBtn = () => dialog().getByRole('button', { name: '선택 확정하고 올리기' })

async function openWith(files) {
  await page.goto('/')
  await page.getByRole('button', { name: '업로드' }).first().click()
  await dialog().waitFor({ state: 'visible' })
  await page.getByLabel('저장할 폴더').selectOption(folderId)
  await page.locator('input[type=file]').setInputFiles(files.map(filePath))
  await page.waitForTimeout(500)
}
async function waitUploadSettled() {
  await dialog().getByText(/^완료 \d+건/).first().waitFor({ timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(1500)
}
async function closeDialog() {
  await dialog().getByRole('button', { name: /^(완료|닫기|취소)$/ }).last().click()
  await dialog().waitFor({ state: 'hidden' }).catch(() => {})
}

try {
  // A1 no candidate → new document, no question
  await openWith([F1])
  const asked1 = await attachSelect(F1).count()
  await waitUploadSettled()
  let rows = await docsInFolder()
  check('A1', '후보가 없으면 묻지 않고 새 문서', asked1 === 0 && rows.length === 1, `선택칸=${asked1} ${shape(rows)}`)
  await closeDialog()

  // A2 higher version → auto attach, unrelated file stays a new document
  await openWith([F2, F_OTHER])
  const asked2 = await attachSelect(F2).count()
  await waitUploadSettled()
  const label2 = await dialog().getByText(`‘${F1}’ 의 새 버전으로 올렸습니다`).count()
  rows = await docsInFolder()
  const main = () => rows.find((r) => r.title.startsWith('자동검증_설계서'))
  check('A2', '버전이 더 높으면 묻지 않고 새 버전이 된다',
    asked2 === 0 && rows.length === 2 && main()?.versions === 2, `선택칸=${asked2} ${shape(rows)}`)
  check('A3', '자동으로 붙은 행에 어디에 붙었는지 문구가 뜬다', label2 === 1, `문구=${label2}`)
  await page.screenshot({ path: `${SHOT}/ATTACH-auto.png` })
  await closeDialog()

  // A4 same version, later date → auto
  await openWith([F3])
  const asked3 = await attachSelect(F3).count()
  await waitUploadSettled()
  rows = await docsInFolder()
  check('A4', '같은 버전·더 늦은 날짜도 자동으로 새 버전', asked3 === 0 && main()?.versions === 3, `선택칸=${asked3} ${shape(rows)}`)
  await closeDialog()

  // A5 same file name again (same version, same date) → auto (later upload wins)
  await openWith([F4])
  const asked4 = await attachSelect(F4).count()
  await waitUploadSettled()
  rows = await docsInFolder()
  check('A5', '같은 버전·같은 날짜(같은 이름 재업로드)도 자동', asked4 === 0 && main()?.versions === 4, `선택칸=${asked4} ${shape(rows)}`)
  await closeDialog()

  // A6 lower version → ask, blocked until chosen
  await openWith([F5])
  const sel5 = attachSelect(F5)
  const asked5 = await sel5.count()
  const value5 = asked5 ? await sel5.inputValue() : 'N/A'
  const disabledBefore = await confirmBtn().isDisabled()
  const footer5 = await dialog().getByText('1건은 새 문서인지 기존 문서의 새 버전인지 골라 주세요').count()
  await page.screenshot({ path: `${SHOT}/ATTACH-ask.png` })
  check('A6', '더 낮은 버전은 묻고, 고르기 전엔 버튼이 막힌다',
    asked5 === 1 && value5 === '' && disabledBefore && footer5 === 1,
    `선택칸=${asked5} 값="${value5}" 버튼막힘=${disabledBefore} 안내=${footer5}`)

  // 후보는 제목이 아니라 **파일명**으로 말한다 — 제목은 사람이 고칠 수 있어 파일과 어긋난다.
  const optionText = (await sel5.locator('option').allInnerTexts()).map((t) => t.trim())
  check('A6b', '후보 옵션이 기존 문서의 최신 파일명을 말한다',
    optionText.includes(`‘${F4}’ 의 새 버전으로 올리기`), `옵션=${JSON.stringify(optionText)}`)

  // 낮은 버전을 붙이려 하면 두 버전을 짚어 경고한다. 이 사고는 앱 어디에도 에러가 안 난다.
  await sel5.selectOption({ label: `‘${F4}’ 의 새 버전으로 올리기` })
  await page.waitForTimeout(200)
  const danger = await dialog().getByText(/현재 버전 v0\.4 보다 낮은 v0\.2 입니다/).count()
  check('A6c', '낮은 버전을 붙이려 하면 두 버전을 짚어 경고한다', danger === 1, `경고=${danger}`)

  // choose "새 문서" → second document with the same key (sets up multiple candidates)
  await sel5.selectOption({ label: '새 문서로 올리기' })
  const enabledAfter = await confirmBtn().isEnabled()
  await confirmBtn().click()
  await waitUploadSettled()
  rows = await docsInFolder()
  const sameKey = rows.filter((r) => r.title.startsWith('자동검증_설계서'))
  check('A7', '"새 문서"를 고르면 버튼이 풀리고 새 문서로 올라간다',
    enabledAfter && sameKey.length === 2, `버튼=${enabledAfter} ${shape(rows)}`)
  await closeDialog()

  // A8 multiple candidates → attach to the newest one (v0.4 doc, not v0.2 doc)
  await openWith([F6])
  const asked6 = await attachSelect(F6).count()
  await waitUploadSettled()
  rows = await docsInFolder()
  const v04doc = rows.find((r) => r.versions >= 4)
  const v02doc = rows.find((r) => r.title.includes('v0.2_20260904'))
  check('A8', '후보가 여럿이면 가장 최신 문서에 붙는다',
    asked6 === 0 && rows.length === 3 && v04doc?.versions === 5 && v02doc?.versions === 1,
    `선택칸=${asked6} ${shape(rows)}`)
  await closeDialog()

  // A9 same-document files in one batch → both ask
  await openWith([F7a, F7b])
  const asked7 = (await attachSelect(F7a).count()) + (await attachSelect(F7b).count())
  const footer7 = await dialog().getByText('2건은 새 문서인지 기존 문서의 새 버전인지 골라 주세요').count()
  check('A9', '같은 문서의 파일을 한 번에 담으면 둘 다 묻는다', asked7 === 2 && footer7 === 1, `선택칸=${asked7} 안내=${footer7}`)
  await closeDialog()
  rows = await docsInFolder()

  // A10 list: newest-activity doc is on top, header "최근 업로드", date "방금"
  await page.goto('/')
  await page.waitForTimeout(800)
  const header = await page.getByRole('columnheader', { name: '최근 업로드' }).count()
  const titles = await page.locator('tbody tr').allInnerTexts()
  const firstIdx = titles.findIndex((t) => t.includes('자동검증_'))
  const first = titles[firstIdx] ?? ''
  await page.screenshot({ path: `${SHOT}/ATTACH-list.png` })
  check('A10', '목록 맨 위가 방금 새 버전을 받은 문서이고 날짜가 "방금"이다',
    header === 1 && firstIdx === 0 && first.includes('v0.5_20260905') && first.includes('방금'),
    `헤더=${header} 첫 자동검증 행 index=${firstIdx} 내용=${JSON.stringify(first.replace(/\s+/g, ' ').slice(0, 90))} 파일 중 문서=${shape(rows)}`)

  // A11·A12 자동 분류 모드에서 제안 폴더 이름을 **기존 폴더 이름으로 고치면** 시작 시점에 그
  // 폴더로 흡수된다. 미리보기도 같은 폴더로 후보를 봐야 한다 — 안 그러면 셀렉트 없이 시작돼
  // 사람이 본 적 없는 선택으로 붙는다(2026-09-22 코드 리뷰가 찾은 회귀).
  const F_AUTO = '자동검증_설계서_v0.6_20260910.html'
  const target = rows.find((r) => r.title.startsWith('자동검증_설계서_v0.5'))
  await page.goto('/')
  await page.getByRole('button', { name: '업로드' }).first().click()
  await dialog().waitFor({ state: 'visible' })
  await page.getByLabel('저장할 폴더').selectOption('__auto__')
  await page.locator('input[type=file]').setInputFiles([filePath(F_AUTO)])
  await page.waitForTimeout(500)
  await page.getByLabel(`${F_AUTO} 새 폴더 이름`).fill(FOLDER)
  await page.waitForTimeout(300)
  const autoSel = attachSelect(F_AUTO)
  const shown = await autoSel.count()
  const preselected = shown ? await autoSel.inputValue() : 'N/A'
  check('A11', '제안 폴더 이름을 기존 폴더로 고치면 그 폴더의 후보가 미리 선택돼 보인다',
    shown === 1 && preselected === target?.id, `선택칸=${shown} 값=${preselected} 대상=${target?.id}`)

  const since = new Date()
  await dialog().getByRole('button', { name: '업로드 시작' }).click()
  await waitUploadSettled()
  rows = await docsInFolder()
  const createdFolders = await withDb(async (c) => (await c.query(
    `select name from folders where created_at >= $1::timestamp`, [since.toISOString()])).rows)
  check('A12', '시작하면 그 문서의 새 버전이 되고 새 폴더는 안 생긴다',
    rows.find((r) => r.id === target?.id)?.versions === 6 && createdFolders.length === 0,
    `${shape(rows)} 새 폴더=${JSON.stringify(createdFolders)}`)
  await closeDialog()
} finally {
  await browser.close()
  let objects = 0
  for (const row of await docsInFolder()) objects += (await purgeDocument(row.id)).length
  await fetch(`${APP}/api/folders/${folderId}`, { method: 'DELETE', headers: H }).catch(() => null)
  rmSync(TMP, { recursive: true, force: true })
  console.log(`\n정리: 폴더 '${FOLDER}' + 문서 전부 + S3 객체 ${objects}개`)
  const pass = results.filter((r) => r.pass).length
  const missing = EXPECTED_CHECKS - results.length
  if (missing > 0) console.log(`!! 검사 ${missing}건이 실행되지 않았다`)
  console.log(`===== ${pass}/${EXPECTED_CHECKS} PASS =====`)
  process.exitCode = pass === EXPECTED_CHECKS ? 0 : 1
}
