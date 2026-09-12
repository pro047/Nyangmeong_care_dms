/**
 * 정합성 밴드 실제 화면 검증.
 *
 * 전제: `npm run dev`(3002) + 실제 .env (dev 브랜치).
 * 실행:  npm run test:e2e:consistency-view
 *
 * **`consistency.mjs` 와 보는 것이 다르다.** 저쪽은 *받아서 쌓는가*(POST 왕복)이고
 * 여기는 *쌓인 것이 화면에 맞게 나오는가* 다. 단위 테스트(`consistency-view.test.ts`)가
 * 순수 함수를 덮지만 **실제로 서버 컴포넌트가 조회해 그린 HTML 은 못 본다** — 이 스트림은
 * 스키마(`measured_at` → `timestamptz`)를 건드렸고, 그 클래스의 사고는 원리상 단위
 * 테스트에 안 잡힌다(`HANDOFF.md` §지뢰의 "next dev 를 오래 띄워 두면…").
 *
 * 특히 V3 이 이 스트림의 핵심이다 — 측정 시각이 9시간 밀리는지는 여기서만 드러난다.
 */
import { chromium } from '@playwright/test'
import { APP, mintSession, cookieFor, withDb } from './helpers.mjs'

const results = []
const check = (id, desc, pass, detail = '') => {
  results.push({ id, desc, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${desc}${detail ? ` — ${detail}` : ''}`)
}

/** 실데이터와 안 겹치게 미래로 둔다 — 지울 때 신원이 된다. 분·초는 시각 검증용이다. */
const MEASURED_AT = '2099-09-11T20:14:48+09:00'
/** 위 값을 KST 로 읽으면 화면에 이 시각이 나온다. `formatDateTime` 이 24시간제라 "20:14" 다. */
const EXPECTED_CLOCK = '20:14'
/** UTC 로 해석하면 이 값이 나온다. 둘을 같이 봐야 "안 밀렸다" 가 확정된다. */
const SHIFTED_CLOCK = '11:14'

/** 저쪽 인계문 §2 의 축 9개. 값이 실측이라 그대로 쓴다. */
const METRICS = [
  { axis: 'reference', from: 'FN', to: 'REQ', ok: 42, total: 42 },
  { axis: 'reference', from: 'FN', to: 'SCR', ok: 55, total: 58 },
  { axis: 'reference', from: 'SCR', to: 'FN', ok: 129, total: 129 },
  { axis: 'reference', from: 'SCR', to: 'REQ', ok: 48, total: 48 },
  { axis: 'reference', from: 'SCR', to: 'SCR', ok: 87, total: 100 },
  { axis: 'referenceTotal', from: null, to: null, ok: 361, total: 377 },
  { axis: 'reqCoverage', from: null, to: null, ok: 37, total: 62 },
  { axis: 'reqCoverageWithDocs', from: null, to: null, ok: 37, total: 50 },
  { axis: 'scrCoverage', from: null, to: null, ok: 54, total: 54 },
]

/** 실측 분포와 같은 건수 — error 14 · warning 107 · unresolved 28 = 149. */
function buildFindings() {
  const out = []
  const push = (level, name, n) => {
    for (let i = 1; i <= n; i++) {
      out.push({
        level,
        check: name,
        doc: `SCR-${String(i % 9).padStart(3, '0')}`,
        refId: `SCR-HLT-${String(i).padStart(3, '0')}`,
        where: `SCR-COM-${String(i).padStart(3, '0')}@블록${i % 7}`,
        message: `${name} 검사에서 걸린 항목입니다 (${i}번)`,
      })
    }
  }
  push('error', '참조', 14)
  push('warning', '참조', 37)
  push('warning', 'REQ커버리지', 25)
  push('warning', '기준REQ', 18)
  push('warning', '형식', 8)
  push('warning', '결번', 7)
  push('warning', '중복블록', 6)
  push('warning', '프레임바', 6)
  push('unresolved', 'unresolved', 28)
  return out
}

const BAND = 'section[aria-label="정합성 지표"]'

console.log(`■ 대상 APP : ${APP}`)
console.log(`■ 대상 DB  : ${(process.env.DATABASE_URL ?? '').split('@')[1]?.split('/')[0] ?? '?'}`)
console.log('■ 로컬이면 localhost + ep-aged-king 이어야 한다\n')

const { token } = await mintSession()
const cookie = cookieFor(token)

// 살아 있는 문서를 dmsId 로 쓴다 — 링크가 실제로 걸리는지 보려면 실물이 필요하다.
const alive = await withDb((c) =>
  c.query('select id from documents where deleted_at is null order by created_at desc limit 2'),
)
const linkableIds = alive.rows.map((row) => row.id)
const docs = [
  ...linkableIds.map((id, i) => ({
    key: `AA-REAL-${i}`,
    ver: 'v0.5',
    dmsId: id,
    dmsVersion: 1,
  })),
  // 합치기로 하드 삭제된 문서를 흉내 낸다. 링크가 빠지고 행은 남아야 한다.
  ...Array.from({ length: 19 - linkableIds.length }, (_, i) => ({
    key: `ZZ-GONE-${String(i).padStart(2, '0')}`,
    ver: 'v0.5',
    dmsId: `없는문서-${i}`,
    dmsVersion: 2,
  })),
]

/**
 * 지울 때 쓸 id. **`measured_at` 을 키로 지우지 않는다** — 2026-09-13 에 이걸로 데었다.
 * 타임존 없는 컬럼이면 Prisma 가 쓴 값과 여기서 보내는 Date 의 해석이 갈려 delete 가
 * 0행을 지우는데, 확인 쿼리가 같은 조건을 쓰면 **0행 남았다고 자기모순 없이 틀리게 보고**한다.
 */
let snapshotId = null

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([cookie])
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (err) => pageErrors.push(err.message))

try {
  // V9 를 먼저 본다 — 측정을 넣기 전이어야 "없을 때"를 볼 수 있다.
  //
  // **테이블이 비었을 때만 볼 수 있는 항목이다.** 이 스트림의 목적이 *측정이 쌓이는 것*
  // 이라 실데이터가 들어오는 순간 전제가 깨지는데, 그때 스위트를 통째로 빨갛게 만들면
  // 기능이 멀쩡한데 못 쓰는 검사가 된다. 전제가 없으면 건너뛰고 그렇다고 말한다.
  const baseline = await withDb((c) => c.query('select count(*)::int as n from consistency_snapshots'))
  await page.goto(APP, { waitUntil: 'networkidle' })
  if (baseline.rows[0].n === 0) {
    const before = await page.locator(BAND).count()
    check('V9', '측정이 없으면 밴드를 아예 안 그린다', before === 0, `밴드 ${before}개`)
  } else {
    console.log(`SKIP V9 측정이 없을 때를 못 본다 — 기존 스냅샷 ${baseline.rows[0].n}건`)
  }

  const res = await fetch(`${APP}/api/consistency`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `${cookie.name}=${token}` },
    body: JSON.stringify({
      measuredAt: MEASURED_AT,
      reqVer: '0.6',
      counts: { errors: 14, warnings: 107, pending: 0, unresolved: 28 },
      metrics: METRICS,
      findings: buildFindings(),
      docs,
    }),
  })
  if (res.status !== 201) throw new Error(`측정 저장 실패: ${res.status} ${await res.text()}`)
  snapshotId = (await res.json()).id

  await page.goto(APP, { waitUntil: 'networkidle' })
  const band = page.locator(BAND)
  const text = await band.innerText()

  check('V1', '밴드가 메인에 뜬다', await band.isVisible())

  // 축 9개를 전부. 하나를 대표로 뽑으면 그게 "정합성 = N%" 라는 판정이 된다.
  const axisText = ['42/42', '55/58', '129/129', '48/48', '87/100', '361/377', '37/62', '37/50', '54/54']
  const missing = axisText.filter((v) => !text.includes(v))
  check('V2', '축 9개가 접지 않아도 전부 보인다', missing.length === 0, `빠진 것: ${missing.join(', ') || '없음'}`)

  // 이 스트림의 핵심. timestamptz 로 안 바꿨거나 읽는 쪽이 UTC 해석을 빠뜨리면 9시간 밀린다.
  check('V3', `측정 시각이 KST 로 정확하다 (${EXPECTED_CLOCK}, ${SHIFTED_CLOCK} 아님)`,
    text.includes(EXPECTED_CLOCK) && !text.includes(SHIFTED_CLOCK),
    text.split('\n').find((line) => line.includes('측정')) ?? '(줄 못 찾음)')

  // 59.68% 만 보이면 오해다 — 실제 판정 대상은 8건이다.
  check('V4', 'REQ 커버리지 두 분모가 같이 보인다',
    text.includes('59.68%') && text.includes('74.00%'))

  // 신호등 금지. errors 14 는 "14개가 잘못됐다" 가 아니라 "14개를 사람이 봐야 한다" 다.
  const dangerish = await band.locator('[class*="danger"], [class*="success"]').count()
  check('V8', '밴드에 신호등(빨강·초록)이 없다', dangerish === 0, `색 요소 ${dangerish}개`)

  await page.screenshot({ path: 'test/e2e/shots/CV-collapsed.png' })

  await page.getByRole('button', { name: /149건/ }).click()
  await page.waitForTimeout(200)
  const allRows = await band.locator('tbody tr').count()
  check('V5', 'findings 149건이 펼치면 전부 나온다', allRows === 149, `${allRows}행`)
  await page.screenshot({ path: 'test/e2e/shots/CV-open.png' })

  await band.locator('select').first().selectOption('error')
  await page.waitForTimeout(200)
  const errorRows = await band.locator('tbody tr').count()
  check('V6', '등급 필터가 실제로 건다', errorRows === 14, `error ${errorRows}행`)

  // 두 칸을 겹쳐 걸면 AND 여야 한다. 참조 검사의 error 는 14건 전부다.
  await band.locator('select').nth(1).selectOption('참조')
  await page.waitForTimeout(200)
  const andRows = await band.locator('tbody tr').count()
  check('V7', '필터 두 칸이 AND 로 걸린다', andRows === 14, `error+참조 ${andRows}행`)
  await page.screenshot({ path: 'test/e2e/shots/CV-filtered.png' })

  // 사라진 문서는 링크를 빼되 행은 남는다 — 감추면 측정이 19개를 봤다는 사실이 사라진다.
  const docLinks = await band.locator('a[href^="/documents/"]').count()
  const docLine = await band.locator('div:has-text("측정에 쓴 문서")').last().innerText()
  const goneShown = (docLine.match(/ZZ-GONE/g) ?? []).length
  check('V10', '사라진 문서는 링크 없이 이름만 남는다',
    docLinks === linkableIds.length && goneShown === 19 - linkableIds.length,
    `링크 ${docLinks}개 · 링크없음 ${goneShown}개`)

  check('V11', '콘솔 에러가 없다', pageErrors.length === 0, pageErrors.join(' / ') || '없음')
} finally {
  await browser.close()
  if (snapshotId) {
    await withDb((c) => c.query('delete from consistency_snapshots where id = $1', [snapshotId]))
  }
  // 남는 것이 있으면 이전 주행이 흘린 것이다. 미래 시각이라 실데이터와 안 겹친다.
  const left = await withDb((c) =>
    c.query("select count(*) from consistency_snapshots where req_ver = '0.6' and measured_at > now()"),
  )
  console.log(`\n정리: 이 스위트가 넣은 스냅샷 ${left.rows[0].count}건 남음`)
}

const passed = results.filter((r) => r.pass).length
console.log(`\n===== ${passed}/${results.length} PASS =====`)
process.exit(passed === results.length ? 0 : 1)
