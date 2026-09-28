/**
 * 정합성 패널 실제 화면 검증 — 세 화살표 구성(2026-09-28).
 *
 * 전제: `npm run dev`(3002) + 실제 .env (dev 브랜치).
 * 실행:  npm run test:e2e:consistency-view
 *
 * **`consistency.mjs` 와 보는 것이 다르다.** 저쪽은 *받아서 쌓는가*(POST 왕복)이고 여기는 *쌓인 것이 화면에
 * 맞게 나오는가* 다. 단위 테스트는 순수 함수만 덮고 서버 컴포넌트가 조회해 그린 HTML 은 못 본다.
 *
 * 2099년 스냅샷을 넣어 최신으로 만든다 — 미래 측정이라 메인 안전망도 끼어들지 않는다(쿨다운 안).
 * 옛 구성(축 9개·등급 내역·findings 목록)의 검사(V2·V4~V7·V12~V19)는 화면이 없어져 뺐다.
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
/** 화살표 전 스냅샷을 흉내 낸다 — 위보다 늦어 최신이 된다 */
const LEGACY_AT = '2099-09-12T09:00:00+09:00'

const LEGACY_METRICS = [
  { axis: 'referenceTotal', from: null, to: null, ok: 563, total: 591 },
  { axis: 'triangle', from: null, to: null, ok: 1022, total: 1066 },
]
const METRICS = [
  ...LEGACY_METRICS,
  { axis: 'reqBySCR', from: null, to: null, ok: 46, total: 48 },
  { axis: 'reqByFN', from: null, to: null, ok: 47, total: 48 },
  { axis: 'fnToSCR', from: null, to: null, ok: 627, total: 627 },
]

const finding = (level, check, refId, message) => ({ level, check, doc: 'REQ', refId, where: null, message })
const FINDINGS = [
  finding('error', '요구사항누락', 'REQ-COM-001', '서비스 대상 정의\n○ 보호자 대상 서비스'),
  finding('warning', '화면설계 미반영', 'REQ-COM-001', '서비스 대상 정의\n○ 보호자 대상 서비스'),
  finding('warning', '화면설계 미반영', 'REQ-AIM-006', '커뮤니티 AI 코멘트'),
  finding('warning', '기능명세 미반영', 'REQ-COM-001', '서비스 대상 정의\n○ 보호자 대상 서비스'),
  // 읽지 못한 문서 — 분모를 조용히 줄이므로 패널이 반드시 보여야 한다
  { level: 'error', check: '파싱', doc: 'SCR-XYZ', refId: null, where: null, message: '휴지통에 있다' },
  // 패널이 이제 안 그리는 옛 검사 — 화면에 새어 나오면 안 된다
  finding('warning', '중복블록', 'SCR-ACC-002', '옛검사가새어나옴'),
]

const BAND = 'section[aria-label="정합성 지표"]'

console.log(`■ 대상 APP : ${APP}`)
console.log(`■ 대상 DB  : ${(process.env.DATABASE_URL ?? '').split('@')[1]?.split('/')[0] ?? '?'}`)
console.log('■ 로컬이면 localhost + ep-aged-king 이어야 한다\n')

const { token } = await mintSession()
const cookie = cookieFor(token)

// 살아 있는 문서를 dmsId 로 쓴다 — 링크가 실제로 걸리는지 보려면 실물이 필요하다.
const alive = await withDb((c) => c.query('select id from documents where deleted_at is null order by created_at desc limit 2'))
const docs = [
  ...alive.rows.map((row, i) => ({ key: `AA-REAL-${i}`, ver: 'v0.5', dmsId: row.id, dmsVersion: 1 })),
  // 합치기로 하드 삭제된 문서를 흉내 낸다. 링크가 빠지고 행은 남아야 한다.
  { key: 'ZZ-GONE-00', ver: 'v0.5', dmsId: '없는문서-0', dmsVersion: 2 },
]

const post = async (measuredAt, metrics, findings) => {
  const count = (level) => findings.filter((f) => f.level === level).length
  const res = await fetch(`${APP}/api/consistency`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `${cookie.name}=${token}` },
    body: JSON.stringify({
      measuredAt,
      reqVer: '0.6',
      counts: { errors: count('error'), warnings: count('warning'), pending: 0, unresolved: 0 },
      metrics,
      findings,
      docs,
    }),
  })
  if (res.status !== 201) throw new Error(`측정 저장 실패: ${res.status} ${await res.text()}`)
  return (await res.json()).id
}

