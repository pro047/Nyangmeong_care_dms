/**
 * dev 에 정합성 측정 1건을 심는다 — **눈으로 보려고 쓰는 것이다.**
 *
 * 실행:  node --env-file=.env scripts/seed-consistency.mjs
 * 지우기: node --env-file=.env scripts/seed-consistency.mjs --clear
 *
 * E2E(`test/e2e/consistency-view.mjs`)는 자기 데이터를 지우고 끝나므로 화면을 띄워 두고
 * 보려면 따로 심어야 한다. 값은 **2026-09-11 실측 그대로**다 — 축 9개 · findings 149건 ·
 * 문서 19건. 그래야 화면에서 보는 숫자가 저쪽 보고서와 대조된다.
 *
 * **운영에 쓰지 말 것.** 대상 DB 를 실행 전에 찍는다 — `ep-aged-king` 이 아니면 멈춘다.
 * (`APP=` 를 `APP_URL` 로 잘못 넘겨 로컬을 치고 DB 만 운영을 본 사고가 있었다.)
 */
import { APP, mintSession, withDb } from '../test/e2e/helpers.mjs'

const MEASURED_AT = '2026-09-11T20:14:48+09:00'
const DEV_HOST = 'ep-aged-king'

const host = (process.env.DATABASE_URL ?? '').split('@')[1]?.split('/')[0] ?? '?'
console.log(`■ 대상 APP : ${APP}`)
console.log(`■ 대상 DB  : ${host}`)
if (!host.includes(DEV_HOST)) {
  console.error(`\n멈춘다 — dev(${DEV_HOST})가 아니다. 이 스크립트는 운영에 쓰는 것이 아니다.`)
  process.exit(1)
}

if (process.argv.includes('--clear')) {
  const { rowCount } = await withDb((c) =>
    c.query('delete from consistency_snapshots where measured_at = $1', [new Date(MEASURED_AT)]),
  )
  console.log(`\n지웠다: 스냅샷 ${rowCount}건 (metrics·findings·docs 는 cascade)`)
  process.exit(0)
}

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

/** check 8종의 실측 건수. 합이 149 이고 counts 체크섬과 맞아야 라우트를 통과한다. */
const CHECKS = [
  ['error', '참조', 14],
  ['warning', '참조', 37],
  ['warning', 'REQ커버리지', 25],
  ['warning', '기준REQ', 18],
  ['warning', '형식', 8],
  ['warning', '결번', 7],
  ['warning', '중복블록', 6],
  ['warning', '프레임바', 6],
  ['unresolved', 'unresolved', 28],
]

const DOC_KEYS = [
  'REQ-000', 'FN-ACC', 'FN-COM', 'FN-HLT', 'FN-MYP', 'FN-PLC', 'FN-AIM',
  'SCR-ACC', 'SCR-COM', 'SCR-HLT', 'SCR-MYP', 'SCR-PLC', 'SCR-AIM',
  'SCR-CAL', 'SCR-NTF', 'SCR-SET', 'SCR-SRC', 'SCR-STA', 'SCR-WLK',
]

const findings = []
for (const [level, check, n] of CHECKS) {
  for (let i = 1; i <= n; i++) {
    const doc = DOC_KEYS[(findings.length + i) % DOC_KEYS.length]
    findings.push({
      level,
      check,
      doc,
      refId: `${doc}-${String(i).padStart(3, '0')}`,
      where: `${doc}-${String(i).padStart(3, '0')}@블록${(i % 7) + 1}`,
      message: `${check} 검사: ${doc} 에서 확인이 필요한 항목입니다 (${i}번)`,
    })
  }
}

// 살아 있는 문서를 앞쪽 key 에 붙인다 — 링크가 걸리는 것과 안 걸리는 것을 둘 다 보려고.
const alive = await withDb((c) =>
  c.query('select id from documents where deleted_at is null order by created_at desc limit 6'),
)
const docs = DOC_KEYS.map((key, i) => ({
  key,
  ver: 'v0.5',
  dmsId: alive.rows[i]?.id ?? `합치기로-사라진-문서-${i}`,
  dmsVersion: 1,
}))

const { token } = await mintSession()
const res = await fetch(`${APP}/api/consistency`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', cookie: `dms_session=${token}` },
  body: JSON.stringify({
    measuredAt: MEASURED_AT,
    reqVer: '0.6',
    counts: { errors: 14, warnings: 107, pending: 0, unresolved: 28 },
    metrics: METRICS,
    findings,
    docs,
  }),
})

if (res.status === 409) {
  console.log('\n이미 심어져 있다 (같은 measuredAt). 다시 심으려면 --clear 먼저.')
  process.exit(0)
}
if (res.status !== 201) {
  console.error(`\n실패: ${res.status} ${await res.text()}`)
  process.exit(1)
}

console.log(`\n심었다 — findings ${findings.length}건 · 문서 ${docs.length}건 ` +
  `(링크 걸리는 것 ${alive.rows.length}건)`)
console.log(`${APP} 을 열어 볼 것. 지우려면 --clear`)
