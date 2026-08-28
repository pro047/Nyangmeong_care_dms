import Link from 'next/link'
import { FileQuestion } from 'lucide-react'

// 이 세그먼트에만 둔다. (app)/ 에 두면 다른 페이지의 notFound() 까지 "문서" 문구로 잡힌다.
export default function DocumentNotFound() {
  return (
    <div>
      <div className="rounded-xl border border-dashed border-border-strong bg-surface py-20 text-center">
        <FileQuestion className="mx-auto mb-3 h-8 w-8 text-ink-subtle" aria-hidden />
        <p className="text-sm font-medium text-ink">문서를 찾을 수 없습니다</p>
        <p className="mt-1 text-sm text-ink-muted">삭제된 문서라면 휴지통에 있을 수 있습니다.</p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link
            href="/"
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            전체 문서
          </Link>
          <Link
            href="/trash"
            className="rounded-lg border border-border px-3.5 py-2 text-sm text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            휴지통
          </Link>
        </div>
      </div>
    </div>
  )
}
