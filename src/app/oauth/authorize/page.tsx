import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { env } from '@/lib/env'
import { MCP_RESOURCE_PATH } from '@/lib/oauth/metadata'
import { authorizeQuerySchema, errorRedirectUrl } from '@/lib/oauth/authorize-request'
import { matchesRegisteredRedirectUri } from '@/lib/oauth/redirect-uri'
import { verifyClientId } from '@/lib/oauth/tokens'

export const dynamic = 'force-dynamic'

type RawSearchParams = Record<string, string | string[] | undefined>

/** 중복 쿼리(`?a=1&a=2`)는 검색어와 달리 이 화면에서 의미가 없다 — 첫 값만 쓴다. */
function firstValues(params: RawSearchParams): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

function toQueryString(params: Record<string, string>): string {
  return new URLSearchParams(params).toString()
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
        <p className="text-sm text-danger">{message}</p>
      </div>
    </main>
  )
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const raw = firstValues(await searchParams)
  const parsed = authorizeQuerySchema.safeParse(raw)

  if (!parsed.success) {
    return <ErrorScreen message="요청 형식이 올바르지 않습니다." />
  }
  const query = parsed.data

  const client = await verifyClientId(query.client_id)
  if (!client) {
    return <ErrorScreen message="등록되지 않은 클라이언트입니다." />
  }
  if (!matchesRegisteredRedirectUri(query.redirect_uri, client.redirectUris)) {
    return <ErrorScreen message="등록되지 않은 redirect_uri 입니다." />
  }

  if (query.resource !== undefined && query.resource !== `${env.APP_URL}${MCP_RESOURCE_PATH}`) {
    redirect(
      errorRedirectUrl(query.redirect_uri, 'invalid_target', '지원하지 않는 resource 입니다.', query.state),
    )
  }

  const session = await getSession()
  if (!session) {
    const returnTo = `/oauth/authorize?${toQueryString(raw)}`
    redirect(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`)
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="mb-2 text-lg font-semibold text-ink">
          <strong>{client.clientName}</strong>이(가) DMS 에 접근하려고 합니다
        </h1>
        <p className="mb-5 text-sm text-ink-muted">{session.username}(으)로 로그인되어 있습니다.</p>
        <ul className="mb-6 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>문서 검색</li>
          <li>문서·버전 정보 읽기</li>
          <li>다운로드 링크 발급</li>
        </ul>
        <form method="POST" action="/api/oauth/authorize" className="flex gap-2">
          {Object.entries(raw).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <button
            type="submit"
            name="decision"
            value="deny"
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-canvas"
          >
            거부
          </button>
          <button
            type="submit"
            name="decision"
            value="allow"
            className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            허용
          </button>
        </form>
      </div>
    </main>
  )
}
