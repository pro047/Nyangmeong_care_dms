import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 소급 이동 스크립트는 scripts/ 에 있어 vitest 수집 대상이 아니고, import 하면 main() 이
 * DB 에 붙는다. 그래서 소스 텍스트로 불변식만 고정한다 — "최신 버전은 컬럼이 아니라
 * versionNo desc 정렬로 구한다"(CLAUDE.md) 를 스크립트가 어기면 여기서 잡힌다.
 */
const SCRIPT_URL = new URL('../../scripts/reclassify-folders.mjs', import.meta.url)
const source = readFileSync(fileURLToPath(SCRIPT_URL), 'utf8')

describe('reclassify-folders.mjs — 불변식', () => {
  it('최신 버전 파일명은 version_no desc + limit 1 로 구해야 한다 (컬럼이 아니다)', () => {
    expect(source).toMatch(/order by version_no desc\s+limit 1/)
  })

  it('폴더를 지우는 SQL 이 없어야 한다 — onDelete: Cascade 라 자식까지 데려간다', () => {
    expect(source).not.toMatch(/delete\s+from\s+folders/i)
  })

  it('앱 분류 함수를 그대로 import 해야 한다 — 규칙을 두 벌 두지 않는다', () => {
    expect(source).toMatch(/from '\.\.\/src\/lib\/classify\.ts'/)
  })
})
