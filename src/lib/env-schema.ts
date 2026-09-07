import { z } from 'zod'

/**
 * 환경 변수 스키마. 검증만 하는 순수 모듈이라 테스트에서 그냥 import 할 수 있다 —
 * env.ts 는 모듈 로드 시점에 실제 process.env 를 파싱하고 실패하면 던지므로 못 부른다.
 *
 * **"값이 있다"가 아니라 "값이 값인지"를 본다.** 원래 대부분이 `min(1)` 이었는데,
 * `vercel env pull` 이 Sensitive 변수를 리터럴 `[SENSITIVE]`(11자)로 내려보내자 11개 중
 * 8개가 그대로 통과했다. AUTH_SECRET 의 min(32) 와 URL 검사 둘이 우연히 걸어 준 것뿐이고,
 * 그게 없었다면 가짜 DATABASE_URL 로 빌드가 계속 진행됐다 (CLAUDE.md 함정 절 참조).
 *
 * 형식 검사는 공식 문서로 확인한 것만 넣는다. **너무 조이면 멀쩡한 값을 튕겨 앱이 안 뜬다** —
 * 여기서 나는 오류는 "설정이 틀렸다"로 보이지 "검증이 틀렸다"로 안 보여서 찾기가 더 어렵다.
 */
export const envSchema = z.object({
  // postgres:// 와 postgresql:// 를 둘 다 받는다. 뒤쪽(호스트·쿼리)은 검사하지 않는다 —
  // 터널·sslmode·uselibpqcompat 조합이 환경마다 달라서 형식을 못 고정한다.
  DATABASE_URL: z.string().startsWith('postgres'),

  // 디스코드 스노플레이크. 2015~2017 발급분이 17자리, 2024~2026 이 19~20자리다.
  DISCORD_CLIENT_ID: z.string().regex(/^\d{17,20}$/),
  DISCORD_GUILD_ID: z.string().regex(/^\d{17,20}$/),
  // 시크릿 길이는 공표된 값이 없어 형식 대신 하한만 둔다. 플레이스홀더를 걸러내는 것이 목적이다.
  DISCORD_CLIENT_SECRET: z.string().min(16),

  AUTH_SECRET: z.string().min(32),
  APP_URL: z.url(),

  // 리전은 일부러 느슨하다. ap-northeast-2 뿐 아니라 us-gov-west-1 · cn-north-1 ·
  // us-iso-east-1 같은 다른 파티션도 통과해야 한다.
  AWS_REGION: z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d+$/),
  // 액세스 키는 20자, 시크릿은 40자가 통례지만 임시 자격증명은 길이가 다르다. 하한만 둔다.
  AWS_ACCESS_KEY_ID: z.string().min(16),
  AWS_SECRET_ACCESS_KEY: z.string().min(30),
  // 3~63자, 소문자·숫자·점·하이픈, 시작과 끝은 문자 또는 숫자 (AWS 버킷 명명 규칙).
  S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),

  DISCORD_WEBHOOK_URL: z.url().optional().or(z.literal('')),

  // 남의 문서를 지울 수 있는 유일한 계정. 팀원이 나가면 그 사람 문서를 아무도 못 지우게
  // 되는 것에 대한 탈출구다 (ownership.ts). **optional 인 것이 안전한 기본값이다** —
  // 빠뜨리면 관리자가 없을 뿐 권한이 새지 않는다.
  ADMIN_DISCORD_ID: z.string().regex(/^\d{17,20}$/).optional().or(z.literal('')),
})
