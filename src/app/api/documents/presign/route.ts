import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { buildS3Key, presignUpload, MAX_UPLOAD_BYTES } from '@/lib/s3'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
})

export async function POST(req: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: `파일이 너무 크거나 형식이 올바르지 않습니다. (최대 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)` },
      { status: 400 },
    )
  }

  const key = buildS3Key(parsed.data.fileName)
  const url = await presignUpload(key, parsed.data.contentType)

  return NextResponse.json({ key, url })
}
