import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // 별도 플러그인 없이 tsconfig 의 "@/*" 별칭만 맞춰준다.
  // vite-tsconfig-paths 를 넣지 않은 이유: 별칭이 하나뿐이라 의존성을 늘릴 값이 없다.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // node 환경. 컴포넌트 렌더 테스트는 jsdom + @testing-library 가 더 필요해
    // 지금은 범위 밖이다 — 서버 로직(lib·route handler)만 덮는다.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 테스트 파일이 하나도 없으면 실패한다. 파이프라인 검증 단계가 테스트를
    // 안 쓰고 넘어간 것을 게이트가 통과시키면 안 된다.
    passWithNoTests: false,
    // 더미 값을 여기 박아 테스트를 밀폐한다. src/lib/env.ts 가 import 시점에 zod 로
    // 검증하며 throw 하므로 이게 없으면 env 를 거치는 모듈은 테스트가 아예 못 뜬다.
    // 실제 .env 를 읽게 하면 "체크아웃에 따라 .env 가 없다"는 문제를 테스트로 옮기는
    // 셈이고, CI 에서 값이 달라 결과가 흔들린다.
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      DISCORD_CLIENT_ID: 'test-client-id',
      DISCORD_CLIENT_SECRET: 'test-client-secret',
      DISCORD_GUILD_ID: 'test-guild-id',
      AUTH_SECRET: 'test-auth-secret-at-least-32-characters',
      APP_URL: 'http://localhost:3002',
      AWS_REGION: 'ap-northeast-2',
      AWS_ACCESS_KEY_ID: 'test-access-key-id',
      AWS_SECRET_ACCESS_KEY: 'test-secret-access-key',
      S3_BUCKET: 'test-bucket',
      DISCORD_WEBHOOK_URL: '',
    },
  },
})
