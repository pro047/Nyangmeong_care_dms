# DMS 셋업 가이드

`.env` 파일은 이미 만들어져 있고 `AUTH_SECRET`은 자동 생성됨.
아래 4개 항목만 채우면 개발 서버가 뜬다.

---

## 1. 개발용 DB (Neon 무료) — 3분

로컬에 Docker/PostgreSQL이 없으므로 개발 중엔 Neon 무료 티어를 쓴다.
운영 배포 때 `DATABASE_URL`만 기존 RDS 주소로 바꾸면 되고, 둘 다 PostgreSQL이라 스키마는 그대로 호환된다.

1. https://neon.tech 접속 → GitHub 계정으로 가입
2. `Create project` → 이름 `dms`, 리전 `AWS ap-southeast-1` (한국에서 제일 가까운 무료 리전)
3. 표시되는 `Connection string` 복사 (`postgresql://...?sslmode=require` 형태)
4. `.env`의 `DATABASE_URL`에 붙여넣기

> RDS를 개발에도 쓰고 싶다면 퍼블릭 액세스를 열어야 하는데, 운영 중인 프로젝트 2개가
> 같은 인스턴스에 붙어 있으므로 권장하지 않는다.

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
