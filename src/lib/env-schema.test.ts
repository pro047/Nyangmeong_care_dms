import { describe, expect, it } from 'vitest'
import { envSchema } from '@/lib/env-schema'

/** 형태만 맞춘 가짜 값. 실제 비밀이 아니다. */
const VALID = {
  DATABASE_URL: 'postgresql://user:pw@localhost:5432/dms?sslmode=require&uselibpqcompat=true',
  DISCORD_CLIENT_ID: '1234567890123456789',
  DISCORD_CLIENT_SECRET: 'abcdefghijklmnopqrstuvwxyz012345',
  DISCORD_GUILD_ID: '9876543210987654321',
  AUTH_SECRET: 'x'.repeat(44),
  APP_URL: 'http://localhost:3002',
  AWS_REGION: 'ap-northeast-2',
  AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
  AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  S3_BUCKET: 'nyangmeong-dms',
  DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/abc',
}

describe('envSchema', () => {
  it('정상 값을 통과시켜야 한다', () => {
    expect(envSchema.safeParse(VALID).success).toBe(true)
  })

  it('process.env 처럼 관계없는 키가 섞여 있어도 통과해야 한다', () => {
    expect(envSchema.safeParse({ ...VALID, PATH: '/usr/bin', VERCEL: '1' }).success).toBe(true)
  })

  it('DISCORD_WEBHOOK_URL 은 없거나 빈 문자열이어도 된다 (선택 항목)', () => {
    const withoutWebhook: Record<string, string> = { ...VALID }
    delete withoutWebhook.DISCORD_WEBHOOK_URL
    expect(envSchema.safeParse(withoutWebhook).success).toBe(true)
    expect(envSchema.safeParse({ ...VALID, DISCORD_WEBHOOK_URL: '' }).success).toBe(true)
  })

  // 이 테스트가 이 파일의 존재 이유다. vercel env pull 이 Sensitive 변수를 이 리터럴로
  // 내려보내는데, 예전 스키마(대부분 min(1))에서는 11개 중 8개가 그대로 통과했다.
  it('[SENSITIVE] 플레이스홀더를 모든 키에서 거부해야 한다', () => {
    const survived = Object.keys(VALID).filter(
      (key) => envSchema.safeParse({ ...VALID, [key]: '[SENSITIVE]' }).success,
    )

    expect(survived).toEqual([])
  })

  it('빈 문자열을 필수 키에서 거부해야 한다', () => {
    const survived = Object.keys(VALID)
      .filter((key) => key !== 'DISCORD_WEBHOOK_URL')
      .filter((key) => envSchema.safeParse({ ...VALID, [key]: '' }).success)

    expect(survived).toEqual([])
  })

  it('AWS 리전은 다른 파티션도 받아야 한다', () => {
    // 여기서 튕기면 멀쩡한 설정으로 앱이 안 뜬다. 조이는 쪽 오류도 오류다.
    for (const region of ['ap-northeast-2', 'us-east-1', 'us-gov-west-1', 'cn-north-1', 'us-iso-east-1']) {
      expect(envSchema.safeParse({ ...VALID, AWS_REGION: region }).success).toBe(true)
    }
  })

  it('S3 버킷 이름 규칙을 지켜야 한다 (3~63자, 시작·끝은 문자나 숫자)', () => {
    for (const ok of ['abc', 'my-bucket.v2', 'a'.repeat(63)]) {
      expect(envSchema.safeParse({ ...VALID, S3_BUCKET: ok }).success).toBe(true)
    }
    for (const bad of ['ab', 'a'.repeat(64), 'My-Bucket', '-bucket', 'bucket-', 'my_bucket']) {
      expect(envSchema.safeParse({ ...VALID, S3_BUCKET: bad }).success).toBe(false)
    }
  })

  it('DATABASE_URL 은 postgres 계열만 받아야 한다', () => {
    expect(envSchema.safeParse({ ...VALID, DATABASE_URL: 'postgres://x/y' }).success).toBe(true)
    expect(envSchema.safeParse({ ...VALID, DATABASE_URL: 'mysql://x/y' }).success).toBe(false)
  })
})
