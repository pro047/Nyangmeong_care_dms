import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notifyUpload } from '@/lib/discord'
import { MAX_UPLOAD_BYTES } from '@/lib/s3'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  folderId: z.string().optional(),
  s3Key: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
})

/** S3 업로드가 끝난 뒤 호출된다. 문서와 첫 버전(v1)을 함께 만든다. */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { title, description, folderId, ...file } = parsed.data

  const document = await prisma.document.create({
    data: {
      title,
      description,
      folderId,
      createdById: session.id,
      versions: {
        create: {
          versionNo: 1,
          s3Key: file.s3Key,
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          uploadedById: session.id,
        },
      },
    },
    select: { id: true, title: true },
  })

  // 알림 실패가 업로드를 되돌리면 안 되므로 결과를 기다리되 예외는 삼킨다.
  await notifyUpload({
    documentId: document.id,
    title: document.title,
    versionNo: 1,
    fileName: file.fileName,
    uploaderName: session.username,
  })

  return NextResponse.json({ id: document.id }, { status: 201 })
}
