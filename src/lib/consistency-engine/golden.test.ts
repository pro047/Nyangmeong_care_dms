import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runEngine, type EngineDoc } from './index'
import { definedIdCounts, suggestDocKey } from './suggest'

/**
 * 골든 대조 — 이 엔진이 정본(`docs.py`)과 같은 답을 내는가.
 *
 * 입력은 정합성 저장소의 원본 파일, 기대값은 `runs/2026-09-22_1/verify.json`(git 밖)이다.
 * 그 저장소가 없는 체크아웃에서는 건너뛴다. `CONSISTENCY_GOLDEN_ROOT` 로 경로를 바꾼다.
 *
 * 차이는 **항목 단위로** 보고한다. 건수만 맞추면 서로 다른 항목이 상쇄돼도 통과한다.
 */

const ROOT = process.env.CONSISTENCY_GOLDEN_ROOT ?? path.join(os.homedir(), 'orca/Nyangmeong_care')
const MANIFEST = path.join(ROOT, 'claude/00_manifest.json')
const GOLDEN = path.join(ROOT, 'runs/2026-09-22_1/verify.json')
const available = existsSync(MANIFEST) && existsSync(GOLDEN)

type Manifest = Record<string, { file: string; ver: string; dms_id: string; dms_version: number }>
type GoldenRow = { check?: string; doc: string; id?: string; where?: string; msg?: string; row?: number; block?: number | string; text?: string }

/** `post_metrics.py` 의 `build_findings` */
function goldenFindings(v: Record<string, GoldenRow[]>) {
  const levels: [string, string][] = [
    ['errors', 'error'],
    ['warnings', 'warning'],
    ['미해석', 'unresolved'],
  ]
  return levels.flatMap(([bucket, level]) =>
    v[bucket].map((r) => {
      let where = r.where ?? null
      if (where === null && r.block !== undefined) where = String(r.block)
      else if (where === null && r.row !== undefined) where = String(r.row)
      return { level, check: r.check || level, doc: r.doc, refId: r.id ?? null, where, message: r.msg || r.text || '' }
    }),
  )
}

// 알고 바꾼 문구. manifest 가 없어져 비교 기준의 이름이 바뀌었다.
const normalize = (message: string) => message.replace(/≠ manifest REQ /, '≠ REQ 현재 판 ')

function multisetDiff(a: string[], b: string[]): { onlyA: string[]; onlyB: string[] } {
  const count = new Map<string, number>()
  for (const x of a) count.set(x, (count.get(x) ?? 0) + 1)
  const onlyB: string[] = []
  for (const x of b) {
    const n = count.get(x) ?? 0
    if (n > 0) count.set(x, n - 1)
    else onlyB.push(x)
  }
  const onlyA = [...count].flatMap(([x, n]) => Array<string>(n).fill(x))
  return { onlyA, onlyB }
}

describe.skipIf(!available)('골든 대조 (정합성 저장소 2026-09-22_1)', () => {
  it('findings · counts · metrics 가 정본과 항목 단위로 같다', async () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'))
    const docs: EngineDoc[] = Object.entries(manifest).map(([key, e]) => ({
      key,
      fileName: e.file,
      bytes: new Uint8Array(readFileSync(path.join(ROOT, e.file))),
      dmsId: e.dms_id,
      dmsVersion: e.dms_version,
      ver: e.ver,
    }))

    const got = await runEngine(docs, [], new Date())

    expect(got.reqVer).toBe(manifest.REQ.ver)

    const key = (f: { level: string; check: string; doc: string; refId: string | null; where: string | null; message: string }) =>
      [f.level, f.check, f.doc, f.refId ?? '', f.where ?? '', normalize(f.message)].join(' | ')
    const diff = multisetDiff(got.findings.map(key), goldenFindings(golden).map(key))
    expect({ 엔진에만: diff.onlyA, 정본에만: diff.onlyB }).toEqual({ 엔진에만: [], 정본에만: [] })

    expect(got.counts).toEqual({
      errors: golden.counts.errors,
      warnings: golden.counts.warnings,
      pending: golden.counts['이관대기'],
      unresolved: golden.counts['미해석'],
    })

    const m = golden.metrics
    const expected = [
      ...Object.entries(m['참조'] as Record<string, { 성립: number; 전체: number }>)
        .filter(([axis]) => axis !== '합계')
        .map(([axis, v]) => `reference ${axis.replace('→', ' ')} ${v.성립}/${v.전체}`),
      `referenceTotal ${m['참조']['합계'].성립}/${m['참조']['합계'].전체}`,
      `reqCoverage ${m.REQ커버리지.참조됨}/${m.REQ커버리지.전체}`,
      `reqCoverageWithDocs ${m.REQ커버리지.도메인문서있음.참조됨}/${m.REQ커버리지.도메인문서있음.전체}`,
      `scrCoverage ${m.SCR커버리지.덮임}/${m.SCR커버리지.전체}`,
      `triangle ${m.삼각.닫힘}/${m.삼각.전체}`,
      ...Object.entries(m.화면기능대응 as Record<string, { 찾음: number; 전체: number }>).map(
        ([doc, v]) => `scrFuncCoverage ${doc} ${v.찾음}/${v.전체}`,
      ),
    ].sort()
    const actual = got.metrics
      .map((x) => [x.axis, x.from, x.to].filter(Boolean).join(' ') + ` ${x.ok}/${x.total}`)
      .sort()
    expect(actual).toEqual(expected)
  }, 120_000)

  it('본문 제안이 정본 docKey 와 맞는다 — 통합본 FN-COM 하나만 다수결로 틀린다', async () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest
    const registered = new Set(Object.keys(manifest))

    const wrong: string[] = []
    for (const [key, e] of Object.entries(manifest)) {
      const counts = await definedIdCounts({ fileName: e.file, bytes: new Uint8Array(readFileSync(path.join(ROOT, e.file))) })
      const suggested = suggestDocKey(counts, registered)
      if (suggested !== key) wrong.push(`${key}→${suggested}`)
    }

    // 2026-09-27 실측. `04_기능명세서_v0.1` 은 여러 도메인을 모은 통합본이라 FN-AIM 91 · FN-COM 60 이다
    expect(wrong).toEqual(['FN-COM→FN-AIM'])
  }, 120_000)
})
