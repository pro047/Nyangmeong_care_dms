# DMS 셋업 가이드

`.env`는 gitignore 대상이라 저장소에 없다. **새 체크아웃에서는 직접 만들어야 한다.**
채울 변수는 11개고 형식은 `src/lib/env.ts`가 zod로 검증한다 — 하나라도 비었거나
형식이 틀리면 앱이 안 뜨고 **어떤 변수가 문제인지 이름을 찍어준다.**

---

## 0. `.env` 만들기

`.env.example`을 복사하되 **값이 빈 문자열(`""`)인 항목을 그냥 두면 안 된다.**
`min(1)` 검사에 걸려 전부 튕긴다.

```bash
cp .env.example .env
openssl rand -base64 32     # 출력을 AUTH_SECRET에 넣는다
```

여기서 바로 채울 수 있는 것:

| 변수 | 값 |
|---|---|
| `AUTH_SECRET` | 위 `openssl` 출력 (44자). `min(32)`는 길이만 보므로 직접 짓지 말 것 |
| `APP_URL` | `http://localhost:3002` — **끝 슬래시 금지** (리다이렉트 URI가 어긋난다) |
| `AWS_REGION` | `ap-northeast-2` |
| `DISCORD_WEBHOOK_URL` | 선택. 안 쓰면 `""` 그대로 둔다 |

나머지 7개는 아래 1~4번에서 가져온다.

---

## 1. 개발용 DB — 기존 RDS에 SSH 터널로 직결 (지금은 안 씀)

> **먼저 읽을 것: 이 절은 현재 경로가 아니다.** `hymn.pem` 이 개발 PC 에 없어 터널을 못 연다.
> 지금 쓰는 것은 아래 **"★ 현재 쓰는 것: Neon"** 이다. 이 절은 키가 확보돼 RDS 로 돌아갈
> 때를 위해 남겨 둔다 (2026-08-25).

로컬에 Docker/PostgreSQL이 없으므로, 기존 EC2를 경유해 RDS에 붙는다.
RDS를 인터넷에 노출하지 않고, 배포할 때 DB를 갈아끼울 필요도 없다.

```
내 PC:15432  ──SSH 터널──▶  EC2  ──VPC 내부──▶  RDS:5432
```

### 1-1. RDS 안에 `dms` 데이터베이스 생성

인스턴스를 새로 만드는 게 아니라 기존 인스턴스 안에 DB만 추가한다.
hymn과 분리된 네임스페이스라 테이블이 섞이지 않는다.

EC2에 접속해서:

```bash
psql "host=<RDS엔드포인트> user=appuser dbname=postgres sslmode=require" \
  -c "CREATE DATABASE dms;"
```

`sslmode=require`를 빼면 에러가 **두 줄** 나온다. psql 기본값이 `prefer`라
SSL로 한 번, 실패하면 SSL 없이 한 번 더 시도하는데 RDS는 비암호화 접속을 거절하기
때문이다. 두 번째 줄(`no pg_hba.conf entry ... no encryption`)은 별개 문제가 아니다.

psql이 없으면 `sudo dnf install -y postgresql15` (Amazon Linux 2023)
또는 `sudo apt install -y postgresql-client` (Ubuntu).

### 1-2. 로컬에서 터널 열기

**별도 터미널 창**에서 실행하고, 개발하는 동안 계속 열어둔다.
(Windows는 Git Bash, macOS·Linux는 기본 터미널)

```bash
ssh -N hymn-tunnel
```

`~/.ssh/config`에 `hymn-tunnel` 별칭이 있다 (`LocalForward 15432 → RDS:5432`).
별칭 없이 쓰려면:

```bash
ssh -i ~/.ssh/hymn.pem -N \
  -L 15432:hymn-stg-db.ctw2gq62wmcc.ap-northeast-2.rds.amazonaws.com:5432 \
  ubuntu@<EC2퍼블릭IP>
```

`-N`은 셸 없이 포워딩만 한다는 뜻. 터널이 끊기면 Prisma가 연결 에러를 내는데,
터널만 다시 띄우면 된다.

**EC2에 탄력적 IP가 없어서 재시작할 때마다 퍼블릭 IP가 바뀐다** (M6 미완 항목).
바뀌면 `~/.ssh/config`의 `HostName`을 고친다. 새 값은:

```bash
aws ec2 describe-instances --region ap-northeast-2 \
  --filters "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].[Tags[?Key==`Name`].Value|[0],PublicIpAddress]' --output table
```

### 1-3. `.env`

```
DATABASE_URL="postgresql://유저:비번@localhost:15432/dms?uselibpqcompat=true&sslmode=require&connection_limit=5"
```

호스트는 RDS 엔드포인트가 아니라 **`localhost:15432`** 다. 엔드포인트는 터널의 반대편이라
`ssh -L` 쪽에만 쓴다.

`유저`는 **`appuser`** 다. hymn 백엔드가 쓰는 것과 같은 계정이고 `CREATE DATABASE`
권한이 있다(2026-08-21 확인). DB만 `dms`로 다르므로 테이블은 안 섞인다.

