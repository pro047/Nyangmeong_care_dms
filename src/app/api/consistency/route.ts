import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import {
  consistencyFailure,
  consistencyProblem,
  consistencySchema,
  snapshotCreateData,
} from '@/lib/consistency'

export const dynamic = 'force-dynamic'

/**
 * 정합성 측정 수신. 사내 정합성 저장소(`~/orca/Nyangmeong_care`)가 19개 문서를 파싱한
 * 결과를 통째로 보내고, 여기서는 **받아서 쌓기만** 한다.
 *
 * **판정하지 않는다.** 비율도 등급도 만들지 않는다 — `metrics` 는 분자/분모 그대로
 * 저장하고 나누는 것은 화면이다. 어느 축이 "정합성"이냐가 곧 판정이고 그건 사람 몫이다.
 *
 * **계산도 하지 않는다.** 문서 본문 파싱은 저쪽에 둔다 — 서버가 html 을 읽기 시작하면
 * `preview.ts` 의 iframe 격리를 우회하는 경로가 생기고, 파서가 두 벌이 되면 갈린다.
 */
export async function POST(req: NextRequest) {
  // 프록시가 이미 세션을 보지만(proxy.ts) 보호는 이중으로 한다 — 저쪽 인계문은 "라우트에
  // 인증 코드를 더 넣을 필요 없다"고 했지만 이 리포는 그렇게 쓰지 않는다(CLAUDE.md).
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const parsed = consistencySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    // 어느 필드가 틀렸는지 첫 건만 알려준다. 25.4KB 본문이라 전부 나열하면 응답이 본문만 해진다.
    const first = parsed.error.issues[0]
    const where = first?.path.join('.') || '(본문)'
    return NextResponse.json(
      { error: `요청 형식이 올바르지 않습니다: ${where} — ${first?.message ?? '알 수 없음'}` },
      { status: 400 },
    )
  }

  // 스키마는 맞는데 내용이 자기모순인 경우(counts 불일치·축 중복·분자>분모). 근거는 lib 주석.
  const problem = consistencyProblem(parsed.data)
  if (problem) {
    return NextResponse.json({ error: problem.error }, { status: 400 })
  }

  // 중첩 create 하나가 곧 한 트랜잭션이다 — 177행이 전부 들어가거나 전부 안 들어간다.
  let snapshot: { id: string }
  try {
    snapshot = await prisma.consistencySnapshot.create({
      data: snapshotCreateData(parsed.data),
      select: { id: true },
    })
  } catch (err) {
    const failure = consistencyFailure(err)
    if (!failure) throw err
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }

  return NextResponse.json({ id: snapshot.id }, { status: 201 })
}
