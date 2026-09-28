import type { ConsistencyInput } from '@/lib/consistency'
import { parseHtml } from './parse-html'
import { loadWorkbook, parseXlsx, reqVersionFromRevisions } from './parse-xlsx'
import { verify, type DocInput } from './verify'
import { arrows } from './arrows'
import type { DocResult, Finding } from './types'

/**
 * 정합성 엔진의 입구. 문서 바이트를 받아 `POST /api/consistency` 와 **같은 모양**의
 * 페이로드를 낸다 — 저장(`snapshotCreateData`)과 대시보드를 그대로 쓰기 위해서다.
 * I/O(S3·DB)는 여기 없다. `measure.ts` 가 붙인다.
 */

export type EngineDoc = {
  key: string
  fileName: string
  bytes: Uint8Array
  dmsId: string
  dmsVersion: number
  /** 스냅샷에 남길 판 라벨. 파일명에서 읽은 표시용 값이고 판정에는 안 쓴다 */
  ver: string
}

/** 문서 하나가 이보다 크면 파싱하지 않는다. 실측 입력 합계가 1.1MB 이하다(인계문 §6) */
export const ENGINE_MAX_BYTES = 5 * 1024 * 1024

const MESSAGE_MAX = 500
const WHERE_MAX = 200

function errorText(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}

/** 문서를 파싱한다. REQ 면 `제.개정내역` 의 현재 판도 같이 읽는다 */
export async function parseEngineDoc(doc: Pick<EngineDoc, 'key' | 'fileName' | 'bytes'>): Promise<{
  result: DocResult
  reqVer: string | null
}> {
  if (doc.bytes.byteLength > ENGINE_MAX_BYTES) {
    return { result: { parsed: false, error: `파일이 너무 큽니다 (최대 ${ENGINE_MAX_BYTES / 1024 / 1024}MB)` }, reqVer: null }
  }
  const kindError = formatMismatch(doc.key, doc.fileName)
  if (kindError) return { result: { parsed: false, error: kindError }, reqVer: null }
  try {
    if (doc.fileName.toLowerCase().endsWith('.xlsx')) {
      const wb = await loadWorkbook(doc.bytes)
      const parsed = parseXlsx(wb, doc.key)
      return { result: { parsed: true, doc: parsed }, reqVer: doc.key === 'REQ' ? reqVersionFromRevisions(wb) : null }
    }
    const html = new TextDecoder('utf-8').decode(doc.bytes)
    return { result: { parsed: true, doc: parseHtml(html) }, reqVer: null }
  } catch (err) {
    return { result: { parsed: false, error: errorText(err) }, reqVer: null }
  }
}

/**
 * docKey 종류와 파일 형식이 다르면 파싱하지 않는다. 정본(`docs.py`)은 확장자로만 가르지만,
 * 그러면 REQ 자리에 pdf 가 올라와도 html 로 읽혀 "ID 0개"가 되고 **모든 참조가 에러로 뒤집힌
 * 스냅샷이 정상처럼 저장된다**(코드 리뷰 2026-09-27). 정본 입력은 전부 형식이 맞아 골든은 그대로다.
 */
function formatMismatch(key: string, fileName: string): string | null {
  const name = fileName.toLowerCase()
  const want = key.startsWith('SCR-') ? ['.html', '.htm'] : ['.xlsx']
  if (want.some((ext) => name.endsWith(ext))) return null
  // 패널의 "측정 제외 문서" 에 그대로 나간다 — 팀원이 읽는 문구(2026-09-28)
  return `파일 형식이 맞지 않습니다 (${want[0]} 필요 · 올라간 파일 '${fileName}')`
}

/** 판이 없거나 읽을 수 없는 문서. 조용히 빠지면 그 키가 영영 안 재진다 — `파싱` error 로 남긴다 */
export type MissingDoc = { key: string; error: string }

export async function runEngine(
  docs: EngineDoc[],
  missing: MissingDoc[],
  measuredAt: Date,
): Promise<ConsistencyInput> {
  const inputs: DocInput[] = []
  let reqVer: string | null = null
  for (const doc of docs) {
    const parsed = await parseEngineDoc(doc)
    inputs.push({ key: doc.key, result: parsed.result })
    if (doc.key === 'REQ') reqVer = parsed.reqVer
  }
  for (const m of missing) inputs.push({ key: m.key, result: { parsed: false, error: m.error } })
  inputs.sort((a, b) => keyOrder(a.key) - keyOrder(b.key) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

  const result = verify(inputs, reqVer)
  // 정본에 없는 DMS 전용 화살표 — 정본 산출 뒤에 덧붙인다(골든 대조가 이 부분만 빼고 비교한다)
  const arrow = arrows(inputs)
  const errors = [...result.errors, ...arrow.errors]
  const warnings = [...result.warnings, ...arrow.warnings]
  const findings = [
    ...errors.map((f) => toFinding(f, 'error')),
    ...warnings.map((f) => toFinding(f, 'warning')),
    ...result.unresolved.map((f) => toFinding(f, 'unresolved')),
  ]
  const m = result.metrics
  return {
    measuredAt: measuredAt.toISOString(),
    // 스냅샷에 필수값이다. 못 읽었으면 검사 4 는 건너뛰었고(reqVer null) 그 사실을 라벨로 남긴다
    reqVer: reqVer ?? '미상',
    counts: {
      errors: errors.length,
      warnings: warnings.length,
      pending: 0,
      unresolved: result.unresolved.length,
    },
    metrics: [
      ...[...m.reference].map(([axis, v]) => {
        const [from, to] = axis.split('→')
        return { axis: 'reference', from, to, ok: v.ok, total: v.total }
      }),
      { axis: 'referenceTotal', from: null, to: null, ...m.referenceTotal },
      { axis: 'reqCoverage', from: null, to: null, ...m.reqCoverage },
      { axis: 'reqCoverageWithDocs', from: null, to: null, ...m.reqCoverageWithDocs },
      { axis: 'scrCoverage', from: null, to: null, ...m.scrCoverage },
      { axis: 'triangle', from: null, to: null, ...m.triangle },
      // `to` 에 문서키가 온다(다른 축의 `to` 는 문서 *종류*라 뜻이 다르다)
      ...[...m.scrFuncCoverage].map(([docKey, v]) => ({ axis: 'scrFuncCoverage', from: null, to: docKey, ...v })),
      ...arrow.metrics.map((v) => ({ from: null, to: null, ...v })),
    ],
    findings,
    docs: docs.map((d) => ({ key: d.key, ver: d.ver, dmsId: d.dmsId, dmsVersion: d.dmsVersion })),
  }
}

/** REQ → SCR-* → FN-* 순. 정본 manifest 의 순서다(결과 순서에만 영향) */
function keyOrder(key: string): number {
  return key === 'REQ' ? 0 : key.startsWith('SCR-') ? 1 : 2
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

/** `post_metrics.py` 의 `build_findings` 와 같다 — 미해석은 check 가 없어 level 을 넣는다 */
export function toFinding(f: Finding, level: 'error' | 'warning' | 'pending' | 'unresolved') {
  let where = f.where ?? null
  if (where === null && f.block !== undefined) where = String(f.block)
  else if (where === null && f.row !== undefined) where = String(f.row)
  return {
    level,
    check: f.check || level,
    doc: f.doc,
    refId: f.id ?? null,
    where: where === null ? null : clip(where, WHERE_MAX),
    message: clip(f.msg || f.text || '(내용 없음)', MESSAGE_MAX),
  }
}
