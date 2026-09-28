-- 측정 실행 상태 표 (2026-09-27). 메인 패널의 검사 완료 · 검사 중 · 검사 실패 표시가 읽는다.
--
-- `migrate diff` 가 만든 그대로다 — 새 표 하나라 기존 행 영향 없음. **코드보다 먼저** 운영에 돌린다 — 코드가 먼저 가면
-- 측정 시작 기록이 실패한다(측정 자체는 기록 실패와 무관하게 돈다 — consistency-schedule.ts 참조).
-- 되돌리기: DROP TABLE "consistency_run";

-- CreateTable
CREATE TABLE "consistency_run" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "ok" BOOLEAN,
    "reason" TEXT,

    CONSTRAINT "consistency_run_pkey" PRIMARY KEY ("id")
);

