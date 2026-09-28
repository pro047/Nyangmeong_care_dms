import type { PrismaClient } from '@/generated/prisma/client'
import { consistencyFailure, consistencyProblem, consistencySchema, snapshotCreateData } from '@/lib/consistency'
import { ENGINE_MAX_BYTES, runEngine, type EngineDoc, type MissingDoc } from '@/lib/consistency-engine'
import { fileVersionLabel } from '@/lib/file-version'

/**
 * docKey 가 달린 문서 **전체**의 최신판으로 한 번 잰다. 한 문서가 바뀌면 다른 문서의
 * 결과도 같이 바뀌므로(09-13: SCR-COM 하나로 errors 8 → 31) 올라온 문서만 재지 않는다.
 *
 * **던지지 않는다.** 업로드 응답이 이미 나간 뒤(`after()`)에 돌기 때문에 여기서 던지면
 * 받을 사람이 없다. 결과는 반환값과 로그로만 남는다.
 */

export type MeasureDeps = {
  prisma: PrismaClient
  getObjectBytes: (key: string, maxBytes: number) => Promise<Uint8Array | null>
  now?: () => Date
}

export type MeasureOutcome =
  | { ok: true; snapshotId: string; docs: number; missing: number }
  | { ok: false; reason: string }

// 패널의 "측정 제외 문서" 에 그대로 나간다 — 팀원이 읽는 문구라 존댓말·쉬운 말(2026-09-28 사람 지시)
const UNASSIGNED = '연결된 문서가 없습니다'
const TRASHED = '문서가 휴지통에 있습니다'
const NO_VERSION = '올라간 파일이 없습니다'
const UNREADABLE = '파일을 불러오지 못했습니다'

/** 연달아 올라온 변경을 한 번의 측정으로 합치는 대기 시간(2026-09-27 사람 결정) */
export const MEASURE_QUIET_MS = 5000

/**
 * 예외로 끝난 측정의 사유. **예외 원문을 사유로 쓰지 않는다** — 사유는 팀원 전원이 보는 패널(`consistency_run`)에
 * 그대로 나가는데, Prisma·S3 예외에는 호스트·포트가 담긴 영문 원문이 들어 있다. 원문은 `console.error` 로 남는다.
 */
export const MEASURE_CRASHED = '측정 중 서버 오류가 났습니다 (자세한 내용은 서버 로그)'

export const SUPERSEDED = '더 새로운 변경이 있어 건너뛴다 — 그 변경의 측정이 이것까지 잰다'

/**
 * 기준 시각을 이만큼 늦춰 비교한다. 어긋나면 안 되는 방향이 한쪽뿐이라서다 —
 * 예약 시각(앱 서버 시계)과 `document_versions.created_at`(DB 기본값일 수 있다)의 시계가 어긋나
 * **자기 업로드를 "더 새 변경"으로 읽으면 마지막 측정까지 건너뛰어 아무도 안 잰다.** 늦춰서 생기는 손해는
 * 그 안에 들어온 변경을 못 합쳐 한 번 더 재는 것뿐이다.
 */
export const CLOCK_MARGIN_MS = 500

/**
 * `since` 에 예약된 측정을 조용한 시간이 지난 뒤에 돌린다. 그 사이에 docKey 문서가 또 바뀌었으면
 * **건너뛴다** — 더 늦은 변경이 자기 측정을 예약해 두었고, 그 측정이 이 변경까지 읽는다.
 *
 * 서버리스라 인스턴스끼리 메모리를 못 나눠서 DB 로 가른다. 신호는 둘이다.
 * - `documents.updated_at` — docKey 변경 · 휴지통 · 복구가 갱신한다
 * - `document_versions.created_at` — 새 버전. **버전만 붙이는 중첩 쓰기는 부모의 `updated_at` 을
 *   갱신하지 않는다**(2026-09-27 실측, 제목이 그대로인 재업로드에서 안 움직였다)
 * 영구삭제는 행이 사라져 신호를 못 남기므로 그때는 측정이 한 번 더 돈다(결과는 둘 다 맞다).
 *
 * **마지막 변경의 측정은 반드시 돈다** — 그 뒤로 더 새 변경이 없으니 건너뛸 이유가 없다.
 * 그래서 합치기가 실패해도 결과는 맞고, 줄어드는 것은 횟수뿐이다.
 */
