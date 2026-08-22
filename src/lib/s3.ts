import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'node:crypto'
import { env } from './env'

/** 팀 내부 도구 기준 상한. 늘리려면 S3 멀티파트 업로드가 필요해진다. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

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

/**
 * 객체의 실제 크기. 없으면 null.
 *
 * 두 가지를 한 번에 해결한다 — 브라우저가 PUT 을 실제로 끝냈는지 확인하고(안 그러면
 * 존재하지 않는 객체를 가리키는 문서가 생겨 다운로드 때 S3 XML 이 뜬다),
 * 크기를 클라이언트 신고값 대신 여기서 얻는다. presigned PUT 에는 크기 조건이
 * 서명돼 있지 않아서 신고값과 실제가 다를 수 있다.
 */
export async function headObjectSize(key: string): Promise<number | null> {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
    return res.ContentLength ?? null
  } catch {
    return null
  }
}

/** 주말 범위: PDF와 이미지만 브라우저에서 바로 미리보기. 나머지는 다운로드. */
export function canPreview(mimeType: string) {
  return mimeType === 'application/pdf' || mimeType.startsWith('image/')
}
