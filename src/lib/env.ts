import { envSchema } from '@/lib/env-schema'

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
  throw new Error(
    `환경 변수가 올바르지 않습니다: ${missing}\n.env 파일을 .env.example과 비교해 채워주세요.`,
  )
}

export const env = parsed.data
