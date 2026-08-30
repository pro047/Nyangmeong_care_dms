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
  /** 객체가 올라갔을 수 있는데 문서가 되지 못했을 때. 실패는 삼킨다(최선 노력). */
  discard: (presigned: PresignResult) => Promise<void>
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
    //
    // 어느 쪽이든 정리를 부른다. abort 는 **본문을 다 보낸 뒤 응답이 오기 전**에도 걸리고
    // (close() 가 cancelled 를 세운 직후 xhr.abort() 한다), 그때 객체는 이미 S3 에 있다.
    // 여기서 안 부르면 s3:ListBucket 이 없어 사후에 찾지도 못하는 고아가 된다.
    // 객체가 없는 경우에 불려도 무해하다 — DeleteObject 는 멱등이다(실측 X6).
    fireDiscard(deps, presigned)
    return batch.cancelled ? { kind: 'cancelled' } : errorOutcome(err)
  }

  // PUT 이 끝난 뒤 취소됐을 수 있다(100% 직후 취소). 사람이 그만두라고 했으면
  // 문서를 만들지 않고, 이미 올라간 객체는 정리에 맡긴다.
  if (batch.cancelled) {
    fireDiscard(deps, presigned)
    return { kind: 'cancelled' }
  }

  try {
    await deps.create(presigned)
  } catch (err) {
    // 저장은 됐는데 응답만 잃은 경우일 수 있다. 여기서 가리지 않는다 — 실제로 지울지는
    // 서버가 그 키의 참조 수를 보고 정한다.
    fireDiscard(deps, presigned)
    return errorOutcome(err)
  }

  return { kind: 'done' }
}

/**
 * 기다리지 않는다 — 사람이 닫은 뒤의 정리 요청이 취소·실패 반환을 지연시키면 안 된다.
 * 실패도 삼킨다. 정리에 실패해 봐야 고아가 남을 뿐이고, 그건 이 함수가 판단할 일이 아니다.
 */
function fireDiscard(deps: UploadFlowDeps, presigned: PresignResult) {
  void deps.discard(presigned).catch(() => {})
}

function errorOutcome(err: unknown): UploadOutcome {
  return { kind: 'error', message: err instanceof Error ? err.message : UNKNOWN_ERROR }
}