/** 지울 때 쓸 id. **`measured_at` 을 키로 지우지 않는다** — 2026-09-13 에 타임존 해석이 갈려 0행을 지웠다. */
const created = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([cookie])
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (err) => pageErrors.push(err.message))

try {
  // V9 — 테이블이 비었을 때만 볼 수 있다. 실데이터가 있으면 건너뛰고 그렇다고 말한다.
  const baseline = await withDb((c) => c.query('select count(*)::int as n from consistency_snapshots'))
  await page.goto(APP, { waitUntil: 'networkidle' })
  if (baseline.rows[0].n === 0) {
    const before = await page.locator(BAND).count()
    check('V9', '측정이 없으면 밴드를 아예 안 그린다', before === 0, `밴드 ${before}개`)
  } else {
    console.log(`SKIP V9 측정이 없을 때를 못 본다 — 기존 스냅샷 ${baseline.rows[0].n}건`)
  }

  created.push(await post(MEASURED_AT, METRICS, FINDINGS))
  await page.goto(APP, { waitUntil: 'networkidle' })
  const band = page.locator(BAND)
  const text = (await band.textContent()) ?? ''

  check('V1', '밴드가 메인에 뜬다', (await band.count()) === 1)
  // timestamptz 로 안 바꿨거나 읽는 쪽이 UTC 해석을 빠뜨리면 9시간 밀린다.
  check('V3', `측정 시각이 KST 로 정확하다 (${EXPECTED_CLOCK}, ${SHIFTED_CLOCK} 아님)`,
    text.includes(EXPECTED_CLOCK) && !text.includes(SHIFTED_CLOCK))

  const hero = band.locator('section', { hasText: '미반영 요구사항' }).first()
  const heroText = (await hero.textContent()) ?? ''
  // 왼쪽 카드 = 제목 · 개수 · ID+요구사항명 목록, 세부내용은 툴팁(2026-09-28 사람 지시)
  const tip = await hero.locator('li').first().getAttribute('title')
  check('A1', '미반영 요구사항 카드가 개수 · ID · 요구사항명을 보이고 세부내용은 툴팁이다',
    heroText.trim() === '미반영 요구사항1REQ-COM-001서비스 대상 정의' && tip === '○ 보호자 대상 서비스',
    `${heroText.slice(0, 80)} · 툴팁 ${tip}`)

  const rows = await band.locator('[data-arrow]').evaluateAll((els) => els.map((el) => [el.getAttribute('data-arrow'), el.textContent]))
  const expect = [
    ['reqBySCR', '화면설계 요구사항 반영률', '46/48', '95.8%'],
    ['reqByFN', '기능명세 요구사항 반영률', '47/48', '97.9%'],
    ['fnToSCR', '기능명세 화면 매핑률', '627/627', '100.0%'],
  ]
  // 빠진 개수 문구는 뺐다(2026-09-28 사람 지시)
  const gapText = rows.filter(([, t]) => /빠짐|전부 있음/.test(t)).length
  const bad = expect.filter(([axis, ...parts], i) => rows[i]?.[0] !== axis || !parts.every((p) => rows[i][1].includes(p)))
  check('A2', '세 화살표가 순서대로 질문 · 분수 · 비율을 보이고 빠진 개수 문구는 없다', rows.length === 3 && bad.length === 0 && gapText === 0,
    rows.map(([, t]) => t).join(' / '))

  const scrRow = band.locator('[data-arrow="reqBySCR"]')
  await scrRow.getByRole('button', { name: '누락 항목 보기' }).click()
  const opened = (await scrRow.textContent()) ?? ''
  const fnScrButtons = await band.locator('[data-arrow="fnToSCR"] button').count()
  check('A3', '빠진 것을 펼치면 ID 가 나오고, 빠진 것이 없으면 버튼이 없다',
    opened.includes('REQ-COM-001') && opened.includes('REQ-AIM-006') && fnScrButtons === 0, `fnToSCR 버튼 ${fnScrButtons}개`)

  const gone = ['검사가 찾은 것', '문서 사이 연결', '미반영 항목', '목록 보기', '옛검사가새어나옴', '자동 갱신']
    .filter((word) => text.includes(word) || opened.includes(word))
  check('A4', '버린 구성(433 히어로·연결 카드·미반영 카드·findings 목록)이 없다', gone.length === 0, `남은 것: ${gone.join(', ') || '없음'}`)

  const results = band.locator('[data-arrow]').first().locator('xpath=..')
  const resultsText = (await results.textContent()) ?? ''
  check('A6', '읽지 못한 문서를 검사 결과 카드 안에 사유와 함께 보인다',
    resultsText.includes('측정 제외 문서') && resultsText.includes('SCR-XYZ') && resultsText.includes('휴지통에 있다'))

  // 신호등 금지 — 결과 지표에 색이 없다. 실행 상태 표시(`data-run-status`)만 예외(2026-09-27 사람 결정)
  const outsideStatus = ':not([data-run-status]):not([data-run-status] *)'
  const colored = await band
    .locator(`[class*="danger"]${outsideStatus}, [class*="success"]${outsideStatus}, [class*="warning"]${outsideStatus}`)
    .count()
  check('V8', '결과 지표에 신호등(빨강·초록·노랑)이 없다 — 실행 상태 표시만 예외', colored === 0, `색 요소 ${colored}개`)

  const links = await band.locator('a[href^="/documents/"]').count()
  check('V10', '측정에 쓴 문서 — 살아 있는 문서만 링크, 사라진 문서는 이름만', links === alive.rows.length && text.includes('ZZ-GONE-00'),
    `링크 ${links}개 · 살아 있는 문서 ${alive.rows.length}개`)

  // 화살표 전 스냅샷이 최신이면 0% 로 그리지 않고 "곧 다시 잽니다" 만 띄운다
  created.push(await post(LEGACY_AT, LEGACY_METRICS, []))
  await page.goto(APP, { waitUntil: 'networkidle' })
  const legacy = (await page.locator(BAND).textContent()) ?? ''
  check('A5', '화살표가 없는 옛 스냅샷은 빈 막대 대신 안내만 보인다',
    legacy.includes('새 기준으로는 아직 측정하지 않았습니다') && (await page.locator(`${BAND} [data-arrow]`).count()) === 0)

  // 폴더·태그 필터는 같은 페이지라 코드로 막아야 한다. **실제로 있는 폴더 id 여야 한다** — 없는 폴더면
  // 앱이 필터를 안 걸고 전체 목록으로 떨어뜨려 밴드가 뜨는 것이 맞다.
  const folder = await withDb((c) => c.query('select id from folders limit 1'))
  const folderId = folder.rows[0]?.id
  if (folderId === undefined) throw new Error('폴더가 하나도 없어 V20 을 못 본다')
  const elsewhere = []
  for (const [name, path] of [
    ['폴더 필터', `/?folder=${folderId}`],
    ['태그 필터', '/?tag=아무태그'],
    ['검색', '/search?q=ㄱ'],
    ['휴지통', '/trash'],
  ]) {
    await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' })
    const n = await page.locator(BAND).count()
    if (n > 0) elsewhere.push(`${name}(${n})`)
  }
  check('V20', '메인 말고 다른 화면에는 안 뜬다', elsewhere.length === 0, elsewhere.join(' / ') || '없음')

  check('V11', '콘솔 에러가 없다', pageErrors.length === 0, pageErrors.join(' / ') || '없음')
} finally {
  await browser.close()
  for (const id of created) await withDb((c) => c.query('delete from consistency_snapshots where id = $1', [id]))
  // 남는 것이 있으면 이전 주행이 흘린 것이다. 미래 시각이라 실데이터와 안 겹친다.
  const left = await withDb((c) => c.query("select count(*) from consistency_snapshots where req_ver = '0.6' and measured_at > now()"))
  console.log(`\n정리: 이 스위트가 넣은 스냅샷 ${left.rows[0].count}건 남음`)
}

const passed = results.filter((r) => r.pass).length
console.log(`\n===== ${passed}/${results.length} PASS =====`)
process.exit(passed === results.length ? 0 : 1)
