// html 미리보기 실측. 팀의 실제 화면설계서 html 을 열어 iframe 이 **렌더**하는지 본다.
//
// 왜 자동화하는가 — 이 결함은 "안 보인다"가 아니라 "브라우저가 렌더 대신 내려받는다"로
// 나타난다. iframe 이 비어 있어도 페이지는 멀쩡해 보이므로 스크린샷만으로는 판정이 안 된다.
// 프레임이 S3 로 갔는지 + 그 프레임의 DOM 이 실제로 찼는지 둘 다 봐야 한다.
//
// 팀 문서를 **읽기만** 한다 — 만들지도 지우지도 않으므로 teardown 이 없다.
import { chromium } from '@playwright/test'
import { APP, withDb, mintSession, cookieFor } from './helpers.mjs'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

/** 형식별로 실제 문서를 하나씩 고른다. 없으면 그 항목은 건너뛴다. */
async function pickByMime(mime) {
  const { rows } = await withDb((c) =>
    c.query(
      `select d.id, d.title, v.file_name from documents d
       join document_versions v on v.document_id = d.id
       where d.deleted_at is null and v.mime_type = $1
       order by v.version_no desc limit 1`,
      [mime],
    ),
  )
  return rows[0] ?? null
}

const { token } = await mintSession()
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 780 } })
await ctx.addCookies([cookieFor(token)])
const page = await ctx.newPage()

// ── H1~H3: html 이 iframe 에서 렌더된다 ────────────────────────────────────
const html = await pickByMime('text/html')
if (!html) {
  check('H0 dev DB 에 html 문서가 있다', false, 'text/html 문서가 없다')
} else {
  await page.goto(`${APP}/documents/${html.id}`, { waitUntil: 'networkidle' })

  const frameEl = await page.$('iframe[title$="미리보기"]')
  check('H1 html 문서에 미리보기 iframe 이 있다', !!frameEl, html.file_name)

  if (frameEl) {
    const frame = await frameEl.contentFrame()
    // 서명 URL 로 307 된 뒤라 프레임 주소는 S3 다. 앱 주소로 남아 있으면 리다이렉트가 안 된 것
    const url = frame?.url() ?? ''
    check('H2 iframe 이 S3 로 넘어갔다', url.includes('amazonaws.com'), url.slice(0, 60))

    // 여기가 핵심이다 — Content-Type 이 잘못돼 브라우저가 "내려받기"로 처리하면
    // 프레임은 존재하지만 본문이 빈 채로 남는다.
    const body = await frame?.evaluate(() => ({
      chars: document.body?.innerText?.trim().length ?? 0,
      nodes: document.querySelectorAll('*').length,
      title: document.title,
    }))
    check(
      'H3 iframe 본문이 실제로 그려졌다 (내려받기로 처리되지 않았다)',
      (body?.nodes ?? 0) > 20,
      `노드 ${body?.nodes} · 글자 ${body?.chars} · title="${body?.title ?? ''}"`,
    )
  }

  await page.screenshot({ path: 'test/e2e/shots/HP-html.png', fullPage: false })
}