**비밀번호는 AWS 콘솔에서 조회할 수 없고, 재설정하면 hymn이 인증 실패로 죽는다.**
EC2에서 실행 중인 컨테이너의 환경변수에 들어 있다:

```bash
docker inspect app-backend-1 --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -i 'database\|postgres\|pass'
```

> **`connection_limit=5`를 반드시 넣을 것.**
> 이 인스턴스의 `max_connections`가 **79뿐이다** (2026-08-21 실측).
> 제한이 없으면 Prisma 기본 풀이 `코어×2+1`(8코어 맥에서 17)로 잡히고,
> HMR 재연결로 풀이 안 닫힌 채 쌓이면 **혼자서도 고갈시킬 수 있다.**
> 같은 인스턴스에서 hymn 백엔드가 `postgres` DB에 커넥션 4개로 돌고 있다.

> **`uselibpqcompat=true` 를 빼지 말 것.** 이게 없으면 `db push` 는 통과하는데
> **앱만** `P1011 TlsConnectionError: self-signed certificate in certificate chain`
> 으로 죽는다. 같은 URL을 두 파서가 다르게 읽기 때문이다 — 아래 "두 파서" 절 참조.

> 비밀번호에 `@ : / ?` 등이 있으면 URL 인코딩할 것 (`@` → `%40`).

### ★ 현재 쓰는 것: Neon (2026-08-25 ~)

**위 1번(RDS + SSH 터널)은 지금 안 쓴다.** `hymn.pem` 이 개발 PC 에 없어 터널을 못 열었고,
https://neon.tech 무료 PostgreSQL 로 갈아탔다. 위 절은 키가 확보됐을 때를 위해 남겨 둔다.

Neon 연결 문자열을 그대로 `DATABASE_URL` 에 넣되 **`uselibpqcompat=true` 는 빼야 한다** —
그건 터널 때문에 호스트가 `localhost` 라 인증서 검증이 원리상 불가능해서 넣었던 우회책이다.
Neon 은 실제 도메인이라 `sslmode=require` 로 검증이 정상 통과한다 (2026-08-25 실측).

```
DATABASE_URL="postgresql://유저:비번@ep-....neon.tech/neondb?sslmode=require&connection_limit=5"
```

**개발에는 direct 엔드포인트를 쓴다.** 대시보드의 "Pooled connection" 토글을 끈 쪽이다 —
pooled 로는 `db push` 같은 스키마 변경이 어긋난다. **배포(Vercel)에서는 반대로 pooled 를
쓴다** (`MILESTONES.md` M6 참조).

> **배포 때 RDS 로 전환하지 않는다.** 배포처가 EC2 에서 Vercel 로 바뀌면서 개발도 운영도
> 같은 Neon 을 쓰기로 했다 (근거는 `MILESTONES.md` "확정된 설계 결정" 표).

## 2. 디스코드 OAuth 앱 — 5분

1. https://discord.com/developers/applications → `New Application` (이름: DMS)
2. 좌측 `OAuth2` 탭
   - `Client ID` 복사 → `.env`의 `DISCORD_CLIENT_ID`
   - `Reset Secret`으로 시크릿 발급 → `DISCORD_CLIENT_SECRET`
   - `Redirects`에 아래 두 개 **모두** 추가 후 저장
     ```
     http://localhost:3002/api/auth/callback
     https://<배포주소>/api/auth/callback     ← 배포할 때 추가 (지금은 생략 가능)
     ```
3. 팀 디스코드 서버 ID 확인
   - 디스코드 앱 → 설정 → 고급 → **개발자 모드 ON**
   - 서버 아이콘 우클릭 → `서버 ID 복사` → `.env`의 `DISCORD_GUILD_ID`

## 3. S3 버킷 — 5분

1. AWS 콘솔 → S3 → `버킷 만들기`
   - 이름: `팀이름-dms-docs` (전역 고유해야 함)
   - 리전: `ap-northeast-2` (서울)
   - **퍼블릭 액세스 차단: 전부 켜둔 채로 유지** — 파일은 서명 URL로만 접근한다
2. 브라우저에서 S3로 직접 업로드하므로 CORS 설정이 필요하다.
   버킷 → `권한` → `CORS` → **`infra/s3-cors.json` 내용 붙여넣기**
3. IAM → 사용자 생성 (`dms-app`) → 인라인 정책으로 **`infra/iam-dms-app.json` 붙여넣기**
   (`BUCKET_NAME`을 실제 버킷 이름으로 치환) → 액세스 키 발급 → `.env`에 입력
   - 콘솔 액세스는 주지 않는다. 앱이 API로만 쓴다

> 두 파일의 각 항목을 **왜** 그렇게 뒀는지는 `infra/README.md`에 있다.
> 콘솔에서 설정을 바꿨으면 그 파일들도 같이 고칠 것.

## 4. 디스코드 알림 웹훅 (선택) — 1분

팀 서버에서 알림 받을 채널 → 채널 편집 → 연동 → 웹후크 → `새 웹후크` →
URL 복사 → `.env`의 `DISCORD_WEBHOOK_URL`

---

## 실행

