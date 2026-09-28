/**
 * 정합성 패널의 실행 상태 표시(검사 완료 · 검사 중 · 검사 실패)와 검사 중 자동 새로고침, 실제 화면 검증.
 *
 * 전제: `npm run dev`(3002) + 실제 .env (dev 브랜치) + dev 에 스냅샷이 하나 이상 있을 것(패널이 그려진다).
 * 실행:  node --env-file=.env test/e2e/consistency-run.mjs
 *
 * R1~R4 는 `consistency_run` 행을 SQL 로 만들어 화면만 본다. R5·R6 은 실제로 새 판을 올려
 * "검사 중 → (새로고침 없이) 검사 완료 + 새 측정 시각" 을 본다. R7 은 상태 조회 1회의 지연 실측. 메인 안전망이 끼어들지 않게
 * `consistency_refresh` 를 잠깐 막아 두고, 끝나면 두 행과 스냅샷·테스트 문서를 원래대로 돌린다.
 */
import { chromium } from '@playwright/test'
import { APP, cookieFor, mintSession, purgeDocument, seedDocument, withDb } from './helpers.mjs'

const TEST_KEY = 'FN-AIM'
const EXPECTED_CHECKS = 8
const BAND = 'section[aria-label="정합성 지표"]'
const STATUS = `${BAND} [role="status"][data-run-status]`

