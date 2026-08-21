import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { env } from './env'

// 개발 모드 HMR에서 커넥션이 계속 쌓이는 걸 막기 위한 싱글턴.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// max 를 여기 박는 이유: DATABASE_URL 의 connection_limit 은 Prisma 자체 풀(Rust)
// 파라미터라 CLI(db push·migrate)만 읽는다. Prisma 7 은 드라이버 어댑터가 필수라
// 앱 런타임의 풀은 node-postgres 것이고, 그쪽은 max 를 본다 — 이름이 달라서
// connection_limit 은 조용히 버려지고 pg 기본값 10 이 적용됐다.
// 공유 RDS 의 max_connections 가 79뿐이므로(2026-08-21 실측) 여기서 막는다.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 5 }),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