export async function measureWhenQuiet(
  deps: MeasureDeps & { since: Date; wait: (ms: number) => Promise<void> },
): Promise<MeasureOutcome> {
  try {
    await deps.wait(MEASURE_QUIET_MS)
    const after = new Date(deps.since.getTime() + CLOCK_MARGIN_MS)
    const newer = await deps.prisma.document.count({
      where: {
        docKey: { not: null },
        OR: [{ updatedAt: { gt: after } }, { versions: { some: { createdAt: { gt: after } } } }],
      },
    })
    if (newer > 0) return { ok: false, reason: SUPERSEDED }
  } catch (err) {
    console.error('정합성 측정 대기 실패:', err)
    return { ok: false, reason: MEASURE_CRASHED }
  }
  return measureConsistency(deps)
}

export async function measureConsistency(deps: MeasureDeps): Promise<MeasureOutcome> {
  try {
    return await measure(deps)
  } catch (err) {
    console.error('정합성 측정 실패:', err)
    return { ok: false, reason: MEASURE_CRASHED }
  }
}

async function measure(deps: MeasureDeps): Promise<MeasureOutcome> {
  // 읽기 **전에** 찍는다. 다운로드가 끝난 뒤에 찍으면, 겹친 두 측정 중 옛 판을 읽은 쪽이 늦게 끝나
  // 더 늦은 시각을 받고 대시보드(`measuredAt desc`)에서 최신으로 보인다(코드 리뷰 2026-09-27)
  const measuredAt = (deps.now ?? (() => new Date()))()
  // 키 표에서 출발한다 — 문서 쪽에서 출발하면 문서가 안 달린 키가 결과에서 조용히 사라진다
  const keys = await deps.prisma.docKey.findMany({
    orderBy: { sortOrder: 'asc' },
    select: {
      key: true,
      document: {
        select: {
          id: true,
          deletedAt: true,
          versions: { orderBy: { versionNo: 'desc' }, take: 1, select: { versionNo: true, s3Key: true, fileName: true } },
        },
      },
    },
  })
  if (!keys.some((k) => k.document)) return { ok: false, reason: '정합성 키가 달린 문서가 없습니다' }

  const missing: MissingDoc[] = []
  const docs: EngineDoc[] = []
  await Promise.all(
    keys.map(async ({ key, document: d }) => {
      if (!d) return void missing.push({ key, error: UNASSIGNED })
      const latest = d.versions[0]
      if (d.deletedAt) return void missing.push({ key, error: TRASHED })
      if (!latest) return void missing.push({ key, error: NO_VERSION })
      const bytes = await deps.getObjectBytes(latest.s3Key, ENGINE_MAX_BYTES)
      if (!bytes) return void missing.push({ key, error: UNREADABLE })
      docs.push({
        key,
        fileName: latest.fileName,
        bytes,
        dmsId: d.id,
        dmsVersion: latest.versionNo,
        ver: fileVersionLabel(latest.fileName)?.replace(/^v/, '') || '?',
      })
    }),
  )
  if (!docs.length) return { ok: false, reason: `읽을 수 있는 문서가 없습니다 (${missing.length}건 모두 실패)` }

  const payload = await runEngine(docs, missing, measuredAt)

  // 외부에서 받는 페이로드와 같은 문을 지난다 — 엔진이 폭주하면 여기서 멈춘다
  const parsed = consistencySchema.safeParse(payload)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    console.error(`정합성 측정 페이로드 형식 오류: ${first?.path.join('.')} — ${first?.message}`)
    return { ok: false, reason: '측정 결과가 저장 형식에 맞지 않습니다 (자세한 내용은 서버 로그)' }
  }
  const problem = consistencyProblem(parsed.data)
  if (problem) return { ok: false, reason: problem.error }

  try {
    const snapshot = await deps.prisma.consistencySnapshot.create({
      data: snapshotCreateData(parsed.data),
      select: { id: true },
    })
    return { ok: true, snapshotId: snapshot.id, docs: docs.length, missing: missing.length }
  } catch (err) {
    // 같은 ms 에 두 측정이 끝난 경우다. 둘 다 같은 최신판을 쟀으므로 하나만 남아도 된다
    const failure = consistencyFailure(err)
    if (failure) return { ok: false, reason: failure.error }
    throw err
  }
}
