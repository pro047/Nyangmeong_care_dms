import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { authorizationServerMetadata } from '@/lib/oauth/metadata'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(authorizationServerMetadata(env.APP_URL), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
