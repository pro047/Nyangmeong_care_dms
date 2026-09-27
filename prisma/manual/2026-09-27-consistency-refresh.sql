-- 메인 재측정 안전망의 마지막 시도 시각 표 (2026-09-27).
--
-- `migrate diff --from-config-datasource --to-schema` 가 만든 그대로다 — 새 표 하나라 기존 행 영향 없음.
-- 운영에는 docKey 스키마(`doc_keys` · `documents.doc_key`)와 **같은 단계에서** 돌린다. 코드가 먼저 배포되면
-- 메인의 `after()` 가 없는 표를 조회해 안전망이 조용히 매번 실패한다(페이지는 안 죽는다).
-- 되돌리기: DROP TABLE "consistency_refresh";

-- CreateTable
CREATE TABLE "consistency_refresh" (
    "id" TEXT NOT NULL,
    "attempted_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "consistency_refresh_pkey" PRIMARY KEY ("id")
);
