import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getObjectBytes } from '@/lib/s3'
import { SUPERSEDED, measureConsistency, measureWhenQuiet, type MeasureOutcome } from '@/lib/consistency-measure'
import { REFRESH_COOLDOWN_MS, inRefreshCooldown, measuredDocsDiffer, type MeasuredDoc } from '@/lib/consistency-refresh'
import { activeDocumentWhere } from '@/lib/trash'
import { CONSISTENCY_DUPLICATE } from '@/lib/consistency'

/**
 * 응답을 보낸 **뒤**에 정합성을 잰다. 측정 실패가 업로드 실패가 되면 안 된다(인계문 §7).
 * 실행 시간은 이 요청을 받은 라우트의 한도를 같이 쓴다 — 운영은 Hobby + Fluid Compute,
 * 최대 300초(2026-09-27 사람 확인). 로컬 실측은 19문서 파싱 151ms.
 */
export function scheduleConsistencyMeasure(): void {
  // 예약하는 지금 찍는다 — 이 요청의 쓰기는 이미 끝났으므로 그 updated_at 은 이 시각보다 늦을 수 없다
  const since = new Date()
  after(async () => {
    // 5초 대기도 "검사 중" 에 넣는다 — 업로드한 사람에게는 그때부터가 기다리는 시간이다
    const runId = await startRun()
    const started = Date.now()
    let outcome = await measureWhenQuiet({ prisma, getObjectBytes, since, wait: sleep })
    // 건너뛰었는데 아직 내가 마지막으로 시작한 측정이면, 나를 밀어낸 "더 새 변경" 은 측정을 예약하지 않는 쓰기
    // (제목·설명·폴더 PATCH, 태그 — 둘 다 updated_at 만 올린다)였다. 아무도 안 재므로 지금 잰다
    // (2026-09-27 재리뷰 · 실행 상태 리뷰). 더 새 측정의 시작 기록이 아직 안 온 틈이면 한 번 더 잴 뿐이다
    // 시작 기록이 없으면(null) 확인할 길이 없으니 잰다 — 한 번 더 재는 것은 결과가 같고, 안 재면 새 판이 빠진다
    if (!outcome.ok && outcome.reason === SUPERSEDED && (runId === null || (await isLatestRun(runId)))) {
      console.log('정합성 측정: 밀어낸 변경이 측정을 예약하지 않는 쓰기라 바로 잰다')
      outcome = await measureConsistency({ prisma, getObjectBytes })
    }
    // 소요 시간을 남기는 이유: 라우트 한도(300초) 대비 여유를 운영 로그로 확인하려고 (대기 5초 포함)
    logOutcome(outcome, Date.now() - started)
    await finishRun(runId, outcome)
  })
}

/**
 * 실행 상태(`consistency_run`)의 시작 기록. **기록이 실패해도 측정은 돈다** — 상태 표시는 부가 기능이고,
 * 측정이 그것 때문에 멈추면 대시보드가 옛 결과에 머문다. 실패하면 null 이라 끝 기록도 건너뛴다.
 */
