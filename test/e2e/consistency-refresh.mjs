/**
 * 메인 페이지 재측정 안전망, 실제 왕복 검증 — 업로드 없이 메인을 여는 것만으로 다시 재는가.
 *
 * 전제: `npm run dev`(3002) + 실제 .env (dev 브랜치) + docKey 가 심어진 dev DB,
 *       그리고 **최신 스냅샷과 마지막 시도(`consistency_refresh`)가 10분보다 오래됐을 것**(쿨다운 안이면 시작하지 않는다).
 *       브라우저로 dev 메인을 열어 두지 말 것 — 그 방문도 측정을 예약한다.
 * 실행:  node --env-file=.env test/e2e/consistency-refresh.mjs
 *
 * `consistency-measure.mjs` 와 파일을 나눈 이유: 그쪽이 끝나면서 자기 스냅샷을 지워 최신 스냅샷이
 * 바뀌므로, 같은 파일에 두면 여기의 쿨다운 전제가 흔들린다.
 *
 * 키는 스크립트처럼 SQL 로 단다 — 스크립트는 `after()` 를 못 부른다는 것이 이 안전망의 존재 이유다.
 * 끝나면 테스트 문서·S3 객체·이 스위트가 만든 스냅샷을 지우고 마지막 시도 시각을 시작 전 값으로 되돌린다.
 */
import { APP, mintSession, purgeDocument, seedDocument, withDb } from './helpers.mjs'

const TEST_KEY = 'FN-AIM'
const EXPECTED_CHECKS = 6
const WAIT_MS = 90_000
// 대기 5초 + 측정 수 초 — 이만큼 지나도 안 생기면 예약하지 않은 것이다
const QUIET_CHECK_MS = 20_000

