/** 모달이 "그만둔다"를 표시하는 배치 플래그. */
export type UploadBatch = { cancelled: boolean }

export type PresignResult = { key: string; url: string; keyToken: string }

/**
 * 네트워크·XHR 을 밖에서 주입받는다. 파일·진행률 콜백·inFlight 등록은 호출자가 클로저로 감싼다.
 * 각 함수는 실패하면 throw 한다 (Error.message 가 사용자에게 보이는 문구).
 */
export type UploadFlowDeps = {
  presign: () => Promise<PresignResult>
  put: (presigned: PresignResult) => Promise<void>
  create: (presigned: PresignResult) => Promise<void>
}

export type UploadOutcome =
  | { kind: 'done' }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string }

export const UNKNOWN_ERROR = '알 수 없는 오류'

/**
 * 업로드 1건의 순서와 취소 지점.
 *
 * 컴포넌트가 아니라 여기 있는 이유: 이 버그는 "await 경계에서 취소 플래그를 안 봤다"는
 * 순서 문제라, 컴포넌트 안에 두면 테스트로 고정할 수단이 없다.
 *
 * batch 는 반드시 **참조**로 받는다. 호출 중간에 바깥 close() 가 cancelled 를 true 로
 * 바꾸는 것을 읽어야 한다 — 복사해서 넣으면 이 수정 전체가 무효가 된다.
 */
export async function runUploadFlow(
  batch: UploadBatch,
  deps: UploadFlowDeps,
): Promise<UploadOutcome> {
  if (batch.cancelled) return { kind: 'cancelled' }

  let presigned: PresignResult
  try {
    presigned = await deps.presign()
  } catch (err) {
    return errorOutcome(err)
  }

  // presign 을 기다리는 동안 사람이 닫았을 수 있다. 여기서 안 보면 이미 그만둔 업로드가
  // S3 로 끝까지 올라가고 고아 객체가 남는다.
  if (batch.cancelled) return { kind: 'cancelled' }

  try {
    await deps.put(presigned)
  } catch (err) {
    // abort 로 깨어난 것과 진짜 실패를 여기서 가른다.
    return batch.cancelled ? { kind: 'cancelled' } : errorOutcome(err)
  }

  // PUT 이 끝난 뒤 취소됐을 수 있다(100% 직후 취소). 사람이 그만두라고 했으면
  // 문서를 만들지 않는다. S3 객체는 고아로 남는데, 정리 경로는 아직 없다.
  if (batch.cancelled) return { kind: 'cancelled' }

  try {
    await deps.create(presigned)
  } catch (err) {
    return errorOutcome(err)
  }

  return { kind: 'done' }
}

function errorOutcome(err: unknown): UploadOutcome {
  return { kind: 'error', message: err instanceof Error ? err.message : UNKNOWN_ERROR }
}