async function startRun(): Promise<string | null> {
  const runId = randomUUID()
  try {
    // 더 늦게 시작한 쪽만 덮는다 — 두 인스턴스의 시작 기록이 도착 순서가 뒤집히면 옛 측정이 새 측정의 run_id 를
    // 덮어 새 쪽의 끝 기록이 버려진다. 0행이면 이미 더 새 측정이 있다는 뜻이라 끝 기록도 안 쓴다.
    // 시각은 DB 시계 하나만 쓴다 — 인스턴스마다 다른 앱 시계로 비교하면 빠른 시계가 한 번 쓴 미래 값이 이후
    // 시작 기록을 전부 막는다
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO consistency_run (id, run_id, started_at) VALUES ('main', ${runId}, clock_timestamp())
      ON CONFLICT (id) DO UPDATE SET run_id = excluded.run_id, started_at = excluded.started_at,
        finished_at = NULL, ok = NULL, reason = NULL
        WHERE consistency_run.started_at < excluded.started_at
      RETURNING id`
    return rows.length > 0 ? runId : null
  } catch (err) {
    console.error('정합성 실행 상태 기록 실패(시작):', err)
    return null
  }
}

/** 조회가 실패하면 true — 모르면 잰다(한 번 더 재는 쪽이 새 판을 빠뜨리는 쪽보다 낫다). 던지면 끝 기록까지 빠진다. */
async function isLatestRun(runId: string): Promise<boolean> {
  try {
    const row = await prisma.consistencyRun.findUnique({ where: { id: 'main' }, select: { runId: true } })
    return row?.runId === runId
  } catch (err) {
    console.error('정합성 실행 상태 조회 실패:', err)
    return true
  }
}

/**
 * 끝 기록은 **내가 마지막으로 시작한 측정일 때만** 쓴다 — 겹친 측정 중 옛 쪽이 "완료" 로 새 쪽을 가리지 않게.
 * 건너뛴 측정(SUPERSEDED)은 쓰지 않는다: 더 새 변경의 측정이 이미 시작을 덮어썼고, 그쪽이 끝을 쓴다.
 */
async function finishRun(runId: string | null, outcome: MeasureOutcome): Promise<void> {
  if (!runId || (!outcome.ok && outcome.reason === SUPERSEDED)) return
  try {
    await prisma.consistencyRun.updateMany({
      where: { id: 'main', runId },
      // 같은 ms 충돌은 실패가 아니다 — 다른 측정이 같은 최신판을 이미 저장했다(`consistencyFailure` 참조)
      data: {
        finishedAt: new Date(),
        ok: outcome.ok || outcome.reason === CONSISTENCY_DUPLICATE,
        reason: outcome.ok || outcome.reason === CONSISTENCY_DUPLICATE ? null : outcome.reason,
      },
    })
  } catch (err) {
    console.error('정합성 실행 상태 기록 실패(끝):', err)
  }
}

function logOutcome(outcome: MeasureOutcome, ms: number): void {
  if (outcome.ok) {
    console.log(`정합성 측정: 스냅샷 ${outcome.snapshotId} (문서 ${outcome.docs} · 못 읽음 ${outcome.missing} · ${ms}ms)`)
  } else {
    console.log(`정합성 측정 안 함: ${outcome.reason} (${ms}ms)`)
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 삭제·복구·영구삭제 라우트가 **바꾸기 전에** 부른다. 영구삭제 뒤에는 행이 없어 읽을 수 없고,
 * 휴지통에 들어간 docKey 문서는 측정에 `파싱` error 로 나와야 하므로(안 재면 대시보드가 옛 결과를 보인다)
 * 다시 재야 하는지 여기서 가른다. 삭제는 드물어 조회 한 번을 더 낸다.
 */
export async function hasDocKey(documentId: string): Promise<boolean> {
  const document = await prisma.document.findUnique({ where: { id: documentId }, select: { docKey: true } })
  return Boolean(document?.docKey)
}

/**
 * 메인 페이지가 부른다 — 최신 스냅샷이 지금 판과 다르면 다시 잰다(`consistency-refresh.ts`).
 * **비교 조회까지 응답 뒤로 미룬다.** 판정 결과를 화면에 쓰지 않으므로(새 결과는 다음 새로고침에
 * 보인다) 메인이 이 조회를 기다릴 이유가 없다. 스냅샷이 10분 안이면 조회도 내지 않는다 — 단 측정이
 * 실패해 스냅샷이 안 생긴 10분 동안은 비교 조회 + UPSERT 가 방문마다 나가고 둘 다 0행으로 끝난다.
 *
 * `measureWhenQuiet` 의 5초 대기를 타지 않는다 — 그건 연달아 들어오는 쓰기를 합치는 장치인데
 * 메인 방문에는 합칠 쓰기가 없다. 동시 방문의 중복은 `claimRefresh()` 가 막는다.
 */
export function scheduleConsistencyRefresh(snapshot: { measuredAt: Date; docs: MeasuredDoc[] } | null): void {
  if (inRefreshCooldown(snapshot?.measuredAt ?? null, new Date())) return
  after(async () => {
    try {
      const rows = await prisma.document.findMany({
        where: { docKey: { not: null }, ...activeDocumentWhere() },
        select: { id: true, docKey: true, versions: { orderBy: { versionNo: 'desc' }, take: 1, select: { versionNo: true } } },
      })
      // 측정도 버전 없는 문서는 docs 에 넣지 않는다 — 여기서 넣으면 영원히 "다르다" 가 된다
      const current = rows.flatMap((r) =>
        r.docKey && r.versions[0] ? [{ key: r.docKey, dmsId: r.id, dmsVersion: r.versions[0].versionNo }] : [],
      )
      // 비교가 먼저다 — 판이 같은데 권리부터 잡으면 10분 동안 쓸데없이 막는다
      if (!measuredDocsDiffer(snapshot?.docs ?? null, current)) return
      if (!(await claimRefresh())) return
      console.log('정합성 재측정: 최신 스냅샷이 지금 판과 다르다 (메인 방문)')
      const runId = await startRun()
      const started = Date.now()
      const outcome = await measureConsistency({ prisma, getObjectBytes })
      logOutcome(outcome, Date.now() - started)
      await finishRun(runId, outcome)
    } catch (err) {
      console.error('정합성 재측정 실패:', err)
    }
  })
}

/**
 * 마지막 시도가 쿨다운보다 오래됐을 때만 시각을 갱신하고 true. 행이 없으면 만든다.
 * 측정이 실패해 스냅샷이 안 생겨도 이 시각이 남아 매 방문 재측정을 막는다. 같은 행을 두 요청이
 * 동시에 갱신하려 하면 뒤쪽은 앞쪽이 쓴 값으로 WHERE 를 다시 보고 0행을 받는다.
 */
async function claimRefresh(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO consistency_refresh (id, attempted_at) VALUES ('main', now())
    ON CONFLICT (id) DO UPDATE SET attempted_at = now()
      WHERE consistency_refresh.attempted_at < now() - make_interval(secs => ${REFRESH_COOLDOWN_MS / 1000})
    RETURNING id`
  return rows.length > 0
}
