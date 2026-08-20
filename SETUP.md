# DMS 셋업 가이드

`.env` 파일은 이미 만들어져 있고 `AUTH_SECRET`은 자동 생성됨.
아래 4개 항목만 채우면 개발 서버가 뜬다.

---

## 1. 개발용 DB — 기존 RDS에 SSH 터널로 직결

로컬에 Docker/PostgreSQL이 없으므로, 기존 EC2를 경유해 RDS에 붙는다.
RDS를 인터넷에 노출하지 않고, 배포할 때 DB를 갈아끼울 필요도 없다.

```
내 PC:15432  ──SSH 터널──▶  EC2  ──VPC 내부──▶  RDS:5432
```

### 1-1. RDS 안에 `dms` 데이터베이스 생성

인스턴스를 새로 만드는 게 아니라 기존 인스턴스 안에 DB만 추가한다.
기존 프로젝트 2개와 완전히 분리된 네임스페이스라 테이블이 섞이지 않는다.

EC2에 접속해서:

```bash
psql -h <RDS엔드포인트> -U <마스터유저> -d postgres -c "CREATE DATABASE dms;"
```

psql이 없으면 `sudo dnf install -y postgresql15` (Amazon Linux 2023)
또는 `sudo apt install -y postgresql-client` (Ubuntu).

### 1-2. 로컬에서 터널 열기

Git Bash **별도 창**에서 실행하고, 개발하는 동안 계속 열어둔다.

```bash
ssh -i ~/.ssh/<키파일>.pem -N -L 15432:<RDS엔드포인트>:5432 ec2-user@<EC2퍼블릭IP>
```

`-N`은 셸 없이 포워딩만 한다는 뜻. 터널이 끊기면 Prisma가 연결 에러를 내는데,
터널만 다시 띄우면 된다.

### 1-3. `.env`

```
DATABASE_URL="postgresql://유저:비번@localhost:15432/dms?sslmode=require&connection_limit=5"
```

> **`connection_limit=5`를 반드시 넣을 것.**
> Prisma 기본 커넥션 풀이 크고 개발 중 HMR로 계속 재연결되기 때문에,
> 제한이 없으면 같은 RDS 인스턴스를 쓰는 **운영 프로젝트 2개가 커넥션 부족으로 죽을 수 있다.**

> 비밀번호에 `@ : / ?` 등이 있으면 URL 인코딩할 것 (`@` → `%40`).
> 인증서 오류가 나면 `sslmode=require` → `sslmode=no-verify`.
> 터널을 타서 호스트명이 `localhost`라 RDS 인증서의 도메인과 맞지 않아서 발생한다.

### 대안: Neon 무료 티어

터널 유지가 번거로우면 https://neon.tech 에서 무료 PostgreSQL을 만들어
`DATABASE_URL`에 넣어도 된다. 단, 배포(M6) 때 RDS로 전환하며 마이그레이션을
다시 적용해야 한다. RDS 직결은 그 단계가 아예 없다.

## 2. 디스코드 OAuth 앱 — 5분

1. https://discord.com/developers/applications → `New Application` (이름: DMS)
2. 좌측 `OAuth2` 탭
   - `Client ID` 복사 → `.env`의 `DISCORD_CLIENT_ID`
   - `Reset Secret`으로 시크릿 발급 → `DISCORD_CLIENT_SECRET`
   - `Redirects`에 아래 두 개 **모두** 추가 후 저장
     ```
     http://localhost:3000/api/auth/callback
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
   버킷 → `권한` → `CORS` → 아래 붙여넣기:
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedOrigins": ["http://localhost:3000", "https://<배포주소>"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3000
     }
   ]
   ```
3. IAM → 사용자 생성 (`dms-app`) → 액세스 키 발급 → `.env`에 입력
   - 정책은 이 버킷에 대한 `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`만 부여

## 4. 디스코드 알림 웹훅 (선택) — 1분

팀 서버에서 알림 받을 채널 → 채널 편집 → 연동 → 웹후크 → `새 웹후크` →
URL 복사 → `.env`의 `DISCORD_WEBHOOK_URL`

---

## 실행

```bash
npm run db:push     # 스키마를 DB에 반영
npm run dev         # http://localhost:3000
```

`db:push`는 마이그레이션 파일 없이 스키마를 바로 밀어넣는다. 개발 중엔 이게 빠르고,
운영 배포 직전에 `npm run db:migrate -- --name init`으로 마이그레이션을 확정하면 된다.
