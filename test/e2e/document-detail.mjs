/**
 * M3 상세 페이지 브라우저 검증. DESIGN.md §7.2 의 B1~B9 를 자동화한 것이다.
 *
 * 전제: SSH 터널(15432) + `npm run dev`(3002) + 실제 .env.
 * 실행:  node --env-file=.env test/e2e/document-detail.mjs
 *
 * 디스코드 로그인은 자동화하지 않는다 — helpers.mintSession 이 세션 쿠키를 직접 서명한다.
 * 문서는 매번 새로 만들고 끝나면 행·S3 객체까지 지운다(purgeDocument).
 */
import { chromium } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'
import { APP, mintSession, cookieFor, seedDocument, purgeDocument } from './helpers.mjs'

const SHOT = 'test/e2e/shots'
mkdirSync(SHOT, { recursive: true })
const TMP = 'test/e2e/shots/_v2.txt'

const results = []
const check = (id, desc, pass, detail = '') => {
  results.push({ id, desc, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${desc}${detail ? ' — ' + detail : ''}`)
}

const { token } = await mintSession()
const DOC = await seedDocument(token, {
  title: '자동검증 테스트 문서',
  fileName: '자동검증-v1.txt',
  body: Buffer.from('v1 자동 검증용 파일\n', 'utf8'),
})
console.log(`seed: ${DOC}`)

const browser = await chromium.launch()
const ctx = await browser.newContext({ baseURL: APP })
await ctx.addCookies([cookieFor(token)])
const page = await ctx.newPage()
const api = ctx.request
// 삭제 확인은 더 이상 window.confirm 이 아니다 — UI 정비에서 AlertDialog 로 바뀌었다.
// 브라우저 대화상자가 아니라 화면의 일부라 page.on('dialog') 로는 안 잡힌다. B6 이 직접 누른다.

// presign 이 내준 키를 전부 기록한다. B9 는 PUT 까지 성공하고 POST 가 404 로 막히므로
// DB 행이 없는 객체가 남는데, 앱 IAM 에 s3:ListBucket 이 없어 **나중에는 찾을 수 없다.**
// 만든 쪽이 그 자리에서 들고 있다가 지우는 것이 유일한 방법이다.
const presignedKeys = []
page.on('response', async (res) => {
  if (!res.url().endsWith('/api/documents/presign') || !res.ok()) return
  await res.json().then((b) => b.key && presignedKeys.push(b.key)).catch(() => {})
})

/** 타임라인 행을 "v2최신…" 같은 원문 그대로 받는다. 버전 셀에는 배지가 붙어 exact 매칭이 안 된다. */
const timeline = () => page.locator('tbody tr').allInnerTexts()

/**
 * not-found 본문이 뜰 때까지 기다린다. count() 는 기다리지 않는데 RSC 는 뼈대(헤더·사이드바)를
 * 먼저 흘려보내고 본문을 나중에 붙이므로, 즉시 세면 회차마다 결과가 갈린다.
 */
const notFoundShown = () =>
  page
    .getByText('문서를 찾을 수 없습니다')
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false)

try {
  // ── B1 목록 → 상세
  await page.goto('/')
  await page.getByRole('link', { name: /자동검증 테스트 문서/ }).first().click()
  await page.waitForURL(`**/documents/${DOC}`)
  let rows = await timeline()
  await page.screenshot({ path: `${SHOT}/B1-detail.png`, fullPage: true })
  check('B1', '목록 제목 클릭 → 상세, 타임라인에 v1', rows.some((r) => r.startsWith('v1')), `행수=${rows.length}`)

  // ── B8 없는 id → not-found (앱 셸 유지)
  await page.goto('/documents/does-not-exist-xyz')
  const nf = await notFoundShown()
  const shell = await page.getByRole('link', { name: '전체 문서' }).count()
  check('B8', '없는 id → not-found, 헤더·사이드바 유지', nf && shell > 0, `문구=${nf} 셸=${shell}`)

  // ── B5 제목·설명 수정
  await page.goto(`/documents/${DOC}`)
  await page.getByRole('button', { name: '수정' }).click()
  await page.getByLabel('문서 제목').fill('자동검증 테스트 문서 (수정됨)')
  await page.getByLabel('문서 설명').fill('')
  await page.getByRole('button', { name: '저장' }).click()
  await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('수정됨'), null, { timeout: 8000 })
  await page.reload()
  const title2 = await page.locator('h1').first().innerText()
  const noDesc = await page.getByText('설명 없음').count()
  check('B5', '제목 수정 반영·새로고침 유지, 설명 비우면 "설명 없음"',
        title2.includes('수정됨') && noDesc > 0, `h1="${title2}"`)

  // ── B3 재업로드 → v2 (변경 메모 · "최신" 배지 이동)
  writeFileSync(TMP, 'v2 자동 검증용 파일 — v1 과 내용이 다르다\n')
  await page.getByRole('button', { name: '새 버전 올리기' }).first().click()
  await page.setInputFiles('input[type=file]', TMP)
  await page.getByRole('textbox', { name: /메모|변경/ }).fill('자동 검증 v2 메모').catch(() => {})
  await page.getByRole('button', { name: /로 올리기/ }).click()
  await page.waitForSelector('text=새 버전을 올렸습니다.', { timeout: 30000 })
  await page.getByRole('button', { name: '완료' }).click()
  await page.waitForFunction(() => !!document.body.textContent?.includes('v2'), null, { timeout: 8000 })
  rows = await timeline()
  const v1 = rows.find((r) => r.startsWith('v1')) ?? ''
  const v2 = rows.find((r) => r.startsWith('v2')) ?? ''
  await page.screenshot({ path: `${SHOT}/B3-timeline.png`, fullPage: true })
  check('B3', '재업로드 → v2 행·메모·"최신" 배지가 v2 로 이동',
        !!v2 && v2.includes('자동 검증 v2 메모') && v2.includes('최신') && !v1.includes('최신'),
        `v2행=${!!v2} 배지v1=${v1.includes('최신')}`)

  // ── V3 부모 @updatedAt 갱신 (JUDGE #27 이 미확인으로 남긴 주장의 실측 지점)
  await page.goto('/')
  const first = await page.locator('tbody tr').first().innerText()
  check('V3', '재업로드 후 목록 최상단 = 부모 @updatedAt 갱신됨', first.includes('자동검증'))

  // ── B4 버전별 다운로드가 서로 다른 객체를 가리킨다
  const r1 = await api.get(`/api/documents/${DOC}/download?v=1`, { maxRedirects: 0 })
  const r2 = await api.get(`/api/documents/${DOC}/download?v=2`, { maxRedirects: 0 })
  const k1 = (r1.headers()['location'] ?? '').split('?')[0]
  const k2 = (r2.headers()['location'] ?? '').split('?')[0]
  check('B4', '?v=1 과 ?v=2 가 다른 S3 객체로 리다이렉트',
        r1.status() === 307 && r2.status() === 307 && !!k1 && k1 !== k2, `v1=${r1.status()} v2=${r2.status()}`)

  // ── B9 그 사이 삭제된 문서에 재업로드 → 서버 문구 (P2025/404 경로)
  await page.goto(`/documents/${DOC}`)
  const del = await api.delete(`/api/documents/${DOC}`)
  await page.getByRole('button', { name: '새 버전 올리기' }).first().click()
  await page.setInputFiles('input[type=file]', TMP)
  await page.getByRole('button', { name: /로 올리기/ }).click()
  const raced = await page
    .waitForSelector('text=문서를 찾을 수 없거나 휴지통에 있습니다.', { timeout: 30000 })
    .then(() => true).catch(() => false)
  await page.screenshot({ path: `${SHOT}/B9-race.png`, fullPage: true })
  check('B9', '삭제된 문서에 재업로드 → 서버 문구', raced, `DELETE=${del.status()}`)

  // ── B7 휴지통 문서 상세 → not-found, 복구하면 정상 (대조)
  await page.goto(`/documents/${DOC}`)
  const nfTrashed = await notFoundShown()
  const restored = await api.post(`/api/documents/${DOC}/restore`)
  await page.goto(`/documents/${DOC}`)
  const back = await page.locator('h1').first().innerText()
  check('B7', '휴지통 문서 → not-found, 복구 후 정상 (대조)',
        nfTrashed && back.includes('자동검증'), `복구=${restored.status()}`)

  // ── B6 상세에서 휴지통으로 → 목록 이동
  await page.locator('button[aria-label$="휴지통으로 이동"]').first().click()
  // 트리거와 확인 버튼의 접근성 이름이 겹친다(트리거는 문서 제목이 앞에 붙는다).
  // 다이얼로그 안에서 골라야 트리거를 다시 누르는 꼴이 된다.
  await page.getByRole('alertdialog').getByRole('button', { name: '휴지통으로 이동' }).click()
  await page.waitForURL('**/', { timeout: 10000 }).catch(() => {})
  const gone = !(await page.locator('tbody').innerText().catch(() => '')).includes('자동검증')
  await page.goto('/trash')
  const inTrash = (await page.locator('body').innerText()).includes('자동검증')
  check('B6', '상세에서 휴지통 → 목록에서 사라지고 휴지통에 있음', gone && inTrash)
} catch (e) {
  check('EXC', '스크립트 예외', false, String(e).slice(0, 300))
} finally {
  await browser.close()
  const purged = await purgeDocument(DOC, presignedKeys)
  console.log(`정리: 행 삭제 + S3 객체 ${purged.length}개 삭제`)
  const pass = results.filter((r) => r.pass).length
  console.log(`\n===== ${pass}/${results.length} PASS =====`)
  process.exitCode = pass === results.length ? 0 : 1
}