```bash
npm install
npx prisma generate   # src/generated/prisma 생성
npm run db:push       # 스키마를 DB에 반영 (Neon direct 엔드포인트로)
npm run dev           # http://localhost:3002
```

**포트가 3000이 아니라 3002인 이유**: 로컬에서 neemba의 `node` 컨테이너가 3000을,
grafana가 3001을 이미 점유하고 있다. Next가 자동으로 밀리면 그때그때 포트가 달라져
디스코드 `redirect_uri`가 어긋나므로 `package.json`의 `dev`에 `-p 3002`로 고정했다.

`npx prisma generate`를 따로 적은 이유: `npm install`의 postinstall이 이걸 돌리는데
**`.env`가 없는 상태로 설치했으면 `DATABASE_URL` 없음으로 실패한다.** 그러면
`src/generated/prisma`가 안 만들어져서 `@/generated/prisma/client` import가 전부 깨진다.
`.env`를 채운 뒤 한 번 더 돌리면 해결된다.

`db:push`는 마이그레이션 파일 없이 스키마를 바로 밀어넣는다. 개발 중엔 이게 빠르고,
운영 배포 직전에 `npm run db:migrate -- --name init`으로 마이그레이션을 확정하면 된다.

---

## 막혔을 때 — 증상으로 원인 구분하기

| 증상 | 원인 |
|---|---|
| `환경 변수가 올바르지 않습니다: X` | X가 비었거나 형식 위반. `AUTH_SECRET`은 32자 이상, `APP_URL`은 URL 꼴 |
| `Cannot find module '@/generated/prisma/client'` | `npx prisma generate` 안 돌림 (위 참조) |
| 디스코드 에러 화면이 뜨고 앱으로 안 돌아옴 | 포털 `Redirects` 미등록, 또는 `APP_URL` 불일치(끝 슬래시) |
| 돌아왔는데 "팀 디스코드 서버 멤버만 이용할 수 있습니다" | `DISCORD_GUILD_ID`가 틀림. `CLIENT_ID`와 바꿔 넣은 경우가 흔하다 (둘 다 18~19자리 숫자) |
| "로그인 처리 중 오류가 발생했습니다" | 멤버 검증은 통과했고 그 뒤가 실패. 대개 터널이 끊겨 DB 기록을 못 한 것 |
| Prisma 연결 에러 | 터널이 끊김. 터널만 다시 띄우면 앱 재시작 없이 회복된다 |
| `P1011` / `TlsConnectionError: self-signed certificate` | `DATABASE_URL`에 `uselibpqcompat=true` 누락 |
| 업로드가 조용히 실패 | S3 CORS 미설정 (3번 참조) |

`DISCORD_CLIENT_ID`는 **개발자 포털**에서, `DISCORD_GUILD_ID`는 **디스코드 앱**에서
가져온다. 둘 다 숫자라 헷갈리기 쉽고, 출처가 다르다는 걸 기억하면 덜 헷갈린다.

---

## 두 파서 — `DATABASE_URL` 이 같은데 동작이 다른 이유

Prisma 7 은 드라이버 어댑터가 필수라(`@prisma/adapter-pg`) **같은 URL 을 두 곳이
각자 파싱한다.** 둘의 해석이 달라서 "마이그레이션은 되는데 앱만 죽는" 상황이 난다.

| | 파서 | `sslmode=require` | `connection_limit=5` |
|---|---|---|---|
| `prisma db push` / `migrate` | Prisma 엔진 (Rust) | 암호화하되 **검증 안 함** | **적용됨** |
| 앱 런타임 | `PrismaPg` → node-postgres | **`verify-full` 로 취급** | **무시됨** (pg 는 `max` 를 본다) |

그래서 두 군데를 각각 맞춰야 한다 (2026-08-21 실측).

- **TLS** — URL 에 `uselibpqcompat=true` 를 넣어 pg 가 libpq 의미(암호화, 검증 없음)로
  읽게 한다. 터널을 타면 호스트명이 `localhost` 라 `verify-full` 은 **원리상 통과할 수 없다** —
  RDS 인증서의 도메인과 다르기 때문이다.
- **커넥션 수** — `src/lib/prisma.ts` 에서 `new PrismaPg({ ..., max: 5 })` 로 막는다.
  URL 의 `connection_limit` 은 CLI 만 읽는다.

### 이 절은 RDS + 터널일 때의 이야기다

**Neon 을 쓰는 지금은 해당 없다.** 호스트가 실제 도메인이라 `sslmode=require` 만으로
검증이 통과하고, `uselibpqcompat=true` 도 필요 없다 (2026-08-25 실측). 위 표는 `hymn.pem`
을 확보해 RDS 터널로 돌아갈 때 다시 필요하다.

배포(Vercel)에서도 같은 Neon 을 쓰므로 운영용으로 따로 손볼 것은 없다. 다만
**`DATABASE_URL` 은 pooled 엔드포인트로 넣는다** — 서버리스는 함수 인스턴스가 여러 개 뜨고
`src/lib/prisma.ts` 의 `max: 5` 는 인스턴스당이라 곱해진다.
