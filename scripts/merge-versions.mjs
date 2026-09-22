// 같은 문서의 여러 판이 별개 Document 로 올라와 있는 것을 한 문서의 버전으로 합친다.
// 일회성이고 UI 버튼을 만들지 않는다 — 갈라진 문서는 붙이기 기능이 들어가면 더 안 생긴다.
//
//   node --env-file=.env scripts/merge-versions.mjs --plan <계획.json> [--dry-run|--apply]
//                                                   [--out <스냅샷 경로>] [--mapping-sent]
//
// --dry-run 이 기본이다. --apply 를 명시하지 않으면 아무것도 쓰지 않는다.
//
// **되돌릴 수 없다.** 사라지는 Document 의 id 는 영영 없어진다. 정합성 저장소가 그 id 를
// manifest 에 적기 전에 돌려야 한다 — 적은 뒤에 돌리면 저쪽이 그 문서를 "DMS에 없음"으로
// 오분류한다.
//
// **--apply 는 --mapping-sent 없이는 안 돈다** (순서 계약 A, 2026-09-09 확정). 없으면
// 사라질 id → keepId 매핑을 찍고 exit 4 로 멈춘다 — 실패가 아니라 승인 대기다.
// 두 단계로 나눈 이유: 플래그 하나로는 아무것도 못 막지만, **전달해야 할 매핑을 게이트
// 자신이 만들어 주므로** 그것을 손에 넣으려면 반드시 이 화면을 한 번 읽게 된다.
// 잊는 것을 막는 장치이지 권한 장치가 아니다.
//
// 계기: 2026-09-09 운영 합치기에서 문서 id 9개가 사후 통지로 나갔다. 그때는 저쪽
// manifest 의 dms_id 가 전부 비어 있어 무해했지만, 채운 뒤였다면 자동 수급이 그 문서를
// 건너뛰고 **exit 0 으로 성공한 척** 했을 것이다 (저쪽 실측, 0909 회신 §2).
//
// 계획 파일은 판정 함수(src/lib/similar-document.ts)가 만든다. 이 스크립트는 판정하지
// 않고, 계획이 지금 DB 와 맞는지 **확인**한 뒤 적용만 한다 — 판정을 두 벌 두지 않기
// 위해서다. 계획을 만든 시점과 실행 시점 사이에 문서가 바뀌었으면 그 그룹을 건너뛴다.
//
// 계획 형식(2026-09-22 확장 — 두 번째 합치기에서 여러 버전 문서가 섞였다):
//   groups[].order[]   { id, fileName, label, versionCount }  — 오래된 문서부터
//   groups[].retitle   { from, to } | 없음  — 앱의 retitleOnReupload 가 낸 값. 없으면 제목 그대로
// versionCount·retitle 이 없는 옛 계획은 옛 동작(버전 1개 · 제목 그대로)으로 읽는다.
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const mappingSent = argv.includes('--mapping-sent')
const planFlag = argv.indexOf('--plan')
const outFlag = argv.indexOf('--out')

if (planFlag < 0 || !argv[planFlag + 1]) {
  console.error('--plan <계획.json> 이 필요하다.')
  process.exit(1)
}
const planPath = argv[planFlag + 1]
const snapshotPath =
  outFlag >= 0 && argv[outFlag + 1]
    ? argv[outFlag + 1]
    : path.join('runs', `merge-versions-${new Date().toISOString().slice(0, 19).replaceAll(':', '')}.json`)

// 스냅샷을 덮어쓰지 않는다(2026-09-22 코드 리뷰). --apply 스냅샷에는 되돌리기용 백업이 들어
// 있어서, 같은 --out 으로 dry-run 을 한 번 더 돌리면 백업 없는 파일로 바뀌고
// merge-rollback.mjs 가 "되돌릴 그룹이 없다"로 멈춘다.
if (existsSync(snapshotPath)) {
  console.error(`스냅샷 ${snapshotPath} 가 이미 있다 — 덮어쓰지 않는다. 다른 --out 을 준다.`)
  process.exit(1)
}

const plan = JSON.parse(await readFile(planPath, 'utf8'))

