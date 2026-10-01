### 먼저 읽을 것
- `$ROOT/CLAUDE.md` — 코딩 규칙과 함정

### 돌리지 못하는 검사
IMPL.md 에 검사를 못 돌린 이유를 쓸 때의 흔한 예: `.env` 없음 → `npm run build` 불가.

### 이 저장소의 코딩 규칙
- **UI 문구와 코드 주석은 한국어.** 사용자가 전원 한국인 팀이다
- 주석은 "왜"만 적는다. 코드를 읽으면 아는 "무엇"은 적지 않는다
- 주석 밀도는 주변 코드에 맞춘다
- Next 16 기능을 쓰기 전에 `$ROOT/node_modules/next/dist/docs/` 의 해당 문서를 읽는다
- Prisma import 경로는 `@/generated/prisma/client`

### 손대면 안 되는 것 — 필요하면 STATUS: BLOCKED
- `package.json` 의 의존성 (패키지 추가/제거는 사람 승인 사항)
- `vitest.config.mts` (검증 단계의 게이트 설정이다)
- `prisma/schema.prisma` 의 마이그레이션 필요한 변경
- `.env` / `.env.example` / `.gitignore` 의 `!.env.example` 예외
- `DATABASE_URL` 의 `connection_limit=5`
- `AGENTS.md` (next dev 가 자동 생성하는 파일)
- `MILESTONES.md` (파이프라인 완주 후 사람이 갱신한다)
