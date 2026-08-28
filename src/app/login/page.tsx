import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (await getSession()) redirect('/')

  const { error } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-xl font-semibold text-white">
            D
          </div>
          <h1 className="text-xl font-semibold text-ink">팀 문서 관리</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            프로젝트 문서를 한 곳에서 관리합니다.
          </p>
        </div>

        {error && (
          <p className="mb-5 rounded-lg border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}

        <a
          href="/api/auth/login"
          className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-[#5865F2] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#4752c4]"
        >
          <svg viewBox="0 0 127.14 96.36" className="h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
          </svg>
          디스코드로 로그인
        </a>

        <p className="mt-5 text-center text-xs leading-relaxed text-ink-subtle">
          팀 디스코드 서버 멤버만 이용할 수 있습니다.
        </p>
      </div>
    </main>
  )
}