const results = []
const check = (id, desc, pass, detail = '') => {
  results.push({ id, desc, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${desc}${detail ? ` — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const snapshotsSince = (since) =>
  withDb(async (c) => (await c.query(
    'select id, measured_at from consistency_snapshots where created_at >= $1::timestamp order by measured_at',
    [since.toISOString()],
  )).rows)

async function waitForSnapshot(since, count) {
  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    const rows = await snapshotsSince(since)
    if (rows.length >= count) return rows
    await sleep(1000)
  }
  return snapshotsSince(since)
}

const formatDateTime = (date) =>
  date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

// 판정 함수가 비교하는 것과 같은 집합 — 활성 · 버전 있는 docKey 문서의 최신판
const currentMapping = () =>
  withDb(async (c) => (await c.query(
    `select d.doc_key key, d.id dms_id, max(v.version_no)::int dms_version
       from documents d join document_versions v on v.document_id = d.id
      where d.doc_key is not null and d.deleted_at is null
      group by d.id order by d.doc_key`,
  )).rows)

const snapshotMapping = (id) =>
  withDb(async (c) => (await c.query(
    'select key, dms_id, dms_version from consistency_snapshot_docs where snapshot_id = $1 order by key', [id],
  )).rows)

const COOLDOWN_MS = 10 * 60 * 1000

// 쿨다운(src/lib/consistency-refresh.ts 의 REFRESH_COOLDOWN_MS)보다 1분 더 전으로 돌린다
const expireClaim = () =>
  withDb((c) => c.query(
    `update consistency_refresh set attempted_at = now() - make_interval(secs => $1) where id = 'main'`,
    [COOLDOWN_MS / 1000 + 60],
  ))

const deleteSnapshotsSince = (since) =>
  withDb(async (c) =>
    (await c.query('delete from consistency_snapshots where created_at >= $1::timestamp returning id', [since.toISOString()])).rowCount,
  )

// created_at 은 timestamp(UTC 벽시계)다 — toISOString() 과 ::timestamp 로 맞춘다(helpers.mjs 참조)
const since = new Date(Date.now() - 1000)
const created = []
// 시작 전의 consistency_refresh 행. undefined = 아직 못 읽음(정리에서 건드리지 않는다), null = 행이 없었다
let claim

try {
  claim = await withDb(async (c) => (await c.query('select attempted_at from consistency_refresh where id = $1', ['main'])).rows[0] ?? null)
  const latest = await withDb(async (c) => (await c.query(
    'select measured_at from consistency_snapshots order by measured_at desc limit 1')).rows[0])
  if (latest && Date.now() - new Date(latest.measured_at).getTime() < COOLDOWN_MS) {
    throw new Error(`최신 스냅샷이 10분 안이다(${new Date(latest.measured_at).toISOString()}) — 쿨다운이 지난 뒤 다시 돌릴 것`)
  }
  if (claim && Date.now() - new Date(claim.attempted_at).getTime() < COOLDOWN_MS) {
    throw new Error(`마지막 재측정 시도가 10분 안이다(${new Date(claim.attempted_at).toISOString()}) — 쿨다운이 지난 뒤 다시 돌릴 것`)
  }
  const holder = await withDb(async (c) => (await c.query('select id from documents where doc_key = $1', [TEST_KEY])).rows)
  if (holder.length) throw new Error(`${TEST_KEY} 를 이미 쓰는 문서가 있다: ${holder[0].id} — 다른 빈 키로 바꿀 것`)

  const { token } = await mintSession()
  const H = { Cookie: `dms_session=${token}` }
  const doc = await seedDocument(token, { title: 'E2E 재측정 안전망', fileName: 'e2e_안전망_v0.1.txt', body: 'FN-AIM-001-01' })
  created.push(doc)
  await withDb((c) => c.query('update documents set doc_key = $1 where id = $2', [TEST_KEY, doc]))

  // 1) 메인을 연다 — 응답 뒤에 측정이 예약된다
  const first = await fetch(`${APP}/`, { headers: H })
  await first.text()
  const snaps = await waitForSnapshot(since, 1)
  check('R1', '업로드 없이 메인을 여는 것만으로 새 스냅샷이 생긴다', first.status === 200 && snaps.length === 1,
    `status=${first.status} 새 스냅샷=${snaps.length}`)

  const snap = snaps[0]
  const [measured, current] = snap ? await Promise.all([snapshotMapping(snap.id), currentMapping()]) : [[], []]
  check('R2', '새 스냅샷이 지금의 {키 → 문서·최신 판} 을 쟀다 (SQL 로 단 키 포함)',
    measured.length > 0 && JSON.stringify(measured) === JSON.stringify(current) && measured.some((d) => d.key === TEST_KEY),
    `스냅샷 ${measured.length}건 · 지금 ${current.length}건`)

  // 2) 다음 새로고침에 새 측정 시각이 보인다
  const second = await fetch(`${APP}/`, { headers: H })
  const html = await second.text()
  const label = snap ? formatDateTime(new Date(snap.measured_at)) : '(없음)'
  check('R3', '다음 새로고침에 새 측정 시각이 보인다', second.status === 200 && html.includes(label), `찾은 표기 "${label}"`)

  // 3) 10분 안에는 판이 달라져도 메인에서 다시 재지 않는다 — 키를 SQL 로 떼서 비교를 "다르다" 로 만든다.
  //    R1 이 잡은 시도 시각을 먼저 풀어 둔다 — 안 풀면 그쪽이 막아서 스냅샷 쪽 쿨다운이 깨져도 통과한다
  await expireClaim()
  await withDb((c) => c.query('update documents set doc_key = null where id = $1', [doc]))
  const third = await fetch(`${APP}/`, { headers: H })
  await third.text()
  await sleep(QUIET_CHECK_MS)
  const afterCooldown = await snapshotsSince(since)
  check('R4', '스냅샷이 10분 안이면 판이 달라도 예약하지 않는다 (measuredAt)', third.status === 200 && afterCooldown.length === 1,
    `새 스냅샷 ${afterCooldown.length}건 (${QUIET_CHECK_MS / 1000}초 대기)`)

  // 4) 측정이 스냅샷을 못 남긴 경우 — 스냅샷을 지워 "측정 실패" 를 흉내 낸다. 최신 스냅샷은 10분 넘은 옛 것으로
  //    돌아가고 판도 다르지만(키를 다시 단다), 방금 잡은 시도 시각이 막아야 한다
  await withDb((c) => c.query(`update consistency_refresh set attempted_at = now() where id = 'main'`))
  await withDb((c) => c.query('update documents set doc_key = $1 where id = $2', [TEST_KEY, doc]))
  await deleteSnapshotsSince(since)
  const fourth = await fetch(`${APP}/`, { headers: H })
  await fourth.text()
  await sleep(QUIET_CHECK_MS)
  const afterFailure = await snapshotsSince(since)
  check('R5', '측정이 스냅샷을 못 남겨도 10분 안에는 다시 재지 않는다 (시도 시각)', fourth.status === 200 && afterFailure.length === 0,
    `새 스냅샷 ${afterFailure.length}건 (${QUIET_CHECK_MS / 1000}초 대기)`)

  // 5) 쿨다운이 풀린 순간 세 명이 동시에 열면 한 번만 잰다
  await expireClaim()
  const burst = await Promise.all([0, 1, 2].map(() => fetch(`${APP}/`, { headers: H }).then((r) => r.text().then(() => r.status))))
  await waitForSnapshot(since, 1)
  await sleep(QUIET_CHECK_MS)
  const afterBurst = await snapshotsSince(since)
  check('R6', '동시에 세 번 열면 스냅샷은 하나다', burst.every((st) => st === 200) && afterBurst.length === 1,
    `status=${burst.join(',')} 새 스냅샷 ${afterBurst.length}건`)
} catch (err) {
  console.error('중단:', err)
} finally {
  const removed = await deleteSnapshotsSince(since)
  for (const id of created) await purgeDocument(id)
  if (claim !== undefined) await withDb((c) =>
    claim
      ? c.query('update consistency_refresh set attempted_at = $1 where id = $2', [claim.attempted_at, 'main'])
      : c.query('delete from consistency_refresh where id = $1', ['main']),
  )
  console.log(`정리: 스냅샷 ${removed}건 · 문서 ${created.length}건 · 시도 시각 ${claim === undefined ? '안 건드림' : claim ? '되돌림' : '행 삭제'}`)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${EXPECTED_CHECKS} 통과`)
process.exit(results.length === EXPECTED_CHECKS && failed.length === 0 ? 0 : 1)
