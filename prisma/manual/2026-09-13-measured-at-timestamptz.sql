-- `consistency_snapshots.measured_at` 을 timestamptz 로 바꾼다 (2026-09-13).
--
-- **`db push` 로 하지 말 것.** Prisma 가 만드는 SQL 은 `USING` 이 없는
-- `ALTER COLUMN ... SET DATA TYPE TIMESTAMPTZ(3)` 하나이고, 그러면 기존 행이
-- **DB 세션의 TimeZone 으로** 재해석된다. 저장값은 UTC 벽시계이므로 UTC 를 명시해야 한다.
-- (Neon 은 세션 TZ 가 GMT 라 결과가 같지만 그건 우연이고 기대면 안 된다.)
--
-- 적용: npx prisma db execute --file prisma/manual/2026-09-13-measured-at-timestamptz.sql
-- 그 뒤 `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
-- --script` 가 비어야 한다.
--
-- 운영에는 진짜 측정 1건이 들어 있다(2026-09-12). 변환 뒤 값이
-- `2026-09-11 11:14:48+00` 인지 대조할 것 — 저쪽이 보낸 `20:14:48+09:00` 과 같은 순간이다.
ALTER TABLE "consistency_snapshots"
  ALTER COLUMN "measured_at" TYPE TIMESTAMPTZ(3)
  USING "measured_at" AT TIME ZONE 'UTC';
