import { describe, expect, it } from 'vitest'
import {
  runUploadFlow,
  UNKNOWN_ERROR,
  type PresignResult,
  type UploadBatch,
  type UploadFlowDeps,
} from '@/lib/upload-flow'

const PRESIGNED: PresignResult = { key: 'documents/a.pdf', url: 'https://s3/put', keyToken: 'tok' }

/** 호출 순서와 인자를 기록하는 fake. 기본값은 "전부 성공". */
function makeDeps(overrides: Partial<UploadFlowDeps> = {}) {
  const calls: string[] = []
  const seen: { put?: PresignResult; create?: PresignResult } = {}

  const deps: UploadFlowDeps = {
    presign: async () => {
      calls.push('presign')
      return PRESIGNED
    },
    put: async (p) => {
      calls.push('put')
      seen.put = p
    },
    create: async (p) => {
      calls.push('create')
      seen.create = p
    },
    ...overrides,
  }

  return { deps, calls, seen }
}

describe('runUploadFlow', () => {
  it('시작 전에 이미 취소된 배치면 presign 도 호출하지 않아야 한다', async () => {
    const batch: UploadBatch = { cancelled: true }
    const { deps, calls } = makeDeps()

    const outcome = await runUploadFlow(batch, deps)

    expect(outcome).toEqual({ kind: 'cancelled' })
    expect(calls).toEqual([])
  })

  it('presign 이 끝나기 전에 취소되면 put·create 를 호출하지 않고 cancelled 여야 한다', async () => {
    // close() 가 presign await 중에 끼어든 상황.
    const batch: UploadBatch = { cancelled: false }
    const { deps, calls } = makeDeps({
      presign: async () => {
        calls.push('presign')
        batch.cancelled = true
        return PRESIGNED
      },
    })

    const outcome = await runUploadFlow(batch, deps)

    expect(outcome).toEqual({ kind: 'cancelled' })
    expect(calls).toEqual(['presign'])
  })

  it('put 이 끝난 뒤 취소돼 있으면 create 를 호출하지 않고 cancelled 여야 한다', async () => {
    const batch: UploadBatch = { cancelled: false }
    const { deps, calls } = makeDeps({
      put: async () => {
        calls.push('put')
        batch.cancelled = true
      },
    })

    const outcome = await runUploadFlow(batch, deps)

    expect(outcome).toEqual({ kind: 'cancelled' })
    expect(calls).toEqual(['presign', 'put'])
  })

  it('취소가 없으면 presign→put→create 순서로 한 번씩 호출하고 done 이어야 한다', async () => {
    const batch: UploadBatch = { cancelled: false }
    const { deps, calls } = makeDeps()

    const outcome = await runUploadFlow(batch, deps)

    expect(outcome).toEqual({ kind: 'done' })
    expect(calls).toEqual(['presign', 'put', 'create'])
  })

  it('presign 이 throw 하면 error 이고 put 은 호출되지 않아야 한다', async () => {
    const batch: UploadBatch = { cancelled: false }
    const { deps, calls } = makeDeps({
      presign: async () => {
        throw new Error('업로드 준비 실패')
      },
    })

    const outcome = await runUploadFlow(batch, deps)

    expect(outcome).toEqual({ kind: 'error', message: '업로드 준비 실패' })
    expect(calls).toEqual([])
  })

  it('put 이 reject 했고 배치가 취소돼 있으면 cancelled 여야 한다', async () => {
    // xhr.abort() 가 부른 reject. 사람이 그만둔 것이므로 오류로 보이면 안 된다.
    const batch: UploadBatch = { cancelled: false }
    const { deps } = makeDeps({
      put: async () => {
        batch.cancelled = true
        throw new Error('업로드를 취소했습니다.')
      },
    })

    const outcome = await runUploadFlow(batch, deps)

    expect(outcome).toEqual({ kind: 'cancelled' })
  })

  it('put 이 reject 했고 취소가 아니면 error 여야 한다', async () => {
    const batch: UploadBatch = { cancelled: false }
    const { deps, calls } = makeDeps({
      put: async () => {
        throw new Error('S3 업로드 실패 (403)')
      },
    })

    const outcome = await runUploadFlow(batch, deps)

    expect(outcome).toEqual({ kind: 'error', message: 'S3 업로드 실패 (403)' })
    expect(calls).toEqual(['presign'])
  })

  it('create 가 throw 하면 error 여야 한다', async () => {
    const batch: UploadBatch = { cancelled: false }
    const { deps } = makeDeps({
      create: async () => {
        throw new Error('문서 저장 실패')
      },
    })

    const outcome = await runUploadFlow(batch, deps)

    expect(outcome).toEqual({ kind: 'error', message: '문서 저장 실패' })
  })

  it('Error 가 아닌 값을 throw 하면 message 가 알 수 없는 오류여야 한다', async () => {
    const batch: UploadBatch = { cancelled: false }
    const { deps } = makeDeps({
      presign: async () => {
        throw 'string throw'
      },
    })

    const outcome = await runUploadFlow(batch, deps)

    expect(outcome).toEqual({ kind: 'error', message: UNKNOWN_ERROR })
  })

  it('put 과 create 가 presign 결과를 그대로 받아야 한다', async () => {
    const batch: UploadBatch = { cancelled: false }
    const { deps, seen } = makeDeps()

    await runUploadFlow(batch, deps)

    expect(seen.put).toEqual(PRESIGNED)
    expect(seen.create).toEqual(PRESIGNED)
  })
})
