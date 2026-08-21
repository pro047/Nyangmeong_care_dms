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
  },
})
