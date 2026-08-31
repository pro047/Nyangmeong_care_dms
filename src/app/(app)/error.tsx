'use client'

import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  // DB 연결 실패가 압도적으로 흔한 원인이라 그 경우를 따로 안내한다.
  // 이 화면을 보는 사람은 팀원이지 개발자가 아니다 — 안내는 그들이 실제로 할 수 있는
  // 행동이어야 한다. 예전 문구("SSH 터널이 열려 있는지 확인해주세요")는 개발자용
  // 지시가 새어 나온 것이었고, DB 를 Neon 직결로 옮긴 뒤로는 터널 자체가 없다.
  const looksLikeDbIssue = /connect|ECONNREFUSED|timeout|pool|database/i.test(error.message)

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-danger-soft">
        <AlertTriangle className="h-6 w-6 text-danger" />
      </div>
      <h2 className="text-base font-semibold text-ink">화면을 불러오지 못했습니다</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        {looksLikeDbIssue
          ? '데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요 — 계속되면 관리자에게 "DB 연결 실패"라고 알려주세요.'
          : '잠시 후 다시 시도해주세요. 계속 발생하면 관리자에게 알려주세요.'}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        다시 시도
      </button>
    </div>
  )
}
