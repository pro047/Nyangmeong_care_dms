import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'node:crypto'
import { env } from './env'

export const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
})

/** 파일명 충돌과 한글/공백 문제를 피하려고 키는 UUID로 만들고 원본 이름은 DB에만 둔다. */
export function buildS3Key(fileName: string) {
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : 'bin'
  return `documents/${randomUUID()}.${ext}`
}

/** 브라우저가 S3로 직접 PUT 하도록 하는 서명 URL. 파일이 서버를 거치지 않는다. */
export function presignUpload(key: string, contentType: string) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  )
}

/**
 * 다운로드/미리보기용 서명 URL.
 * inline이면 브라우저에서 바로 열리고, 아니면 원본 파일명으로 내려받는다.
 */
export function presignDownload(key: string, fileName: string, inline: boolean) {
  const disposition = inline ? 'inline' : 'attachment'
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ResponseContentDisposition: `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    }),
    { expiresIn: 300 },
  )
}

export function deleteObject(key: string) {
  return s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
}

/** 주말 범위: PDF와 이미지만 브라우저에서 바로 미리보기. 나머지는 다운로드. */
export function canPreview(mimeType: string) {
  return mimeType === 'application/pdf' || mimeType.startsWith('image/')
}
