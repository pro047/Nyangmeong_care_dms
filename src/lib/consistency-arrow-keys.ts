/**
 * 세 화살표의 축·검사 이름 (`consistency-engine/arrows.ts`). 엔진(서버)과 패널(클라이언트)이 같이 쓴다 —
 * 엔진 파일에서 가져오면 파서까지 브라우저 번들로 딸려 온다. 이름이 곧 저장 계약이라 상수로 묶는다.
 */
/** 읽지 못한 문서의 검사 이름 — 엔진(`verify.ts`)이 붙이고 메인 조회·패널이 이 이름으로 거른다 */
export const PARSE_CHECK = '파싱'

export const ARROW_AXES = { reqBySCR: 'reqBySCR', reqByFN: 'reqByFN', fnToSCR: 'fnToSCR' } as const

export const ARROW_CHECKS = {
  /** 화면설계·기능명세 **어디에도** 없는 요구사항 — 패널의 히어로 */
  missingEverywhere: '요구사항누락',
  notInSCR: '화면설계 미반영',
  notInFN: '기능명세 미반영',
  fnNoScreen: '화면 지정 없음',
} as const
