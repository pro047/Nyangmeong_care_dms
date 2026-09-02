// reclassify-folders.mjs 의 스냅샷으로 documents.folder_id 를 되돌린다.
//
//   node --env-file=.env scripts/reclassify-rollback.mjs <snapshot.json> [--dry-run|--apply]
//
// 만들어진 폴더는 지우지 않는다 — 폴더 삭제는 사람이 UI 에서 한다는 규약 그대로다
// (schema.prisma:35 가 onDelete: Cascade 라 자식까지 데려간다).
import { readFile } from 'node:fs/promises'
import pg from 'pg'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const snapshotPath = argv.find((arg) => !arg.startsWith('--'))

async function main() {
  if (!snapshotPath) {
    throw new Error('스냅샷 파일 경로가 필요합니다 — 사용법은 이 파일 첫 줄 주석 참조')
  }

  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))
  const moves = snapshot.moves ?? []

  console.log(`# 되돌릴 이동 (${moves.length}건) — 스냅샷 ${snapshotPath} (${snapshot.status})`)
  for (const move of moves) {
    console.log(`  ${move.fileName}  ${move.to} → ${move.from ?? '(미분류)'}`)
  }
  console.log(
    `\n만들어진 폴더 ${(snapshot.createdFolders ?? []).length}개는 빈 채로 남습니다 (규약).`,
  )

  if (!apply) {
    console.log('\n--dry-run (기본) — 아무것도 바꾸지 않았습니다. 되돌리려면 --apply 를 붙이세요.')
    return
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  try {
    await client.query('BEGIN')
    try {
      for (const move of moves) {
        // 되돌리기에도 같은 낙관적 잠금을 쓴다 — 그 사이 누가 또 옮겼으면 덮으면 안 된다.
        const res = await client.query(
          'update documents set folder_id = $1 where id = $2 and folder_id is not distinct from $3',
          [move.from, move.documentId, move.to],
        )
        if (res.rowCount !== 1) {
          throw new Error(
            `문서 ${move.documentId}(${move.fileName})의 현재 폴더가 스냅샷과 다릅니다 ` +
              `(영향 행 ${res.rowCount}). 되돌리지 않았습니다.`,
          )
        }
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }

    console.log(`\n되돌리기 완료 — 문서 ${moves.length}건.`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
