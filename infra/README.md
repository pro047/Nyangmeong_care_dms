# AWS 설정 기록

AWS 리소스는 **콘솔에서 손으로 만든다.** 이 폴더는 실행되는 코드가 아니라
"콘솔에 무엇을 붙여넣었고 왜 그랬는지"의 기록이다.

테라폼을 안 쓰는 이유: 이 프로젝트가 새로 만드는 AWS 리소스는 S3 버킷 1개,
IAM 사용자 1명, (M6의) Elastic IP 정도다. 반면 RDS(`hymn-stg-db`)·EC2(`hymn-stg-ec2`)는
**hymn 이 운영 중인 자산을 빌려 쓰는 것**이라, 테라폼 state 에 넣는 순간 잘못된
`apply` 한 번에 hymn 을 죽일 수 있다. 재현성의 이득보다 그 위험이 크다.

리소스가 10개를 넘거나, 같은 구성을 두 번째로 만들게 되거나(스테이징),
인프라를 만지는 사람이 2명 이상이 되면 다시 판단한다.

**콘솔에서 설정을 바꿨으면 이 폴더의 파일도 같이 고칠 것.** 갈라지면 이 기록이
거짓말이 되고, 거짓말하는 문서는 없는 문서보다 나쁘다.

---

## `s3-cors.json`

버킷 → `권한` → `CORS` 에 붙여넣는다.

**왜 필요한가** — 파일이 앱 서버를 거치지 않고 브라우저에서 S3 로 직접 올라가기
때문이다(`src/components/upload-dialog.tsx:23`, XHR `PUT`). 크로스 오리진 요청이라
S3 쪽에 허용이 없으면 preflight 에서 막힌다. 업로드만 조용히 실패하고 다른 기능은
멀쩡해서 원인을 찾기 어렵다.

| 항목 | 근거 |
|---|---|
| `AllowedMethods: PUT` | **필수.** presigned PUT 업로드 경로 (`src/lib/s3.ts:24`) |
| `AllowedMethods: GET` | 지금은 **불필요.** 다운로드는 서버가 서명 URL 로 리다이렉트해서 브라우저가 그냥 이동하는 구조라 CORS 를 안 탄다 (`src/app/api/documents/[id]/download/route.ts:36`). M5 미리보기가 JS 로 파일을 읽게 되면 그때 필요해진다 |
| `AllowedHeaders: *` | XHR 이 `Content-Type` 을 직접 붙인다 (`upload-dialog.tsx:25`). 임의 MIME 타입이라 단순 헤더가 아니고, 그래서 preflight 가 발생한다 |
| `ExposeHeaders: ETag` | 지금은 **불필요.** 코드 어디서도 `ETag` 를 읽지 않는다(`src/` 전체 grep 결과 0건). S3 직접 업로드의 관례라 남겨뒀고, 지워도 현재 동작에는 영향이 없다 |
| `MaxAgeSeconds: 3000` | preflight 결과 캐시. 파일 여러 개를 연속으로 올릴 때 OPTIONS 왕복을 줄인다 |

`OPTIONS` 는 목록에 넣지 않는다. S3 가 CORS 설정을 보고 알아서 응답한다.

### M6 에서 할 일

배포 주소가 정해지면 `AllowedOrigins` 에 추가한다. **localhost 를 지우지 말 것** —
지우면 로컬 개발에서 업로드가 막힌다.

```json
"AllowedOrigins": ["http://localhost:3002", "https://<배포주소>"]
```

---

## `iam-dms-app.json`

IAM → 사용자 `dms-app` → 인라인 정책으로 붙여넣는다.
**`BUCKET_NAME` 을 실제 버킷 이름으로 바꿔야 한다.**

**액션이 이 세 개뿐인 이유** — 앱이 S3 에 하는 일이 그게 전부다
(`src/lib/s3.ts`: `PutObjectCommand`, `GetObjectCommand`, `DeleteObjectCommand`).
`s3:ListBucket` 은 쓰지 않으므로 넣지 않는다. 넣으면 이 계정이 버킷 안의 모든 키를
훑을 수 있게 되는데, 얻는 게 없다.

**ARN 이 `/documents/*` 로 끝나는 이유** — 두 가지가 겹쳐 있다.

1. `PutObject` 같은 객체 액션은 **객체 ARN**(`버킷/*`)에 걸어야 한다.
   `arn:aws:s3:::버킷` (끝에 `/*` 없음)은 버킷 자체를 가리켜서 안 먹힌다.
   콘솔에서 가장 흔히 틀리는 지점이다.
2. 앱이 만드는 키는 전부 `documents/` 로 시작한다 (`src/lib/s3.ts:20`
   `buildS3Key`). 접두사를 좁혀두면 이 자격증명이 유출돼도 그 밖의 객체는
   건드릴 수 없다.

> 키 규칙(`documents/<uuid>.<ext>`)을 바꾸면 이 ARN 도 같이 바꿔야 한다.
> 안 바꾸면 업로드가 `AccessDenied` 로 실패한다.

**콘솔 액세스는 주지 않는다.** 이 사용자는 앱이 API 로만 쓴다.
액세스 키 시크릿은 발급 화면을 닫으면 다시 볼 수 없으니 그 자리에서 `.env` 에 넣는다.