const results = []
const check = (id, desc, pass, detail = '') => {
  results.push({ id, desc, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${desc}${detail ? ` — ${detail}` : ''}`)
}

const setRun = (sql, params = []) => withDb((c) => c.query(sql, params))
const upsertRun = (startedAgoSec, finished, ok, reason) =>
  setRun(
    `insert into consistency_run (id, run_id, started_at, finished_at, ok, reason)
       values ('main', 'e2e', now() - make_interval(secs => $1), $2, $3, $4)
     on conflict (id) do update set run_id = 'e2e', started_at = excluded.started_at,
       finished_at = excluded.finished_at, ok = excluded.ok, reason = excluded.reason`,
    [startedAgoSec, finished ? new Date() : null, ok, reason],
  )

async function addVersion(token, documentId, fileName, body) {
  const H = { 'Content-Type': 'application/json', Cookie: `dms_session=${token}` }
  const pre = await fetch(`${APP}/api/documents/presign`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ fileName, contentType: 'text/plain', size: body.length }),
  })
  if (!pre.ok) throw new Error(`presign ${pre.status}`)
  const { key, url, keyToken } = await pre.json()
  const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body })
  if (!put.ok) throw new Error(`S3 PUT ${put.status}`)
  const res = await fetch(`${APP}/api/documents/${documentId}/versions`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ s3Key: key, keyToken, fileName, mimeType: 'text/plain' }),
  })
  return res.status
}

const since = new Date(Date.now() - 1000)
const created = []
// 시작 전 두 행 — undefined = 아직 못 읽음(정리에서 안 건드린다), null = 행이 없었다
let runBefore
let refreshBefore

const { token } = await mintSession()
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([cookieFor(token)])
const page = await ctx.newPage()

try {
  runBefore = await withDb(async (c) => (await c.query(`select * from consistency_run where id = 'main'`)).rows[0] ?? null)
  refreshBefore = await withDb(async (c) => (await c.query(`select attempted_at from consistency_refresh where id = 'main'`)).rows[0] ?? null)

  // 1) 검사 중 → 끝 기록이 오면 새로고침 없이 검사 완료로 바뀐다
  await upsertRun(1, false, null, null)
  await page.goto(APP, { waitUntil: 'networkidle' })
  const runningText = await page.locator(STATUS).textContent()
  check('R1', '끝 기록이 없으면 "검사 중" 이 보인다', runningText?.includes('검사 중'), runningText ?? '(없음)')

  await setRun(`update consistency_run set finished_at = now(), ok = true where id = 'main'`)
  const flipped = await page
    .locator(`${STATUS}[data-run-status="done"]`)
    .waitFor({ timeout: 10_000 })
    .then(() => true, () => false)
  check('R2', '새로고침 없이 "검사 완료" 로 바뀐다 (3초 간격 자동 새로고침)', flipped)

  // 2) 실패 — 사유와 "아래 숫자는 언제 것" 이 같이 보인다
  await upsertRun(5, true, false, 'E2E 가 만든 실패 사유')
  await page.goto(APP, { waitUntil: 'networkidle' })
  const failedText = (await page.locator(BAND).textContent()) ?? ''
  check('R3', '실패로 끝나면 "검사 실패" 와 사유 · 숫자의 측정 시각이 보인다',
    (await page.locator(STATUS).textContent())?.includes('검사 실패') &&
      failedText.includes('E2E 가 만든 실패 사유') && failedText.includes('아래 숫자는'),
    (await page.locator('[data-run-status="failed-reason"]').textContent()) ?? '(사유 줄 없음)')

  // 3) 끝 기록 없이 5분이 지나면 "검사 중" 에 멈추지 않고 실패로 보인다
  await upsertRun(6 * 60, false, null, null)
  await page.goto(APP, { waitUntil: 'networkidle' })
  const timedOut = (await page.locator(BAND).textContent()) ?? ''
  check('R4', '5분이 지나도 끝 기록이 없으면 시간 초과 실패로 보인다',
    (await page.locator(STATUS).textContent())?.includes('검사 실패') && timedOut.includes('5분이 지나도'))

  // 4) 실제 흐름 — docKey 문서에 새 판 → 검사 중 → (새로고침 없이) 검사 완료 + 새 측정 시각
  const holder = await withDb(async (c) => (await c.query('select id from documents where doc_key = $1', [TEST_KEY])).rows)
  if (holder.length) throw new Error(`${TEST_KEY} 를 이미 쓰는 문서가 있다: ${holder[0].id}`)
  // 메인 안전망이 같이 재면 어느 쪽 상태를 보는지 흐려진다 — 10분 동안 막는다(끝나고 되돌린다)
  await setRun(`insert into consistency_refresh (id, attempted_at) values ('main', now())
                on conflict (id) do update set attempted_at = now()`)
  const doc = await seedDocument(token, { title: 'E2E 실행 상태', fileName: 'e2e_실행상태_v0.1.txt', body: 'v1' })
  created.push(doc)
  await withDb((c) => c.query('update documents set doc_key = $1 where id = $2', [TEST_KEY, doc]))
  const beforeLabel = await page.locator(`${BAND} p`).first().textContent()

  const status = await addVersion(token, doc, 'e2e_실행상태_v0.2.txt', 'v2 FN-AIM-001-01')
  await page.goto(APP, { waitUntil: 'networkidle' })
  const during = await page.locator(STATUS).getAttribute('data-run-status')
  check('R5', '업로드 직후 메인은 "검사 중" 이다 (5초 대기부터 검사 중)', status === 201 && during === 'running',
    `status=${status} 상태=${during}`)

  const done = await page
    .locator(`${STATUS}[data-run-status="done"]`)
    .waitFor({ timeout: 30_000 })
    .then(() => true, () => false)
  const afterLabel = await page.locator(`${BAND} p`).first().textContent()
  const finalStatus = await page.locator(STATUS).getAttribute('data-run-status')
  check('R6', '새로고침 없이 "검사 완료" 로 바뀌고 측정 시각이 새것이다', done && afterLabel !== beforeLabel,
    `상태 ${finalStatus} · ${beforeLabel} → ${afterLabel}`)

  // 5) 새 판 직후 설명을 고쳐도(측정을 예약하지 않는 쓰기) 그 판을 잰다 — 업로드 측정이 SUPERSEDED 로
  //    건너뛰어도 자기가 마지막 시작이면 바로 잰다. 전에는 아무도 안 재고 2분 뒤 가짜 시간 초과가 떴다
  const v3 = await addVersion(token, doc, 'e2e_실행상태_v0.3.txt', 'v3 FN-AIM-001-01')
  // 예약 시각 + 500ms(CLOCK_MARGIN_MS) 안의 쓰기는 "더 새 변경" 으로 안 친다 — 그 뒤, 5초 대기 안에 고친다.
  // (이걸 안 두면 PATCH 가 여유에 묻혀 건너뛰기 경로를 안 타고도 통과한다 — 2026-09-28 실제로 그랬다)
  await new Promise((r) => setTimeout(r, 1500))
  const patch = await fetch(`${APP}/api/documents/${doc}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: `dms_session=${token}` },
    body: JSON.stringify({ description: 'E2E 가 5초 안에 고친 설명' }),
  })
  let measuredV3 = null
  let runAfter = null
  const deadline = Date.now() + 40_000
  while (Date.now() < deadline) {
    runAfter = await withDb(async (c) => (await c.query(`select finished_at, ok, reason from consistency_run where id = 'main'`)).rows[0])
    measuredV3 = await withDb(async (c) => (await c.query(
      `select d.dms_version from consistency_snapshot_docs d join consistency_snapshots s on s.id = d.snapshot_id
        where d.key = $1 and s.created_at >= $2::timestamp order by s.measured_at desc limit 1`,
      [TEST_KEY, since.toISOString()])).rows[0]?.dms_version ?? null)
    if (runAfter?.finished_at && measuredV3 === 3) break
    await new Promise((r) => setTimeout(r, 1000))
  }
  check('R8', '새 판 직후 설명을 고쳐도 그 판(versionNo 3)을 재고 검사 완료로 끝난다',
    v3 === 201 && patch.status === 200 && measuredV3 === 3 && runAfter?.ok === true,
    `업로드 ${v3} · PATCH ${patch.status} · 잰 판 ${measuredV3} · 상태 ok=${runAfter?.ok} ${runAfter?.reason ?? ''}`)

  // 메인에 더해진 조회 1회의 비용 — 스냅샷 조회 뒤에 차례로 나가므로 이만큼 메인이 늦어진다
  const samples = []
  await withDb(async (c) => {
    for (let i = 0; i < 10; i++) {
      const t = performance.now()
      await c.query(`select started_at, finished_at, ok, reason from consistency_run where id = 'main'`)
      samples.push(performance.now() - t)
    }
  })
  samples.sort((a, b) => a - b)
  const median = samples[5]
  check('R7', '상태 조회 1회 지연 실측 (dev DB, 로컬에서)', Number.isFinite(median), `중앙값 ${median.toFixed(1)}ms · 최대 ${samples[9].toFixed(1)}ms`)
} catch (err) {
  console.error('중단:', err)
} finally {
  await browser.close()
  const removed = await withDb(async (c) =>
    (await c.query('delete from consistency_snapshots where created_at >= $1::timestamp returning id', [since.toISOString()])).rowCount,
  )
  for (const id of created) await purgeDocument(id)
  if (runBefore !== undefined) {
    await withDb((c) =>
      runBefore
        ? c.query(
            `update consistency_run set run_id = $1, started_at = $2, finished_at = $3, ok = $4, reason = $5 where id = 'main'`,
            [runBefore.run_id, runBefore.started_at, runBefore.finished_at, runBefore.ok, runBefore.reason],
          )
        : c.query(`delete from consistency_run where id = 'main'`),
    )
  }
  if (refreshBefore !== undefined) {
    await withDb((c) =>
      refreshBefore
        ? c.query(`update consistency_refresh set attempted_at = $1 where id = 'main'`, [refreshBefore.attempted_at])
        : c.query(`delete from consistency_refresh where id = 'main'`),
    )
  }
  console.log(`정리: 스냅샷 ${removed}건 · 문서 ${created.length}건 · 실행 상태·시도 시각 되돌림`)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${EXPECTED_CHECKS} 통과`)
process.exit(results.length === EXPECTED_CHECKS && failed.length === 0 ? 0 : 1)
