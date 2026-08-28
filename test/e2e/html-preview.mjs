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

// ── H4: xlsx 는 아직 폴백 박스다 (xlsx 작업의 기준선) ───────────────────────
const xlsx = await pickByMime(
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
)
if (xlsx) {
  await page.goto(`${APP}/documents/${xlsx.id}`, { waitUntil: 'networkidle' })
  const fallback = await page.getByText('이 형식은 미리보기를 지원하지 않습니다').count()
  check('H4 xlsx 는 아직 폴백 박스다 (기준선)', fallback === 1, xlsx.file_name)
  await page.screenshot({ path: 'test/e2e/shots/HP-xlsx-before.png', fullPage: false })
}

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 통과`)
process.exit(failed.length ? 1 : 0)
