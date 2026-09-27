import { after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getObjectBytes } from '@/lib/s3'
import { measureWhenQuiet } from '@/lib/consistency-measure'

/**
 * 응답을 보낸 **뒤**에 정합성을 잰다. 측정 실패가 업로드 실패가 되면 안 된다(인계문 §7).
 * 실행 시간은 이 요청을 받은 라우트의 한도를 같이 쓴다 — 운영은 Hobby + Fluid Compute,
 * 최대 300초(2026-09-27 사람 확인). 로컬 실측은 19문서 파싱 151ms.
 */
export function scheduleConsistencyMeasure(): void {
  // 예약하는 지금 찍는다 — 이 요청의 쓰기는 이미 끝났으므로 그 updated_at 은 이 시각보다 늦을 수 없다
  const since = new Date()
  after(async () => {
    const started = Date.now()
    const outcome = await measureWhenQuiet({ prisma, getObjectBytes, since, wait: sleep })
    // 소요 시간을 남기는 이유: 라우트 한도(300초) 대비 여유를 운영 로그로 확인하려고 (대기 5초 포함)
    const ms = Date.now() - started
    if (outcome.ok) {
      console.log(`정합성 측정: 스냅샷 ${outcome.snapshotId} (문서 ${outcome.docs} · 못 읽음 ${outcome.missing} · ${ms}ms)`)
    } else {
      console.log(`정합성 측정 안 함: ${outcome.reason} (${ms}ms)`)
    }
  })
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 삭제·복구·영구삭제 라우트가 **바꾸기 전에** 부른다. 영구삭제 뒤에는 행이 없어 읽을 수 없고,
 * 휴지통에 들어간 docKey 문서는 측정에 `파싱` error 로 나와야 하므로(안 재면 대시보드가 옛 결과를 보인다)
 * 다시 재야 하는지 여기서 가른다. 삭제는 드물어 조회 한 번을 더 낸다.
 */
export async function hasDocKey(documentId: string): Promise<boolean> {
  const document = await prisma.document.findUnique({ where: { id: documentId }, select: { docKey: true } })
  return Boolean(document?.docKey)
}

