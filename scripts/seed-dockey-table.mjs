// `doc_keys` 표를 아래 목록과 맞춘다. **키를 더하는 유일한 길**이다 — 화면은 없다.
// 관리자가 새 키를 요청하면 아래 KEYS 에 한 줄 더하고 돌린다(2026-09-27 사람 결정).
//
//   node --env-file=.env scripts/seed-dockey-table.mjs [--apply]
//
// --apply 가 없으면 dry-run. 목록에 없는 키는 **지우지 않는다** — 문서가 달려 있으면
// 외래키(Restrict)가 어차피 막고, 지우기는 따로 판단할 일이라 보고만 한다.
//
// **순서**: 스키마(`doc_keys` 표 + 외래키) → 이 스크립트 → `seed-dockeys.mjs`(문서에 키 달기).
// 표가 비어 있으면 문서에 키를 달 수 없다.
import pg from 'pg'

// 인계문 §4 의 19개(2026-09-11 확정) + SCR-LAN(2026-09-27 추가 — 랜딩페이지 화면설계서가 SCR-LAN-001 을 정의)
const KEYS = [
  ['REQ', '요구사항정의서'],
  ['SCR-COM', '공통레이아웃 화면설계서'],
  ['SCR-ACC', '로그인·회원가입 화면설계서'],
  ['SCR-MAN', '메인페이지 화면설계서'],
  ['SCR-LAN', '랜딩페이지 화면설계서'],
  ['SCR-HLT', '건강기록 화면설계서'],
  ['SCR-AIM', 'AI매니저 화면설계서'],
  ['SCR-PLC', '플레이스 화면설계서'],
  ['SCR-MYP', '마이페이지 화면설계서'],
  ['SCR-CMU', '커뮤니티 화면설계서'],
  ['SCR-CSC', '고객센터 화면설계서'],
  ['FN-COM', '공통레이아웃 기능명세서'],
  ['FN-ACC', '로그인·회원가입 기능명세서'],
  ['FN-MAN', '메인페이지 기능명세서'],
  ['FN-HLT', '건강기록 기능명세서'],
  ['FN-AIM', 'AI매니저 기능명세서'],
  ['FN-PLC', '플레이스 기능명세서'],
  ['FN-MYP', '마이페이지 기능명세서'],
  ['FN-CMU', '커뮤니티 기능명세서'],
  ['FN-CSC', '고객센터 기능명세서'],
]
const DOC_KEY_RE = /^(?:REQ|(?:SCR|FN)-[A-Z]{3})$/

const apply = process.argv.includes('--apply')
const bad = KEYS.filter(([key]) => !DOC_KEY_RE.test(key)).map(([key]) => key)
const dup = KEYS.map(([key]) => key).filter((key, i, all) => all.indexOf(key) !== i)
if (bad.length || dup.length) {
  console.error(`목록이 잘못됐습니다 — 모양: ${bad.join(', ') || '-'} · 중복: ${dup.join(', ') || '-'}`)
  process.exit(2)
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  const { rows } = await client.query('select key, label, sort_order from doc_keys order by sort_order')
  const now = new Map(rows.map((row) => [row.key, row]))
  console.log(`대상 DB: ${new URL(process.env.DATABASE_URL).hostname} · ${apply ? '적용' : 'dry-run'}\n`)
  KEYS.forEach(([key, label], i) => {
    const row = now.get(key)
    const mark = !row ? '추가' : row.label !== label || row.sort_order !== i ? '갱신' : '그대로'
    console.log(`  ${key.padEnd(8)} ${label}  [${mark}]`)
  })
  const extra = rows.filter((row) => !KEYS.some(([key]) => key === row.key))
  for (const row of extra) console.log(`  ${row.key.padEnd(8)} ${row.label}  [목록에 없음 — 지우지 않았다]`)

  if (!apply) {
    console.log('\n--apply 를 안 줬습니다 — 쓰지 않았습니다')
    process.exit(0)
  }
  await client.query('begin')
  for (const [i, [key, label]] of KEYS.entries()) {
    await client.query(
      `insert into doc_keys (key, label, sort_order) values ($1, $2, $3)
       on conflict (key) do update set label = excluded.label, sort_order = excluded.sort_order`,
      [key, label, i],
    )
  }
  await client.query('commit')
  console.log(`\n적용했습니다 (${KEYS.length}개)`)
} catch (err) {
  await client.query('rollback').catch(() => {})
  throw err
} finally {
  await client.end()
}
