/**
 * 최상위 내비게이션(주소창 이동·<a href>)인지 판별한다.
 * 이런 요청에 JSON 을 주면 탭 전체가 {"error":"..."} 텍스트로 바뀐다.
 *
 * Sec-Fetch-Dest 는 브라우저가 붙이고 스크립트가 위조할 수 없다. 없는 경우
 * (구형 브라우저·curl)는 Accept 로 떨어진다.
 *
 * 이 파일이 아무것도 import 하지 않는 이유는 런타임이 아니라 import 부작용이다 —
 * proxy 가 이 모듈을 쓰는데, lib/env 처럼 불러오는 순간 process.env 를 검증하며
 * throw 하는 모듈이 딸려 들어가면 전 요청 경로가 죽는다.
 *
 * headers 를 Pick 으로 받는 이유: NextRequest.headers 와 테스트의 new Headers() 를
 * 같이 받기 위해서다.
 */
export function isNavigationRequest(headers: Pick<Headers, 'get'>): boolean {
  const dest = headers.get('sec-fetch-dest')
  return dest ? dest === 'document' : (headers.get('accept') ?? '').includes('text/html')
}