// 순서 계약 게이트. DB 에 붙기 전에 끊는다 — 여기서 멈출 것이면 커넥션을 쓸 이유가 없다
// (공유 인스턴스의 max_connections 가 79뿐이다).
if (apply && !mappingSent) {
  const pairs = plan.groups.flatMap((g) =>
    g.order.filter((row) => row.id !== g.keepId).map((row) => ({ ...row, keepId: g.keepId })),
  )
  console.error('┌─ 순서 계약 게이트 ─────────────────────────────────────')
  console.error('│ 아래 id 는 적용과 동시에 영영 없어진다. 정합성 저장소')
  console.error('│ (~/orca/Nyangmeong_care) 가 manifest 의 dms_id 를 keepId 로')
  console.error('│ 갱신한 **뒤에** 적용해야 한다.')
  console.error('│')
  console.error(`│ 사라질 문서 ${pairs.length}건:`)
  for (const p of pairs) console.error(`│   ${p.id}  →  ${p.keepId}   ${p.fileName}`)
  console.error('│')
  console.error('│ 전달했으면 --mapping-sent 를 붙여 다시 실행한다.')
  console.error('└───────────────────────────────────────────────────────')
  // 4 = 승인 대기. 파이프라인 종료 코드 규약과 같은 뜻이다 (실패가 아니다).
  process.exit(4)
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const snapshot = {
  plan: planPath,
  applied: apply,
  // 매핑을 전달했다고 사람이 선언한 실행인지 스냅샷에 남긴다 — 나중에 저쪽 판정이
  // 어긋났을 때 "통지가 먼저였나"를 이 파일 하나로 가릴 수 있어야 한다.
  mappingSent,
  at: new Date().toISOString(),
  groups: [],
}
const report = []
let merged = 0
let skipped = 0

for (const group of plan.groups) {
  const ids = group.order.map((row) => row.id)
  const { rows: docs } = await client.query(
    `select d.id, d.title, d.description, d.folder_id, d.created_by, d.deleted_at,
            (select count(*)::int from document_versions v where v.document_id = d.id) as version_count
     from documents d where d.id = any($1::text[])`,
    [ids],
  )

  // 계획이 낡았는지 본다. 하나라도 어긋나면 그룹 전체를 건너뛴다 — 부분 적용이
  // 제일 나쁘다(반쯤 합쳐진 문서는 사람이 상태를 읽을 수 없다).
  const problems = []
  if (docs.length !== ids.length) problems.push('문서가 사라졌거나 id 가 안 맞음')
  if (docs.some((d) => d.deleted_at !== null)) problems.push('휴지통에 들어간 문서가 있음')
  // 계획이 적은 버전 수와 지금 수가 다르면 계획 뒤에 누가 새 버전을 올린 것이다.
  // 2026-09-22 전에는 "버전이 1개가 아니면 건너뜀"이었다 — 첫 합치기(09-09) 때는 전부
  // 1개라 그게 곧 낡음 검사였지만, 붙이기가 쓰이면서 여러 버전 문서가 섞인 묶음이 생겼다.
  // versionCount 가 없는 옛 계획 파일은 옛 규칙(1개)으로 읽는다.
  const expected = new Map(group.order.map((row) => [row.id, row.versionCount ?? 1]))
  if (docs.some((d) => d.version_count !== expected.get(d.id))) {
    problems.push('계획 뒤에 버전 수가 바뀐 문서가 있음')
  }
  if (new Set(docs.map((d) => d.folder_id)).size !== 1) problems.push('폴더가 갈림')
  // 소유자가 다르면 남의 문서를 지우는 일이다. 삭제 권한이 올린 사람에게만 있는데
  // (2026-09-07) 스크립트가 그 경계를 넘으면 안 된다.
  if (new Set(docs.map((d) => d.created_by)).size !== 1) problems.push('올린 사람이 서로 다름')

  const keep = docs.find((d) => d.id === group.keepId)
  if (!keep) problems.push('남길 문서를 찾지 못함')

  if (problems.length > 0) {
    skipped++
    report.push(`[건너뜀] ${group.keepFileName}\n   이유: ${problems.join(' / ')}`)
    continue
  }

  const dropped = docs.filter((d) => d.id !== group.keepId)
  const lostDescriptions = dropped.filter((d) => d.description)
  const { rows: tags } = await client.query(
    `select document_id, tag_id from document_tags where document_id = any($1::text[])`,
    [ids],
  )
  const keepTags = new Set(tags.filter((t) => t.document_id === group.keepId).map((t) => t.tag_id))
  const movingTags = [...new Set(tags.filter((t) => !keepTags.has(t.tag_id)).map((t) => t.tag_id))]

  // 새 번호 = 계획의 문서 순서 → 문서 안의 원래 versionNo 순. 계획이 가장 최신 문서를
  // 맨 뒤에 두므로 마지막 번호가 곧 최신 파일이다. **행 id 로 잡는다** — 아래 적용 단계 주석.
  const moving = []
  for (const row of group.order) {
    const { rows: versions } = await client.query(
      `select id, version_no, file_name from document_versions where document_id = $1 order by version_no`,
      [row.id],
    )
    // 계획의 label 은 그 문서 **최신 파일**의 판번호다 — 옛 버전 줄에 붙이면 v0.4 파일이
    // v0.5 로 찍힌다. 판번호 파서가 TS 라 여기서 새로 읽지 않고, 최신 줄에만 붙인다.
    for (const v of versions) {
      moving.push({ ...v, documentId: row.id, label: v.file_name === row.fileName ? row.label : '    ' })
    }
  }

  // 제목 판정은 계획이 한다(앱의 retitleOnReupload). 여기서는 계획 뒤에 사람이 제목을
  // 고쳤는지만 본다 — 고쳤으면 그 제목을 덮지 않는다(되돌릴 방법이 없다). 그룹은 그대로 합친다.
  const retitle =
    group.retitle && keep.title === group.retitle.from ? group.retitle : null

  report.push(`[합침] ${group.keepFileName}`)
  moving.forEach((v, i) => {
    report.push(
      `   versionNo=${i + 1}  ${v.label}  ${v.file_name}` +
        (v.documentId === group.keepId ? '  (남는 문서)' : '  (문서 삭제)'),
    )
  })
  if (retitle) report.push(`   제목: "${retitle.from}" → "${retitle.to}"`)
  else if (group.retitle) report.push(`   ⚠ 제목이 계획 뒤에 바뀌어 안 건드린다: "${keep.title}"`)
  if (movingTags.length > 0) report.push(`   태그 ${movingTags.length}개를 옮긴다`)
  for (const d of lostDescriptions) {
    report.push(`   ⚠ 설명이 사라진다: "${d.description.slice(0, 60)}"`)
  }

  const entry = {
    keepId: group.keepId,
    before: docs.map((d) => ({ id: d.id, title: d.title, description: d.description })),
    order: group.order,
    // 되돌려야 할 때의 근거 — 어느 버전 행이 어느 문서의 몇 번이었는지.
    versions: moving.map((v, i) => ({ id: v.id, from: v.documentId, fromNo: v.version_no, toNo: i + 1 })),
    retitle,
    movingTags,
    applied: false,
  }
  snapshot.groups.push(entry)

  if (!apply) {
    merged++
    continue
  }

  // 되돌리기용 백업(2026-09-22). `before` 만으로는 지운 문서를 다시 만들 수 없다 — created_at·
  // folder_id·created_by 가 없다. 행 전체를 **row_to_json 으로** 뜬다: 시각 컬럼이 timestamp
  // (타임존 없음)라 JS Date 를 거치면 되넣을 때 9시간 밀린다(helpers.mjs purgeFolders 주석).
  // 되돌리기는 scripts/merge-rollback.mjs 가 이 백업을 json_populate_record 로 그대로 넣는다.
  const backupRows = async (sql) => (await client.query(sql, [ids])).rows.map((r) => r.row)
  entry.backup = {
    documents: await backupRows(`select row_to_json(d) as row from documents d where d.id = any($1::text[])`),
    versions: await backupRows(
      `select row_to_json(v) as row from document_versions v where v.document_id = any($1::text[])`,
    ),
    tags: await backupRows(`select row_to_json(t) as row from document_tags t where t.document_id = any($1::text[])`),
  }
  // **쓰기 전에 파일부터 남긴다** — 여기서 죽어도 이미 적용된 그룹의 백업은 디스크에 있다.
  await mkdir(path.dirname(snapshotPath), { recursive: true })
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2))

  // 옮길 대상을 **버전 행 id** 로 잡는다. `where document_id = ...` 로 옮기면 남길 문서
  // 차례에 이미 옮겨 온 행까지 함께 잡혀 같은 번호를 두 행에 쓰려다 유일 제약에 걸린다.
  // 목록은 위(dry-run 과 같은 조회)에서 이미 만들었다 — 보고한 순서와 적용 순서가 한 배열이다.
  const versionIds = moving.map((v) => v.id)

  try {
    await client.query('begin')
    // ⓪ 대상 문서를 잠그고 버전 수를 다시 센다(2026-09-22 코드 리뷰). 점검과 트랜잭션 사이에
    //    지울 문서에 새 버전이 올라오면 그 행은 versionIds 에 없어 안 옮겨지고, 아래 delete 의
    //    onDelete: Cascade 가 **조용히 지운다**(S3 파일은 고아). 새 버전 올리기는 문서 행을
    //    update 하므로 이 잠금에서 기다린다.
    await client.query(`select id from documents where id = any($1::text[]) for update`, [ids])
    const { rows: recount } = await client.query(
      `select count(*)::int as n from document_versions where document_id = any($1::text[])`,
      [ids],
    )
    if (recount[0].n !== versionIds.length) {
      throw new Error(`점검 뒤에 버전 수가 바뀌었다 (${versionIds.length} → ${recount[0].n})`)
    }
    // ① 유일 제약 (document_id, version_no) 을 피해 임시 음수로 옮긴다. 최종 번호를
    //    바로 쓰면 남길 문서의 기존 1번과 부딪힌다.
    for (const [i, versionId] of versionIds.entries()) {
      await client.query(
        `update document_versions set document_id = $1, version_no = $2 where id = $3`,
        [group.keepId, -(i + 1), versionId],
      )
    }
    // ② 판번호 오름차순이 곧 versionNo 오름차순이다 — 이 순서가 뒤집히면 앱이 옛 판을
    //    최신이라고 답한다(2026-09-08 재현 확인).
    for (const [i, versionId] of versionIds.entries()) {
      await client.query(`update document_versions set version_no = $1 where id = $2`, [
        i + 1,
        versionId,
      ])
    }
    for (const tagId of movingTags) {
      await client.query(
        `insert into document_tags (document_id, tag_id) values ($1, $2) on conflict do nothing`,
        [group.keepId, tagId],
      )
    }
    if (retitle) {
      await client.query(`update documents set title = $1 where id = $2 and title = $3`, [
        retitle.to,
        group.keepId,
        retitle.from,
      ])
    }
    // ③ 버전을 다 옮긴 뒤에만 지운다. 먼저 지우면 onDelete: Cascade 가 파일을 데려간다.
    await client.query(`delete from documents where id = any($1::text[])`, [dropped.map((d) => d.id)])
    await client.query('commit')
  } catch (err) {
    await client.query('rollback')
    report.push(`   ✖ 실패해서 되돌렸다: ${err.message}`)
    skipped++
    continue
  }
  // 커밋 뒤의 쓰기는 try 밖에 둔다 — 안에 있으면 디스크 오류가 "실패해서 되돌렸다"로 찍힌다
  // (이미 커밋돼 되돌린 것이 없는데). 여기서 던지면 스크립트가 멈추고 그 사실이 그대로 보인다.
  entry.applied = true
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2))
  merged++
}

for (const s of plan.skipped ?? []) {
  report.push(`[계획에서 제외됨] ${s.reason}`)
  for (const f of s.files) report.push(`   ${f}`)
}

await mkdir(path.dirname(snapshotPath), { recursive: true })
await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2))
await client.end()

console.log(report.join('\n'))
console.log(
  `\n${apply ? '적용함' : 'dry-run (아무것도 쓰지 않음)'} — 합침 ${merged}그룹 · 건너뜀 ${skipped}그룹`,
)
console.log(`스냅샷: ${snapshotPath}`)
if (!apply) {
  console.log('실제로 적용하려면 --apply 를 붙인다 — 사라질 id 매핑을 정합성 저장소에')
  console.log('전달한 뒤 --mapping-sent 까지 붙여야 실제로 돈다 (순서 계약 A).')
}
