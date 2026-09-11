import { NextRequest, NextResponse } from 'next/server'
import { exchangeCode, fetchDiscordUser, isGuildMember } from '@/lib/discord'
import { createSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { RETURN_TO_COOKIE, safeReturnTo } from '@/lib/oauth/return-to'

export const dynamic = 'force-dynamic'

const fail = (reason: string) =>
  NextResponse.redirect(`${env.APP_URL}/login?error=${encodeURIComponent(reason)}`)

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const expectedState = req.cookies.get('dms_oauth_state')?.value

  if (!code) return fail('디스코드 인증이 취소되었습니다.')
  if (!state || state !== expectedState) return fail('인증 요청이 만료되었습니다. 다시 시도해주세요.')

  try {
    const accessToken = await exchangeCode(code)

    if (!(await isGuildMember(accessToken))) {
      return fail('팀 디스코드 서버 멤버만 이용할 수 있습니다.')
    }

    const profile = await fetchDiscordUser(accessToken)

    // 로그인할 때마다 닉네임/아바타를 최신으로 맞춘다.
    const user = await prisma.user.upsert({
      where: { discordId: profile.discordId },
      create: profile,
      update: { username: profile.username, avatarUrl: profile.avatarUrl },
    })

    await createSession({
      id: user.id,
      discordId: user.discordId,
      username: user.username,
      avatarUrl: user.avatarUrl,
    })

    // /oauth/authorize 에서 로그인을 거쳐 왔으면 그리로, 아니면 홈으로.
    const dest = safeReturnTo(req.cookies.get(RETURN_TO_COOKIE)?.value)
    const res = NextResponse.redirect(`${env.APP_URL}${dest}`)
    res.cookies.delete('dms_oauth_state')
    res.cookies.delete(RETURN_TO_COOKIE)
    return res
  } catch (err) {
    console.error('디스코드 로그인 실패:', err)
    return fail('로그인 처리 중 오류가 발생했습니다.')
  }
}
