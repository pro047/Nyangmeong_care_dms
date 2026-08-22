import { env } from './env'

const API = 'https://discord.com/api/v10'

export const OAUTH_SCOPES = ['identify', 'guilds'] as const
export const redirectUri = () => `${env.APP_URL}/api/auth/callback`

export function buildAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: OAUTH_SCOPES.join(' '),
    state,
    prompt: 'none',
  })
  return `https://discord.com/oauth2/authorize?${params}`
}

export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
    }),
  })
  if (!res.ok) throw new Error(`디스코드 토큰 교환 실패 (${res.status})`)
  const json = (await res.json()) as { access_token: string }
  return json.access_token
}

type DiscordUser = { id: string; username: string; avatar: string | null }

export async function fetchDiscordUser(accessToken: string) {
  const res = await fetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`디스코드 사용자 조회 실패 (${res.status})`)
  const user = (await res.json()) as DiscordUser
  return {
    discordId: user.id,
    username: user.username,
    avatarUrl: user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
      : null,
  }
}

/** 팀 디스코드 서버 멤버인지 확인. 이게 사실상의 접근 제어다. */
export async function isGuildMember(accessToken: string): Promise<boolean> {
  const res = await fetch(`${API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`디스코드 서버 목록 조회 실패 (${res.status})`)
  const guilds = (await res.json()) as { id: string }[]
  return guilds.some((g) => g.id === env.DISCORD_GUILD_ID)
}

/** 업로드 알림. 실패해도 업로드 자체는 성공으로 처리한다. */
export async function notifyUpload(params: {
  documentId: string
  title: string
  versionNo: number
  fileName: string
  uploaderName: string
  changeNote?: string | null
}) {
  if (!env.DISCORD_WEBHOOK_URL) return

  // 로컬에서는 보내지 않는다. 개발하면서 올리는 테스트 파일이 팀 채널에 그대로
  // 쌓이고, 임베드 링크가 가리키는 /documents/[id] 는 아직 없어서 404 가 공유된다.
  // next dev 는 NODE_ENV=development, next start 는 production 이라 배포에서만 켜진다.
  if (process.env.NODE_ENV !== 'production') {
    console.info(`[개발] 디스코드 알림 생략: ${params.title} v${params.versionNo}`)
    return
  }

  const isNew = params.versionNo === 1
  const body = {
    embeds: [
      {
        title: `${isNew ? '📄 새 문서' : '🔄 문서 업데이트'} — ${params.title}`,
        url: `${env.APP_URL}/documents/${params.documentId}`,
        color: isNew ? 0x22c55e : 0x3b82f6,
        fields: [
          { name: '버전', value: `v${params.versionNo}`, inline: true },
          { name: '올린 사람', value: params.uploaderName, inline: true },
          { name: '파일', value: params.fileName, inline: false },
          ...(params.changeNote
            ? [{ name: '변경 내용', value: params.changeNote, inline: false }]
            : []),
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  }

  try {
    await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error('디스코드 알림 전송 실패:', err)
  }
}
