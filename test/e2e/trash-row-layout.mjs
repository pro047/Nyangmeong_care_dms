// 휴지통 행 버튼이 세로로 쪼개지는 결함의 회귀 테스트 (2026-08-27 관찰 → 2026-08-28 수정).
// build·lint·test 가 원리상 못 잡는다 — 클래스는 유효하고 타입도 맞다. 무너지는 것은 레이아웃뿐이다.
//
// 원인은 액션 열의 고정 폭 w-24(96px, px-4 를 빼면 내용 폭 64px)였다. 아이콘 전용 열
// (전체 문서의 w-12)에서 값을 가져왔는데 휴지통은 텍스트 버튼이 둘이라 안 들어갔고,
// 한국어는 단어 경계 없이 줄바꿈되므로 "영구삭제"가 글자당 한 줄로 쌓였다.
//
// 판정은 클래스가 아니라 getBoundingClientRect 다. 폭을 다시 좁히거나 whitespace-nowrap 을
// 떼면 버튼 높이가 한 줄을 넘어가면서 여기서 걸린다.
import { chromium } from 'playwright'
import { APP, mintSession, cookieFor, withDb, seedDocument, purgeDocument } from './helpers.mjs'

// text-sm(line-height 20px) + py-1(4px×2) = 28px 가 한 줄이다. 두 줄이면 48px.
// 38 은 그 사이 — 폰트 폴백으로 한두 픽셀 흔들려도 오판하지 않는다.
const ONE_LINE_MAX = 38
// 한 줄 버튼 + py-3(12px×2) 이면 52px 안팎이다. 두 줄로 쌓이면 즉시 넘는다.
const ROW_MAX = 72

const results = []
let ok = true

const check = (name, pass, detail) => {
  if (!pass) ok = false
  results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

const { token } = await mintSession()
const browser = await chromium.launch()
// 0-2 스크린샷과 같은 뷰포트. 결함이 처음 관찰된 크기다.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 780 } })
await ctx.addCookies([cookieFor(token)])
const page = await ctx.newPage()

let docId = null
try {
  docId = await seedDocument(token, {
    // 제목이 길수록 액션 열이 밀린다. 짧은 제목으로는 결함이 재현되지 않을 수 있다.
    title: `_실측_휴지통레이아웃_${Date.now()}_아주아주긴제목으로액션열을밀어본다`,
    fileName: 'trash-layout.txt',
    body: 'x',
  })
  await withDb((c) => c.query('update documents set deleted_at = now() where id = $1', [docId]))

  await page.goto(`${APP}/trash`, { waitUntil: 'networkidle' })

  const restore = page.getByRole('button', { name: /복구$/ }).first()
  const purge = page.getByRole('button', { name: /영구삭제$/ }).first()
  await restore.waitFor({ state: 'visible' })

  const rb = await restore.boundingBox()
  const pb = await purge.boundingBox()

  check('복구 버튼이 한 줄이다', rb.height <= ONE_LINE_MAX, `높이=${Math.round(rb.height)}px (상한 ${ONE_LINE_MAX})`)
  check('영구삭제 버튼이 한 줄이다', pb.height <= ONE_LINE_MAX, `높이=${Math.round(pb.height)}px (상한 ${ONE_LINE_MAX})`)

  // 세로로 쌓이면 두 버튼의 top 이 갈린다. 나란히 놓였으면 거의 같다.
  check('두 버튼이 나란히 놓인다', Math.abs(rb.y - pb.y) <= 2, `top 차이=${Math.round(Math.abs(rb.y - pb.y))}px`)

  const rowHeight = await restore.evaluate((el) => el.closest('tr').getBoundingClientRect().height)
  check('행 높이가 정상이다', rowHeight <= ROW_MAX, `높이=${Math.round(rowHeight)}px (상한 ${ROW_MAX})`)

  // 대조 — 제목 열은 여전히 잘려야 한다. 액션 열을 넓히다 제목 truncate 를 깨면 여기서 걸린다.
  const truncated = await page.evaluate(() => {
    const el = document.querySelector('td .truncate-cell')
    return el ? el.scrollWidth > el.clientWidth : null
  })
  check('제목은 여전히 잘린다 (액션 열이 다 먹지 않았다)', truncated === true, `잘림=${truncated}`)

  await page.screenshot({ path: 'test/e2e/shots/TRL1-trash-row.png' })
} finally {
  await browser.close()
  if (docId) await purgeDocument(docId)
}

console.log(results.join('\n'))
console.log(ok ? '\n전부 통과' : '\n실패 있음')
process.exit(ok ? 0 : 1)
