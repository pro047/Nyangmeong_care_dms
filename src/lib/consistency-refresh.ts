/**
 * 메인 페이지의 재측정 안전망 판정. 측정은 업로드·삭제 같은 계기가 있을 때만 도는데, 스크립트로
 * 키를 심은 직후(스크립트는 `after()` 를 못 부른다)나 `after()` 가 놓친 경우에는 대시보드가
 * 옛 스냅샷에 머문다. 메인을 열 때 "최신 스냅샷이 지금 판과 다른가"를 보고 다시 잰다.
 *
 * **시각(`updated_at`)으로 가르지 않는다** — 버전만 붙이는 재업로드는 부모 `updated_at` 을
 * 안 바꾸고(2026-09-27 실측), 스크립트의 raw SQL 도 안 바꾼다. 비교는 두 구멍이 다 없다.
 */

/**
 * 메인에서는 마지막 측정이 이 안이면 예약하지 않는다. S3 에서 못 읽는 문서는 스냅샷 `docs` 에서
 * 빠지므로 비교가 영원히 "다르다" 가 된다 — 쿨다운이 없으면 메인을 열 때마다 전부 다시 잰다.
 * 업로드·삭제 경로의 즉시 측정에는 걸지 않는다.
 */
export const REFRESH_COOLDOWN_MS = 10 * 60 * 1000

export type MeasuredDoc = { key: string; dmsId: string; dmsVersion: number }

export function inRefreshCooldown(measuredAt: Date | null, now: Date): boolean {
  if (!measuredAt) return false
  return now.getTime() - measuredAt.getTime() < REFRESH_COOLDOWN_MS
}

/**
 * 스냅샷이 잰 {key → 문서·판} 과 지금의 {docKey → 문서·최신 판} 이 다른가. 스냅샷이 없으면 다르다.
 * 옛 manifest 시절 스냅샷은 dmsId 가 지금 문서 id 와 달라 자연히 "다르다" 가 된다.
 */
export function measuredDocsDiffer(snapshot: MeasuredDoc[] | null, current: MeasuredDoc[]): boolean {
  if (!snapshot) return true
  if (snapshot.length !== current.length) return true
  const measured = new Map(snapshot.map((d) => [d.key, d]))
  return current.some((d) => {
    const m = measured.get(d.key)
    return !m || m.dmsId !== d.dmsId || m.dmsVersion !== d.dmsVersion
  })
}
