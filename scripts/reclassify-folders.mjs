// 기존 문서를 2뎁스 구조로 소급 이동한다. 일회성이고 UI 버튼을 만들지 않는다 —
// 26건짜리 1회 작업에 영구 유지 대상을 만들 이유가 없다 (MILESTONES.md §'소급 이동').
//
//   node --env-file=.env scripts/reclassify-folders.mjs [--dry-run|--apply] [--out <path>]
//
// --dry-run 이 기본이다. --apply 를 명시하지 않으면 아무것도 쓰지 않는다.
//
// 선행 작업(사람이 UI 에서 먼저 한다):
//   1. `화면설계서` 에 별칭 `와이어프레임` 추가
//   2. 합성 폴더(`로그인 회원가입 와이어프레임`·`플레이스 와이어프레임`) 삭제
// 출력 ①(현재 폴더 트리)이 이 두 가지가 됐는지 확인하는 자리다.
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
// 분류 규칙을 두 벌 쓰지 않는다. classify.ts 는 import 0개라 Node 타입 스트리핑으로 그냥 뜬다.
import { classifyFileName } from '../src/lib/classify.ts'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const outFlag = argv.indexOf('--out')
const snapshotPath =
  outFlag >= 0 && argv[outFlag + 1]
    ? argv[outFlag + 1]
    : path.join(
        'scripts',
        'snapshots',
        `reclassify-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      )

/** 활성 문서 + 최신 버전 파일명. 정렬을 박아야 dry-run 이 실제 결과의 예고가 된다 —
    매칭이 추출을 이기므로 먼저 처리된 문서가 하위 폴더 이름을 정한다. */
const DOCUMENTS_SQL = `
  select d.id, d.folder_id, v.file_name
    from documents d
    join lateral (
      select file_name from document_versions
       where document_id = d.id
       order by version_no desc
       limit 1
    ) v on true
   where d.deleted_at is null
   order by d.created_at asc, d.id asc
`

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  try {
    const { rows: folderRows } = await client.query(
      'select id, name, parent_id, aliases from folders order by name asc',
    )
    const { rows: docRows } = await client.query(DOCUMENTS_SQL)

    const folders = folderRows.map((row) => ({
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      aliases: row.aliases ?? [],
    }))
    const documents = docRows.map((row) => ({
      id: row.id,
      folderId: row.folder_id,
      fileName: row.file_name,
    }))

    const plan = buildPlan(folders, documents)
    printReport(folders, documents, plan)

    if (!apply) {
      console.log('\n--dry-run (기본) — 아무것도 바꾸지 않았습니다. 적용하려면 --apply 를 붙이세요.')
      return
    }

    await applyPlan(client, plan)
  } finally {
    await client.end()
  }
}

/**
 * 메모리 안에서만 계획을 세운다. 새로 계획한 하위 폴더는 folders 에 즉시 넣는다 —
 * 다음 문서가 그걸 **매칭으로** 재사용해야 같은 이름이 두 번 만들어지지 않는다.
 */
function buildPlan(folders, documents) {
  const working = folders.map((folder) => ({ ...folder }))
  const newFolders = []
  const moves = []
  const kept = []

  for (const doc of documents) {
    const result = classifyFileName(doc.fileName, working)

    if (result.kind === 'match') {
      pushMove(moves, kept, doc, result.folderId, result.reason)
      continue
    }

    // 새 카테고리(루트)는 만들지 않는다 — 소급은 구조를 접는 작업이지 카테고리를 세우는
    // 작업이 아니다. 사람이 UI 에서 처리한다.
    if (result.kind === 'propose' && result.parentId !== null) {
      // @default(cuid()) 는 Prisma 계층 기능이라 raw INSERT 에는 안 걸린다. id 형식을
      // 검사하는 코드가 없어서 uuid 를 섞어도 된다.
      const folder = {
        id: randomUUID(),
        name: result.proposedName,
        parentId: result.parentId,
        aliases: [],
      }
      working.push(folder)
      newFolders.push(folder)
      pushMove(moves, kept, doc, folder.id, result.reason)
      continue
    }

    kept.push({ ...doc, reason: result.reason })
  }

  // 문서가 하나도 안 들어간 폴더는 계획에서 뺀다 (이동이 to === from 으로 접힌 경우).
  const usedIds = new Set(moves.map((move) => move.to))
  return {
    newFolders: newFolders.filter((folder) => usedIds.has(folder.id)),
    moves,
    kept,
    working,
  }
}

function pushMove(moves, kept, doc, to, reason) {
  if (to === doc.folderId) {
    kept.push({ ...doc, reason: `이미 제자리 — ${reason}` })
    return
  }
  moves.push({ documentId: doc.id, fileName: doc.fileName, from: doc.folderId, to, reason })
}

function pathOf(folders, folderId) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const names = []
  const seen = new Set()
  let cursor = byId.get(folderId)
  while (cursor !== undefined && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    names.unshift(cursor.name)
    cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId)
  }
  return names.join(' > ')
}

function printReport(folders, documents, plan) {
  const countByFolder = new Map()
  for (const doc of documents) {
    const key = doc.folderId ?? '(미분류)'
    countByFolder.set(key, (countByFolder.get(key) ?? 0) + 1)
  }

  console.log(`# ① 현재 폴더 트리 (${folders.length}개) — 선행 작업이 됐는지 확인하세요`)
  for (const folder of folders) {
    const aliases = folder.aliases.length > 0 ? ` aliases=[${folder.aliases.join(', ')}]` : ''
    console.log(
      `  ${pathOf(folders, folder.id)}  ` +
        `문서 ${countByFolder.get(folder.id) ?? 0}건${aliases}  id=${folder.id}`,
    )
  }
  console.log(`  (미분류)  문서 ${countByFolder.get('(미분류)') ?? 0}건`)
  console.log(`  활성 문서 합계 ${documents.length}건`)

  const docsPerNew = new Map()
  for (const move of plan.moves) docsPerNew.set(move.to, (docsPerNew.get(move.to) ?? 0) + 1)

  console.log(`\n# ② 새로 만들 하위 폴더 (${plan.newFolders.length}개)`)
  for (const folder of plan.newFolders) {
    console.log(
      `  ${pathOf(plan.working, folder.id)}  문서 ${docsPerNew.get(folder.id) ?? 0}건  id=${folder.id}`,
    )
  }

  console.log(`\n# ③ 이동 (${plan.moves.length}건)`)
  for (const move of plan.moves) {
    const from = move.from === null ? '(미분류)' : pathOf(plan.working, move.from)
    console.log(`  ${move.fileName}\n      ${from} → ${pathOf(plan.working, move.to)}  · ${move.reason}`)
  }

  console.log(`\n# ④ 유지 (${plan.kept.length}건)`)
  for (const doc of plan.kept) {
    console.log(`  ${doc.fileName}  · ${doc.reason}`)
  }

  // 폴더 삭제는 사람이 UI 에서 한다 — schema.prisma:35 가 onDelete: Cascade 라 폴더를
  // 지우면 자식 폴더까지 데려간다.
  const emptied = folders.filter((folder) => {
    const before = countByFolder.get(folder.id) ?? 0
    if (before === 0) return false
    const leaving = plan.moves.filter((move) => move.from === folder.id).length
    const arriving = plan.moves.filter((move) => move.to === folder.id).length
    return before - leaving + arriving === 0
  })
  console.log(`\n# ⑤ 비게 되는 기존 폴더 (${emptied.length}개) — 보고만 합니다. 삭제는 UI 에서`)
  for (const folder of emptied) console.log(`  ${pathOf(folders, folder.id)}  id=${folder.id}`)
}

