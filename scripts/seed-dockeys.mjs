// 문서에 docKey 를 심는다. **docKey 를 바꾸는 유일한 길**이다 — 화면은 없다(2026-09-27 사람 결정).
// 관리자가 요청하면 세션이 계획 파일을 만들어 dry-run 을 보여 주고, 확인받은 뒤 --apply 한다.
// 스크립트는 측정을 예약하지 못한다(`after()` 는 요청 안에서만 돈다) — 다음 업로드 때 새 매핑으로 잰다.
//
//   node --env-file=.env scripts/seed-dockeys.mjs --plan <계획.json> [--apply] [--out <스냅샷>]
//
// 계획 형식: { "REQ": "<문서 id>", "SCR-ACC": "<문서 id>", … }
//
// --apply 가 없으면 dry-run 이다. 적용 전 상태를 스냅샷으로 남긴다 — 되돌릴 때는
// 스냅샷의 `before` 를 계획으로 다시 넣으면 된다(키를 뗀 문서는 따로 null 로 돌려야 한다).
//
// **계획이 id 를 직접 적는 이유**: 파일명·판번호로 "어느 문서가 SCR-ACC 인가" 를 고르면
// 틀린다(2026-09-10 에 세 번 틀렸다). 사람이 고른 id 를 그대로 받는다.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const DOC_KEY_RE = /^(?:REQ|(?:SCR|FN)-[A-Z]{3})$/

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const planPath = argv[argv.indexOf('--plan') + 1]
const outFlag = argv.indexOf('--out')
if (!argv.includes('--plan') || !planPath) {
  console.error('--plan <계획.json> 이 필요합니다')
  process.exit(2)
}

const plan = JSON.parse(await readFile(planPath, 'utf8'))
const entries = Object.entries(plan)
const problems = []
const seenIds = new Map()
for (const [key, id] of entries) {
  if (!DOC_KEY_RE.test(key)) problems.push(`docKey 모양이 아닙니다: ${key}`)
  if (typeof id !== 'string' || !id) problems.push(`${key}: 문서 id 가 비었습니다`)
  if (seenIds.has(id)) problems.push(`${id} 에 키가 둘입니다: ${seenIds.get(id)} · ${key}`)
  seenIds.set(id, key)
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  const ids = entries.map(([, id]) => id)
  const keys = entries.map(([key]) => key)
  const { rows: targets } = await client.query(
    `select d.id, d.title, d.doc_key, d.deleted_at,
            (select v.version_no from document_versions v where v.document_id = d.id order by v.version_no desc limit 1) as version_no,
            (select v.file_name from document_versions v where v.document_id = d.id order by v.version_no desc limit 1) as file_name
       from documents d where d.id = any($1)`,
    [ids],
  )
  const byId = new Map(targets.map((row) => [row.id, row]))
  // 계획에 없는 문서가 그 키를 들고 있으면 옮겨야 한다 — 유일 제약이 막는다
  const { rows: holders } = await client.query(
    `select id, title, doc_key from documents where doc_key = any($1) and not (id = any($2))`,
    [keys, ids],
  )

  console.log(`대상 DB: ${new URL(process.env.DATABASE_URL).hostname}`)
  console.log(`계획 ${entries.length}건 · ${apply ? '적용' : 'dry-run'}\n`)
  for (const [key, id] of entries) {
    const row = byId.get(id)
    if (!row) {
      problems.push(`${key}: 문서가 없습니다 (${id})`)
      console.log(`  ${key.padEnd(8)} ${id}  (없음)`)
      continue
    }
    if (row.deleted_at) problems.push(`${key}: 휴지통 문서입니다 (${id})`)
    const change = row.doc_key === key ? '그대로' : `${row.doc_key ?? '-'} → ${key}`
    console.log(`  ${key.padEnd(8)} ${id}  v${row.version_no}  ${row.file_name}  [${change}]`)
  }
  for (const holder of holders) {
    console.log(`  ${holder.doc_key.padEnd(8)} ${holder.id}  ${holder.title}  [${holder.doc_key} → - (계획의 다른 문서로 옮김)]`)
  }

  if (problems.length) {
    console.error('\n멈춥니다:')
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(2)
  }
  if (!apply) {
    console.log('\n--apply 를 안 줬습니다 — 쓰지 않았습니다')
    process.exit(0)
  }

  const snapshot = {
    at: new Date().toISOString(),
    host: new URL(process.env.DATABASE_URL).hostname,
    before: Object.fromEntries(
      [...targets, ...holders].filter((row) => row.doc_key).map((row) => [row.doc_key, row.id]),
    ),
    plan,
  }
  const out = outFlag >= 0 ? argv[outFlag + 1] : `runs/dockeys-${snapshot.at.replace(/[:.]/g, '-')}.json`
  await mkdir(path.dirname(out), { recursive: true })
  await writeFile(out, JSON.stringify(snapshot, null, 1) + '\n')

  await client.query('begin')
  // 먼저 전부 떼고 붙인다 — 두 문서가 키를 맞바꾸는 계획이면 순서대로 붙이다가 유일 제약에 걸린다
  await client.query(`update documents set doc_key = null where doc_key = any($1) or id = any($2)`, [keys, ids])
  for (const [key, id] of entries) {
    await client.query(`update documents set doc_key = $1 where id = $2`, [key, id])
  }
  await client.query('commit')
  console.log(`\n적용했습니다. 이전 상태: ${out}`)
} catch (err) {
  await client.query('rollback').catch(() => {})
  throw err
} finally {
  await client.end()
}
