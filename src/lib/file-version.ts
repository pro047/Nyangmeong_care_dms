import { stripExtension, VERSION_TOKEN } from '@/lib/classify'

/** matchAll 은 원본 정규식의 lastIndex 를 건드리지 않는다 — exec 로 바꾸면 g 플래그
    때문에 호출마다 결과가 달라진다. 버전은 파일명 뒤쪽에 붙으므로 마지막 것을 쓴다
    (앞의 것은 `v1_초안` 처럼 다른 뜻일 여지가 있다. 실데이터에 2개 이상은 없다). */
function lastVersionMatch(text: string): RegExpExecArray | undefined {
  return [...text.matchAll(VERSION_TOKEN)].at(-1)
}

/**
 * 파일명이 말하는 버전 표기. 없으면 null.
 *
 * `DocumentVersion.versionNo` 와 다른 값이다 — 저쪽은 앱이 센 재업로드 횟수이고 이쪽은
 * 사람이 파일명에 쓴 문자열이다. 팀은 `v0.2 → v0.3` 을 재업로드가 아니라 별개 문서로
 * 올리므로(활성 28건 중 27건이 versionNo=1, 2026-09-06 실측) 목록에서 실제로 구분에
 * 쓰이는 값은 이쪽이다.
 */
export function fileVersionLabel(fileName: string): string | null {
  // 확장자를 뗀 것과 원본을 둘 다 보고 더 길게 읽은 쪽을 쓴다. 어느 한쪽만 보면 반대편이
  // 조용히 틀린다 — `고객센터_v0_2.xlsx` 는 확장자를 떼야 `v0_2` 가 되고(안 떼면 뒤가 `.`
  // 이라 lookahead 가 실패해 `v0` 만 남는다), 확장자가 없는 `요구사항_v0.3` 은 떼면
  // `.3` 이 확장자로 오인돼 역시 `v0` 이 된다.
  const candidates = [lastVersionMatch(stripExtension(fileName)), lastVersionMatch(fileName)]
  const best = candidates.reduce<RegExpExecArray | undefined>(
    (a, b) => ((b?.[0].length ?? 0) > (a?.[0].length ?? 0) ? b : a),
    undefined,
  )
  if (!best) return null

  const [, major, minor, suffix] = best
  // 표기를 하나로 접는다. 파일명에는 `v0_3`·`V0.3` 이 섞여 있는데 열에 그대로 두면
  // 같은 버전이 두 모양으로 보인다.
  return `v${major}${minor === undefined ? '' : `.${minor}`}${suffix.toLowerCase()}`
}
