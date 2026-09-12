/**
 * `POST /api/consistency` 실제 왕복 검증.
 *
 * 전제: `npm run dev`(3002) + 실제 .env (dev 브랜치).
 * 실행:  node --env-file=.env test/e2e/consistency.mjs
 *
 * **가짜 응답으로 계약을 고정하지 않는 것이 이 파일의 존재 이유다.** 정합성 저장소가
 * 2026-09-08 에 `NextResponse.redirect()` 를 302 로 못박았다가 실제로는 307 인 것을
 * 놓쳤고, 단위 테스트가 자기들이 만든 302 응답으로 통과해서 영영 안 드러났다.
 * 여기서는 진짜 서버에 진짜 크기의 본문을 쏜다.
 *
 * 라우트 단위 테스트(`route.test.ts`)가 덮지 못하는 것만 본다 — 본문 크기 · 실제 상태코드 ·
 * 중첩 create 가 정말 177행을 한 번에 넣는가 · 재전송이 정말 409 인가.
 */
import { APP, mintSession, withDb } from './helpers.mjs'

const EXPECTED_CHECKS = 8

const results = []
const check = (id, desc, pass, detail = '') => {
  results.push({ id, desc, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${desc}${detail ? ` — ${detail}` : ''}`)
}

/** 이 스위트가 쓰는 측정 시각. 실데이터와 안 겹치게 미래로 둔다 — 지울 때 신원이 된다. */
const MEASURED_AT = '2099-09-11T20:31:00+09:00'

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

/** 실측 분포와 같은 건수로 만든다 — error 14 · warning 107 · unresolved 28 = 149. */
function buildFindings() {
  const out = []
  const push = (level, check, n) => {
    for (let i = 1; i <= n; i++) {
      out.push({
        level,
        check,
        doc: `SCR-${String(i % 9).padStart(3, '0')}`,
        refId: `SCR-HLT-${String(i).padStart(3, '0')}`,
        where: `SCR-COM-${String(i).padStart(3, '0')}@블록${i % 7}`,
        message: `${check} 검사에서 걸린 항목입니다 (자동검증 ${i}번)`,
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

const DOCS = Array.from({ length: 19 }, (_, i) => ({
  key: `KEY-${String(i + 1).padStart(3, '0')}`,
  ver: '0.6',
  // 실제 문서 id 가 아니어도 된다 — FK 가 없는 것이 사양이다(문서는 하드 삭제된다).
  dmsId: `cm_probe_${String(i + 1).padStart(3, '0')}`,
  dmsVersion: (i % 4) + 1,
}))

const findings = buildFindings()
const payload = {
  measuredAt: MEASURED_AT,
  reqVer: '0.6',
  counts: { errors: 14, warnings: 107, pending: 0, unresolved: 28 },
  metrics: METRICS,
  findings,
  docs: DOCS,
}

const token = (await mintSession()).token
const H = { 'Content-Type': 'application/json', Cookie: `dms_session=${token}` }
const send = (body, headers = H) =>
  fetch(`${APP}/api/consistency`, { method: 'POST', headers, body: JSON.stringify(body) })

const rows = (sql, params) => withDb(async (c) => (await c.query(sql, params)).rows)
const ourSnapshots = () =>
  rows('select id from consistency_snapshots where measured_at = $1::timestamptz', [MEASURED_AT])

let snapshotId = null

try {
  const bytes = Buffer.byteLength(JSON.stringify(payload))
  check('K0', '페이로드가 실측 규모다 (findings 149 · 20KB 이상)',
        findings.length === 149 && bytes > 20000, `${findings.length}건 · ${(bytes / 1024).toFixed(1)}KB`)

  // ── K1 세션 없이 보내면 막힌다. 프록시가 먼저 잡으므로 라우트까지 안 간다.
  const noAuth = await send(payload, { 'Content-Type': 'application/json' })
  check('K1', '쿠키 없이 보내면 401 이다', noAuth.status === 401, `status=${noAuth.status}`)

  // ── K2 실제 크기 본문이 201 로 들어간다 (Vercel 본문 제한은 4.5MB 라 dev 도 여유가 있다)
  const ok = await send(payload)
  const body = await ok.json().catch(() => null)
  snapshotId = body?.id ?? null
  check('K2', '25KB급 본문이 201 + id 를 받는다', ok.status === 201 && typeof snapshotId === 'string',
        `status=${ok.status} id=${snapshotId}`)

  // ── K3 177행이 한 번에 들어갔다
  const [snap] = await rows(
    `select s.id,
            (select count(*)::int from consistency_metrics m where m.snapshot_id = s.id) metrics,
            (select count(*)::int from consistency_findings f where f.snapshot_id = s.id) findings,
            (select count(*)::int from consistency_snapshot_docs d where d.snapshot_id = s.id) docs,
            s.error_count, s.warning_count, s.unresolved_count, s.req_ver
       from consistency_snapshots s where s.id = $1`, [snapshotId])
  check('K3', '스냅샷 1 + metrics 9 + findings 149 + docs 19 = 177행',
        snap?.metrics === 9 && snap?.findings === 149 && snap?.docs === 19,
        `metrics=${snap?.metrics} findings=${snap?.findings} docs=${snap?.docs}`)

  // ── K4 counts 가 그대로 저장됐다
  check('K4', 'counts 가 보낸 값 그대로다',
        snap?.error_count === 14 && snap?.warning_count === 107 && snap?.unresolved_count === 28,
        `${snap?.error_count}/${snap?.warning_count}/${snap?.unresolved_count} reqVer=${snap?.req_ver}`)

  // ── K5 from/to 가 null 인 축 4개가 전부 살아 있다. 포스트그레스 유일 인덱스는 NULL 을
  //     서로 다른 값으로 보므로 DB 는 이 중복을 안 막는다 — 막는 것은 lib 의 검사다.
  const nullAxes = await rows(
    `select axis from consistency_metrics where snapshot_id = $1 and from_kind is null order by axis`,
    [snapshotId])
  check('K5', 'from/to 가 null 인 축 4개가 전부 저장됐다', nullAxes.length === 4,
        nullAxes.map((r) => r.axis).join(', '))

  // ── K6 같은 measuredAt 재전송은 409 다 (스크립트가 두 번 돌아도 두 행이 안 된다)
  const again = await send(payload)
  const dupCount = (await ourSnapshots()).length
  check('K6', '같은 measuredAt 을 다시 보내면 409 이고 행이 안 는다',
        again.status === 409 && dupCount === 1, `status=${again.status} 행=${dupCount}`)

  // ── K7 counts 가 어긋나면 400 이고 아무것도 안 들어간다 (본문이 잘려 도착한 경우)
  const truncated = { ...payload, measuredAt: '2099-09-12T20:31:00+09:00', findings: findings.slice(0, 10) }
  const bad = await send(truncated)
  const leaked = await rows('select id from consistency_snapshots where measured_at = $1::timestamptz',
                            ['2099-09-12T20:31:00+09:00'])
  check('K7', '잘린 본문은 400 이고 반쪽 스냅샷이 안 남는다',
        bad.status === 400 && leaked.length === 0, `status=${bad.status} 남은행=${leaked.length}`)
} finally {
  // 스냅샷을 지우면 cascade 로 자식 3테이블이 따라 지워진다.
  const removed = await withDb(async (c) => {
    const r = await c.query(
      `delete from consistency_snapshots where measured_at in ($1::timestamptz, $2::timestamptz) returning id`,
      [MEASURED_AT, '2099-09-12T20:31:00+09:00'])
    return r.rows.length
  })
  const orphans = await withDb(async (c) =>
    (await c.query('select count(*)::int n from consistency_findings')).rows[0].n)
  console.log(`\n정리: 스냅샷 ${removed}건 삭제 · 남은 findings 행 ${orphans}개`)

  const pass = results.filter((r) => r.pass).length
  const missing = EXPECTED_CHECKS - results.length
  if (missing > 0) console.log(`!! 검사 ${missing}건이 실행되지 않았다 — 중간에 죽었다는 뜻이다.`)
  console.log(`===== ${pass}/${EXPECTED_CHECKS} PASS =====`)
  process.exitCode = pass === EXPECTED_CHECKS ? 0 : 1
}
