/**
 * 업로드 → 응답 뒤 자동 측정 → 메인 밴드, 실제 왕복 검증 (정합성 이관 M3 완료 조건).
 *
 * 전제: `npm run dev`(3002) + 실제 .env (dev 브랜치) + docKey 가 심어진 dev DB.
 * 실행:  node --env-file=.env test/e2e/consistency-measure.mjs
 *
 * 단위 테스트가 못 보는 것만 본다 — `after()` 가 정말 응답 뒤에 도는가, S3 에서 실제로
 * 읽는가, 스냅샷이 저장되어 화면에 그려지는가, docKey 없는 문서는 정말 안 재는가.
 *
 * dev 에 FN-AIM 문서가 없어서(2026-09-27 실측) 테스트 문서에 그 키를 빌려 준다.
 * 끝나면 테스트 문서·S3 객체·이 스위트가 만든 스냅샷을 전부 지운다.
 */
import { APP, mintSession, purgeDocument, seedDocument, withDb } from './helpers.mjs'

const TEST_KEY = 'FN-AIM'
const EXPECTED_CHECKS = 12
const WAIT_MS = 90_000

const results = []
const check = (id, desc, pass, detail = '') => {
  results.push({ id, desc, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${desc}${detail ? ` — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function addVersion(token, documentId, fileName, body) {
  const H = { 'Content-Type': 'application/json', Cookie: `dms_session=${token}` }
  const pre = await fetch(`${APP}/api/documents/presign`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ fileName, contentType: 'text/plain', size: body.length }),
  })
  if (!pre.ok) throw new Error(`presign ${pre.status} ${await pre.text()}`)
  const { key, url, keyToken } = await pre.json()
  const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body })
  if (!put.ok) throw new Error(`S3 PUT ${put.status}`)
  const started = Date.now()
  const res = await fetch(`${APP}/api/documents/${documentId}/versions`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ s3Key: key, keyToken, fileName, mimeType: 'text/plain' }),
  })
  return { status: res.status, ms: Date.now() - started, body: await res.json().catch(() => null) }
}

const snapshotsSince = (since) =>
  withDb(async (c) => {
    const { rows } = await c.query(
      `select s.id, s.measured_at, s.req_ver, s.error_count, s.warning_count,
              (select count(*)::int from consistency_findings f where f.snapshot_id = s.id) findings,
              (select count(*)::int from consistency_metrics m where m.snapshot_id = s.id) metrics
         from consistency_snapshots s where s.created_at >= $1::timestamp order by s.measured_at`,
      [since.toISOString()],
    )
    return rows
  })

const snapshotDocs = (id) =>
  withDb(async (c) => (await c.query('select key, dms_id, dms_version from consistency_snapshot_docs where snapshot_id = $1', [id])).rows)

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

// created_at 은 timestamp(UTC 벽시계)다 — toISOString() 과 ::timestamp 로 맞춘다(helpers.mjs 참조)
const since = new Date(Date.now() - 1000)
const created = []

try {
  const holder = await withDb(async (c) => (await c.query('select id from documents where doc_key = $1', [TEST_KEY])).rows)
  if (holder.length) throw new Error(`${TEST_KEY} 를 이미 쓰는 문서가 있다: ${holder[0].id} — 다른 빈 키로 바꿀 것`)
  const keyed = await withDb(async (c) => (await c.query('select count(*)::int n from documents where doc_key is not null')).rows[0].n)

  const { token } = await mintSession()
  const keyedDoc = await seedDocument(token, { title: 'E2E 정합성 측정', fileName: 'e2e_측정_v0.1.txt', body: 'v1 FN-AIM-001-01' })
  created.push(keyedDoc)
  await withDb((c) => c.query('update documents set doc_key = $1 where id = $2', [TEST_KEY, keyedDoc]))
  const plainDoc = await seedDocument(token, { title: 'E2E 정합성 측정 대조군', fileName: 'e2e_대조군_v0.1.txt', body: 'plain' })
  created.push(plainDoc)

  // 1) docKey 없는 문서에 새 판 — 측정이 돌면 안 된다
  const plain = await addVersion(token, plainDoc, 'e2e_대조군_v0.2.txt', 'plain v2')
  await sleep(8000)
  const afterPlain = await snapshotsSince(since)
  check('C1', 'docKey 없는 문서의 새 판은 측정하지 않는다', plain.status === 201 && afterPlain.length === 0,
    `status=${plain.status} 새 스냅샷=${afterPlain.length}`)

  // 2) docKey 문서에 새 판 — 응답은 측정을 기다리지 않는다
  const keyedRes = await addVersion(token, keyedDoc, 'e2e_측정_v0.2.txt', 'v2 FN-AIM-001-01 FN-AIM-001-03')
  check('C2', 'docKey 문서의 새 판 업로드가 201', keyedRes.status === 201, `status=${keyedRes.status} ${keyedRes.ms}ms`)

  const snaps = await waitForSnapshot(since, 1)
  const snap = snaps[0]
  check('C3', '사람 손 없이 새 스냅샷이 생긴다', snaps.length === 1,
    snap ? `${snaps.length}건 · errors ${snap.error_count} · warnings ${snap.warning_count} · findings ${snap.findings} · metrics ${snap.metrics} · reqVer ${snap.req_ver}` : '0건')

  const docs = snap ? await snapshotDocs(snap.id) : []
  const mine = docs.find((d) => d.key === TEST_KEY)
  check('C4', '방금 올린 판(versionNo 2)으로 쟀다', mine?.dms_id === keyedDoc && mine?.dms_version === 2,
    JSON.stringify(mine ?? null))
  check('C5', 'docKey 문서 전체를 같이 쟀다 (올라온 문서 하나가 아니다)', docs.length === keyed + 1,
    `스냅샷 문서 ${docs.length} · docKey 문서 ${keyed + 1}`)
  check('C6', '측정이 저장 계약을 통과했다 (축·발견 항목이 들어갔다)', !!snap && snap.metrics >= 6 && snap.findings > 0,
    snap ? `metrics ${snap.metrics} findings ${snap.findings}` : '')

  const unassigned = snap
    ? await withDb(async (c) => (await c.query(
        `select f.doc from consistency_findings f where f.snapshot_id = $1 and f."check" = '파싱'
            and f.doc in (select k.key from doc_keys k where not exists (select 1 from documents d where d.doc_key = k.key))`,
        [snap.id])).rows.map((r) => r.doc))
    : []
  const expectedUnassigned = await withDb(async (c) => (await c.query(
    'select key from doc_keys k where not exists (select 1 from documents d where d.doc_key = k.key)')).rows.map((r) => r.key))
  check('C8', '문서가 안 달린 키는 조용히 빠지지 않고 파싱 error 로 나온다',
    expectedUnassigned.length > 0 && unassigned.sort().join() === expectedUnassigned.sort().join(), `키 ${expectedUnassigned.join(',')} · 보고 ${unassigned.join(',')}`)

  // 3) 메인 밴드가 그 측정을 그린다
  const page = await fetch(`${APP}/`, { headers: { Cookie: `dms_session=${token}` } })
  const html = await page.text()
  const label = snap ? formatDateTime(new Date(snap.measured_at)) : '(없음)'
  check('C7', '메인 밴드가 새 측정 시각을 그린다', page.status === 200 && html.includes(label), `찾은 표기 "${label}"`)

  // 4) 연달아 올리면 한 번만 잰다 — 5초 안의 변경은 마지막 것의 측정이 합쳐서 잰다
  await addVersion(token, keyedDoc, 'e2e_측정_v0.3.txt', 'v3')
  await addVersion(token, keyedDoc, 'e2e_측정_v0.4.txt', 'v4')
  await sleep(15_000)
  const burst = await snapshotsSince(since)
  const burstDocs = burst.length === 2 ? await snapshotDocs(burst[1].id) : []
  const burstMine = burstDocs.find((d) => d.key === TEST_KEY)
  check('C12', '연달아 두 번 올리면 스냅샷은 하나이고 마지막 판(versionNo 4)을 쟀다',
    burst.length === 2 && burstMine?.dms_version === 4, `새 스냅샷 ${burst.length - 1}건 · 잰 판 ${burstMine?.dms_version}`)

  // 5) 삭제 · 복구 · 영구삭제도 다시 잰다 — 각 단계의 최신 스냅샷에서 이 키가 무슨 이유로 빠졌는지 본다
  const H = { Cookie: `dms_session=${token}` }
  const latestReason = async (count) => {
    const rows = await waitForSnapshot(since, count)
    const last = rows.at(-1)
    if (!last || rows.length < count) return `(스냅샷 ${rows.length}건)`
    return withDb(async (c) => (await c.query(
      `select message from consistency_findings where snapshot_id = $1 and "check" = '파싱' and doc = $2`,
      [last.id, TEST_KEY])).rows[0]?.message ?? '(없음)')
  }
  const trash = await fetch(`${APP}/api/documents/${keyedDoc}`, { method: 'DELETE', headers: H })
  const afterTrash = await latestReason(3)
  check('C9', '휴지통에 넣으면 다시 재고 그 키는 휴지통 사유로 나온다', trash.status === 200 && afterTrash.includes('휴지통'), afterTrash)

  const restore = await fetch(`${APP}/api/documents/${keyedDoc}/restore`, { method: 'POST', headers: H })
  const afterRestore = await latestReason(4)
  // 테스트 문서는 .txt 라 FN 키의 형식(.xlsx)과 다르다 — 복구 뒤에는 형식 검사 사유로 바뀌어야 한다
  check('C10', '복구하면 다시 재고 (이 문서는 형식이 달라) 형식 사유로 나온다', restore.status === 200 && afterRestore.includes('형식이'), afterRestore)

  await fetch(`${APP}/api/documents/${keyedDoc}`, { method: 'DELETE', headers: H })
  await waitForSnapshot(since, 5)
  const purge = await fetch(`${APP}/api/documents/${keyedDoc}/purge`, { method: 'DELETE', headers: H })
  const afterPurge = await latestReason(6)
  check('C11', '영구삭제하면 다시 재고 그 키는 문서 없음으로 나온다', purge.status === 200 && afterPurge.includes('지정된 문서가 없다'), afterPurge)
} catch (err) {
  console.error('중단:', err)
} finally {
  const removed = await withDb(async (c) =>
    (await c.query('delete from consistency_snapshots where created_at >= $1::timestamp returning id', [since.toISOString()])).rowCount,
  )
  for (const id of created) await purgeDocument(id)
  console.log(`정리: 스냅샷 ${removed}건 · 문서 ${created.length}건`)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${EXPECTED_CHECKS} 통과`)
process.exit(results.length === EXPECTED_CHECKS && failed.length === 0 ? 0 : 1)