// ── X1~X5: xlsx 가 표로 그려진다 ────────────────────────────────────────────
//
// 여기가 이 파일의 원래 기준선(H4 "xlsx 는 아직 폴백 박스")을 뒤집는 자리다.
// 폴백이 사라진 것만 보면 부족하다 — 표가 비어 있어도 폴백은 사라지므로,
// 셀 수·병합·색이 실제로 붙었는지까지 봐야 "그려졌다"고 말할 수 있다.
const xlsx = await pickByMime(
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
)
if (!xlsx) {
  check('X0 dev DB 에 xlsx 문서가 있다', false, 'xlsx 문서가 없다')
} else {
  await page.goto(`${APP}/documents/${xlsx.id}`, { waitUntil: 'networkidle' })
  // 파싱은 동적 import(925KB) + fetch 뒤에 끝나므로 networkidle 로도 이르다
  // 세 갈래를 다 덮는다 — 표가 그려지거나, 파싱이 실패하거나, 시트가 비었거나.
  // 하나라도 빠지면 throw 가 나서 아래 집계와 process.exit 에 닿지 못하고
  // 결과표 없이 죽는다 (다른 항목의 PASS/FAIL 까지 같이 잃는다).
  try {
    await page.waitForSelector('section table td, section p', { timeout: 25_000 })
  } catch {
    check('X0 미리보기가 20초 안에 어떤 상태로든 끝났다', false, '아무것도 안 그려졌다')
  }

  const fallback = await page.getByText('이 형식은 미리보기를 지원하지 않습니다').count()
  check('X1 폴백 박스가 사라졌다 (H4 기준선 뒤집기)', fallback === 0, xlsx.file_name)

  const errored = await page.getByText('미리보기를 만들지 못했습니다').count()
  check('X2 파싱 오류 박스가 아니다', errored === 0)

  /** 미리보기 섹션 안의 표만 잰다 — 아래 "버전 이력" 표가 섞이면 항상 통과한다. */
  const measure = () =>
    page.evaluate(() => {
      const h2 = [...document.querySelectorAll('h2')].find((e) => e.textContent?.trim() === '미리보기')
      const root = h2?.parentElement
      const table = root?.querySelector('table')
      const tabs = [...(root?.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim() ?? '')
      if (!table) return { tabs, cells: 0, filled: 0, merged: 0, painted: 0, cols: 0, sample: '' }
      const cells = [...table.querySelectorAll('td')]
      return {
        tabs,
        cells: cells.length,
        filled: cells.filter((c) => (c.textContent ?? '').trim().length > 0).length,
        merged: cells.filter((c) => c.rowSpan > 1 || c.colSpan > 1).length,
        painted: cells.filter((c) => {
          const bg = getComputedStyle(c).backgroundColor
          return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent'
        }).length,
        cols: table.querySelectorAll('colgroup col').length,
        sample: cells.map((c) => (c.textContent ?? '').trim()).filter(Boolean).slice(0, 5).join(' | '),
      }
    })

  const opened = await measure()
  // 탭 바는 시트가 2개 이상일 때만 그려진다. 시트 1개짜리 파일에서 탭 수로 단언하면
  // 기능이 멀쩡한데 FAIL 한다 — 그래서 "표가 그려졌다"만 본다.
  check('X3 첫 화면에 시트가 하나 열려 있다', opened.cells > 0,
    opened.tabs.length ? `탭 ${opened.tabs.join('/')} · 셀 ${opened.cells}` : `단일 시트 · 셀 ${opened.cells}`)

  // 렌더 레이어를 검증하려면 내용이 있는 시트에서 봐야 한다. 표지 시트는 값이 4개뿐이라
  // (실측) 거기서 병합·색을 단언하면 통과해도 아무것도 증명하지 못한다.
  let best = { ...opened, tab: null }
  const seen = []
  for (const tab of opened.tabs) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    await page.waitForTimeout(200)
    const m = await measure()
    seen.push(`${tab}:${m.filled}`)
    if (m.filled > best.filled) best = { ...m, tab }
  }
  // 탭이 실제로 다른 시트를 그리는지 본다. 값 개수가 전부 같으면 클릭이 먹지 않았거나
  // 늘 같은 시트를 그리고 있다는 뜻이다 — "셀이 하나라도 있으면 통과"는 항진명제다.
  if (opened.tabs.length > 1) {
    const distinct = new Set(seen.map((x) => x.split(':')[1])).size
    check('X7 탭마다 다른 시트가 그려진다', distinct > 1, seen.join(' '))
  }

  // 스크린샷은 값이 가장 많은 시트에서 찍는다 — 루프가 끝난 자리(마지막 탭)는
  // 표지일 수도 있어서 눈으로 볼 것이 없다.
  if (best.tab) {
    await page.getByRole('button', { name: best.tab, exact: true }).click()
    await page.waitForTimeout(200)
  }

  check('X4 값이 든 시트가 표로 그려졌다', best.filled > 20,
    `값 ${best.filled} / 셀 ${best.cells} · 열 ${best.cols} — ${best.sample}`)
  check('X5 병합이 rowSpan/colSpan 으로 살아 있다', best.merged > 0, `병합셀 ${best.merged}`)
  check('X6 채우기색이 칠해졌다 (색 해석 레이어가 돈다)', best.painted > 0, `색칠셀 ${best.painted}`)

  await page.screenshot({ path: 'test/e2e/shots/HP-xlsx-after.png', fullPage: false })
}

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 통과`)
process.exit(failed.length ? 1 : 0)
