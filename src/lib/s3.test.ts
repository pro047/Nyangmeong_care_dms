import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getObjectBytes, s3 } from '@/lib/s3'

// 실제 S3 에 붙지 않는다. 클라이언트의 send 만 가로채 "무엇을 보내고 결과를 어떻게 삼키나"만 본다.
// env 는 vitest.config.mts 의 더미(S3_BUCKET=test-bucket)로 뜬다.
function spySend() {
  return vi.spyOn(s3, 'send') as unknown as MockInstance<(command: unknown) => Promise<unknown>>
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getObjectBytes', () => {
  it('maxBytes 를 주면 GetObjectCommand 에 bytes=0-maxBytes Range 를 걸어야 한다 (G1)', async () => {
    const send = spySend().mockResolvedValue({ Body: { transformToByteArray: async () => new Uint8Array() } })

    await getObjectBytes('documents/abc.csv', 1048576)

    expect(send).toHaveBeenCalledTimes(1)
    const command = send.mock.calls[0][0]
    expect(command).toBeInstanceOf(GetObjectCommand)
    expect((command as GetObjectCommand).input).toEqual({
      Bucket: 'test-bucket',
      Key: 'documents/abc.csv',
      Range: 'bytes=0-1048576',
    })
  })

  it('Body 가 있으면 transformToByteArray 결과를 그대로 돌려줘야 한다 (G2)', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    spySend().mockResolvedValue({ Body: { transformToByteArray: async () => bytes } })

    const result = await getObjectBytes('documents/abc.csv', 10)

    expect(result).toBe(bytes)
  })

  it('send 가 throw 하면 null 이어야 한다 (G3)', async () => {
    spySend().mockRejectedValue(new Error('NoSuchKey'))

    expect(await getObjectBytes('documents/missing.csv', 10)).toBeNull()
  })

  it('Body 가 없으면 null 이어야 한다 (G3)', async () => {
    spySend().mockResolvedValue({})

    expect(await getObjectBytes('documents/abc.csv', 10)).toBeNull()
  })
})