async function applyPlan(client, plan) {
  if (plan.moves.length === 0) {
    console.log('\n이동할 문서가 없습니다.')
    return
  }

  // 스냅샷을 트랜잭션보다 먼저 쓴다 — 커밋 후에 못 쓰면 되돌릴 방법이 없어진다.
  await writeSnapshot(plan, 'pending')

  await client.query('BEGIN')
  try {
    for (const folder of plan.newFolders) {
      await client.query(
        "insert into folders (id, name, parent_id, aliases) values ($1, $2, $3, '{}')",
        [folder.id, folder.name, folder.parentId],
      )
    }

    for (const move of plan.moves) {
      // 3번째 조건이 낙관적 잠금이다. 계획을 세운 뒤 사람이 UI 에서 옮겼으면 0행이 된다.
      const res = await client.query(
        'update documents set folder_id = $1 where id = $2 and folder_id is not distinct from $3',
        [move.to, move.documentId, move.from],
      )
      if (res.rowCount !== 1) {
        throw new Error(
          `문서 ${move.documentId}(${move.fileName})의 현재 폴더가 계획과 다릅니다 ` +
            `(영향 행 ${res.rowCount}). 사이에 누가 옮긴 것 같습니다 — 다시 dry-run 하세요.`,
        )
      }
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  }

  await writeSnapshot(plan, 'committed')
  console.log(
    `\n적용 완료 — 폴더 ${plan.newFolders.length}개 생성, 문서 ${plan.moves.length}건 이동.` +
      `\n되돌리려면: node --env-file=.env scripts/reclassify-rollback.mjs ${snapshotPath} --apply`,
  )
}

async function writeSnapshot(plan, status) {
  await mkdir(path.dirname(snapshotPath), { recursive: true })
  await writeFile(
    snapshotPath,
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        status,
        createdFolders: plan.newFolders,
        moves: plan.moves.map((move) => ({
          documentId: move.documentId,
          fileName: move.fileName,
          from: move.from,
          to: move.to,
        })),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  console.log(`\n스냅샷(${status}): ${snapshotPath}`)
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
