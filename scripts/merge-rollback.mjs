// merge-versions.mjs --apply 가 남긴 스냅샷으로 합치기를 되돌린다 (2026-09-22).
//
//   node --env-file=.env scripts/merge-rollback.mjs --snapshot <스냅샷.json> [--apply]
//
// --apply 가 없으면 무엇을 되돌릴지만 보여 주고 아무것도 쓰지 않는다.
//
// 스냅샷의 groups[].backup 은 합치기가 **쓰기 직전에** row_to_json 으로 뜬 행 전체다.
// 되넣을 때도 json_populate_record 로 넣는다 — 시각 컬럼이 timestamp(타임존 없음)라
// JS Date 를 거치면 9시간 밀린다(test/e2e/helpers.mjs purgeFolders 주석).
//
// **적용 뒤에 새 버전이 붙은 그룹은 되돌리지 않는다.** 백업에 없는 행이 생겼다는 뜻이고,
// 그 행을 어느 문서에 둘지는 사람이 정해야 한다(자동 새 버전이 켜져 있어 흔히 생긴다).
// S3 는 안 건드린다 — 합치기가 파일을 지우지 않으므로 DB 만 되돌리면 원상태다.
import { readFile } from 'node:fs/promises'
import pg from 'pg'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const snapFlag = argv.indexOf('--snapshot')
if (snapFlag < 0 || !argv[snapFlag + 1]) {
  console.error('--snapshot <스냅샷.json> 이 필요하다.')
  process.exit(1)
}
const snapshot = JSON.parse(await readFile(argv[snapFlag + 1], 'utf8'))
const groups = snapshot.groups.filter((g) => g.applied && g.backup)
if (groups.length === 0) {
  console.error('되돌릴 그룹이 없다 — 적용된(applied) 그룹의 백업이 스냅샷에 없다.')
  process.exit(1)
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const byId = (rows) => [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
const tagKey = (t) => `${t.document_id}|${t.tag_id}`

/** 지금 DB 의 행을 백업과 같은 모양(row_to_json)으로 읽는다. 대조는 이 모양끼리만 한다. */
async function current(docIds) {
  const q = async (sql) => (await client.query(sql, [docIds])).rows.map((r) => r.row)
  return {
    documents: await q(`select row_to_json(d) as row from documents d where d.id = any($1::text[])`),
    versions: await q(`select row_to_json(v) as row from document_versions v where v.document_id = any($1::text[])`),
    tags: await q(`select row_to_json(t) as row from document_tags t where t.document_id = any($1::text[])`),
  }
}

const report = []
let restored = 0
let refused = 0
let mismatched = 0

for (const g of groups) {
  const { documents, versions, tags } = g.backup
  const docIds = documents.map((d) => d.id)
  const dropped = documents.filter((d) => d.id !== g.keepId)
  const keep = documents.find((d) => d.id === g.keepId)
  const now = await current(docIds)

  const problems = []
  const existing = new Set(now.documents.map((d) => d.id))
  if (!existing.has(g.keepId)) problems.push('남은 문서가 없다')
  if (dropped.some((d) => existing.has(d.id))) problems.push('지운 문서가 이미 다시 있다 — 되돌린 적이 있는가')
  const backupVersionIds = new Set(versions.map((v) => v.id))
  const nowVersionIds = new Set(now.versions.map((v) => v.id))
  const extra = [...nowVersionIds].filter((id) => !backupVersionIds.has(id))
  const missing = [...backupVersionIds].filter((id) => !nowVersionIds.has(id))
  if (extra.length > 0) problems.push(`적용 뒤에 새 버전 ${extra.length}개가 붙었다`)
  if (missing.length > 0) problems.push(`백업의 버전 ${missing.length}개가 사라졌다`)

  // 합친 뒤 사람이 남은 문서를 고쳤으면 되돌리지 않는다(2026-09-22 코드 리뷰). 되돌리기는 제목·
  // 설명·태그를 백업 값으로 되쓰므로, 고친 것을 **조용히 덮는다** — 그리고 끝의 대조도 백업과
  // 비교하니 "같다"가 찍혀 손실이 안 보인다. 사람이 고친 제목은 덮지 않는다(CLAUDE.md).
  const keepNow = now.documents.find((d) => d.id === g.keepId)
  if (keep && keepNow) {
    const expectedTitle = g.retitle ? g.retitle.to : keep.title
    if (keepNow.title !== expectedTitle) problems.push(`합친 뒤 제목이 바뀌었다: "${keepNow.title}"`)
    if (keepNow.description !== keep.description) problems.push('합친 뒤 설명이 바뀌었다')
    if (keepNow.folder_id !== keep.folder_id) problems.push('합친 뒤 폴더가 바뀌었다')
  }
  // 태그: 지금 남은 문서의 태그 = 원래 태그 ∪ 합치기가 옮겨 온 태그여야 한다. 다르면 사람이 만졌다.
  const keepTagsBefore = tags.filter((t) => t.document_id === g.keepId).map((t) => t.tag_id)
  const expectedTags = [...new Set([...keepTagsBefore, ...(g.movingTags ?? [])])].sort()
  const nowKeepTags = now.tags.filter((t) => t.document_id === g.keepId).map((t) => t.tag_id).sort()
  if (JSON.stringify(nowKeepTags) !== JSON.stringify(expectedTags)) problems.push('합친 뒤 태그가 바뀌었다')

  const label = keep?.title ?? g.keepId
  if (problems.length > 0) {
    refused++
    report.push(`[되돌리지 않음] ${label}\n   이유: ${problems.join(' / ')}`)
    continue
  }
  report.push(`[되돌림] ${label} — 문서 ${dropped.length}건 복원 · 버전 ${versions.length}개 원위치`)

  if (!apply) continue

  try {
    await client.query('begin')
    for (const d of dropped) {
      await client.query(`insert into documents select * from json_populate_record(null::documents, $1::json)`, [
        JSON.stringify(d),
      ])
    }
    // (document_id, version_no) 유일 제약을 피해 임시 음수로 뺀 뒤 제자리로 보낸다 — 합치기와 같은 수.
    for (const [i, v] of versions.entries()) {
      await client.query(`update document_versions set version_no = $1 where id = $2`, [-(i + 1), v.id])
    }
    for (const v of versions) {
      await client.query(`update document_versions set document_id = $1, version_no = $2 where id = $3`, [
        v.document_id,
        v.version_no,
        v.id,
      ])
    }
    // 남은 문서는 제목·설명만 바뀌었을 수 있다. 행 전체를 백업 값으로 되쓴다.
    await client.query(
      `update documents d set title = r.title, description = r.description, updated_at = r.updated_at
         from json_populate_record(null::documents, $1::json) r where d.id = r.id`,
      [JSON.stringify(keep)],
    )
    // 태그: 합치기가 남은 문서로 **옮겨 온 연결만** 걷고 원래 연결을 되넣는다. 위 점검으로
    // 지금 태그 = 원래 ∪ 옮겨 온 것임을 확인했으니, 옮겨 온 것 중 원래 없던 것만 지운다.
    const keepTags = new Set(keepTagsBefore)
    const added = (g.movingTags ?? []).filter((tagId) => !keepTags.has(tagId))
    await client.query(`delete from document_tags where document_id = $1 and tag_id = any($2::text[])`, [
      g.keepId,
      added,
    ])
    for (const t of tags) {
      await client.query(
        `insert into document_tags select * from json_populate_record(null::document_tags, $1::json) on conflict do nothing`,
        [JSON.stringify(t)],
      )
    }
    await client.query('commit')
    restored++
  } catch (err) {
    await client.query('rollback')
    refused++
    report.push(`   ✖ 실패해서 이 그룹은 손대지 않았다: ${err.message}`)
    continue
  }

  // 되돌린 결과를 백업과 행 단위로 대조한다. 같아야 "되돌렸다"고 말할 수 있다.
  const after = await current(docIds)
  const same =
    JSON.stringify(byId(after.documents)) === JSON.stringify(byId(documents)) &&
    JSON.stringify(byId(after.versions)) === JSON.stringify(byId(versions)) &&
    JSON.stringify(after.tags.map(tagKey).sort()) === JSON.stringify(tags.map(tagKey).sort())
  if (!same) mismatched++
  report.push(same ? '   ✔ 백업과 행 단위로 같다' : '   ✖ 백업과 다르다 — 스냅샷과 DB 를 직접 대조할 것')
}

await client.end()
console.log(report.join('\n'))
console.log(
  `\n${apply ? '적용함' : 'dry-run (아무것도 쓰지 않음)'} — 되돌림 ${apply ? restored : groups.length - refused}그룹 · ` +
    `되돌리지 않음 ${refused}그룹${apply ? ` · 대조 불일치 ${mismatched}그룹` : ''}`,
)
process.exitCode = refused > 0 || mismatched > 0 ? 1 : 0
