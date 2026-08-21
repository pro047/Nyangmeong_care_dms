# 단계: 구현

기능: $FEATURE

## 출력 (이 파일 하나만 쓴다)
$WORK/IMPL.md

## 입력 (읽기만, 절대 수정 금지)
- `$WORK/DESIGN.md` — 이 설계를 그대로 구현한다
- `$WORK/JUDGE.md` — 설계 주장의 감사 결과. **`반박` 판정이 있으면 그 주장에 기댄
  부분을 그대로 구현하지 마라.** 판정과 설계가 충돌하면 STATUS: BLOCKED
- `$WORK/FAIL_LOG.md` — 비어있지 않다면 이전 시도가 실패한 것이다. 같은 실패를 반복하지 마라
- `$ROOT/CLAUDE.md` — 코딩 규칙과 함정

## 할 일
1. DESIGN.md 의 "변경 대상 파일 목록"대로만 수정한다.
2. 목록에 없는 파일을 건드려야 한다면 STATUS: BLOCKED.
3. 작업 요약을 `$WORK/IMPL.md` 에 쓴다.

## IMPL.md 필수 섹션
- STATUS 라인 (첫 줄)
- 실제로 수정한 파일 목록 (설계와 다르면 그 이유)
- 설계와 달라진 점 (없으면 "없음")
- 다음 단계(검증)가 알아야 할 것
- **실행해서 확인한 것 / 확인하지 못한 것** — 돌린 명령과 실제 출력만 쓴다.
  못 돌렸으면 그 이유를 쓴다(예: `.env` 없음 → `npm run build` 불가).
  "될 것으로 보인다"는 금지

## 이 저장소의 코딩 규칙
- **UI 문구와 코드 주석은 한국어.** 사용자가 전원 한국인 팀이다
- 주석은 "왜"만 적는다. 코드를 읽으면 아는 "무엇"은 적지 않는다
- 주석 밀도는 주변 코드에 맞춘다
- Next 16 기능을 쓰기 전에 `$ROOT/node_modules/next/dist/docs/` 의 해당 문서를 읽는다
- Prisma import 경로는 `@/generated/prisma/client`

## 손대면 안 되는 것 — 필요하면 STATUS: BLOCKED
- `package.json` 의 의존성 (패키지 추가/제거는 사람 승인 사항)
- `vitest.config.mts` (검증 단계의 게이트 설정이다)
- `prisma/schema.prisma` 의 마이그레이션 필요한 변경
- `.env` / `.env.example` / `.gitignore` 의 `!.env.example` 예외
- `DATABASE_URL` 의 `connection_limit=5`
- `AGENTS.md` (next dev 가 자동 생성하는 파일)
- `MILESTONES.md` (파이프라인 완주 후 사람이 갱신한다)

## 금지
- 테스트·검증 스크립트를 작성하지 않는다. 그건 다음 단계다.
- 설계를 바꾸지 않는다. 설계가 틀렸으면 BLOCKED.
