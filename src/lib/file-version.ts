import { stripExtension, VERSION_TOKEN } from '@/lib/classify'

/** matchAll 은 원본 정규식의 lastIndex 를 건드리지 않는다 — exec 로 바꾸면 g 플래그
    때문에 호출마다 결과가 달라진다. 버전은 파일명 뒤쪽에 붙으므로 마지막 것을 쓴다
    (앞의 것은 `v1_초안` 처럼 다른 뜻일 여지가 있다. 실데이터에 2개 이상은 없다). */
function lastVersionMatch(text: string): RegExpExecArray | undefined {
  return [...text.matchAll(VERSION_TOKEN)].at(-1)
}

/**
 * 파일명에서 버전 토큰을 고른다. 표기(`fileVersionLabel`)와 비교(`parseFileVersion`)가
 * **같은 한 벌**을 보게 하려고 뽑아 뒀다 — 두 벌로 갈리면 화면에 `v0.3` 이라 찍히는데
 * 비교는 `v0` 으로 하는 상태가 조용히 생긴다.
 *
 * 확장자를 뗀 것과 원본을 둘 다 보고 더 길게 읽은 쪽을 쓴다. 어느 한쪽만 보면 반대편이
 * 조용히 틀린다 — `고객센터_v0_2.xlsx` 는 확장자를 떼야 `v0_2` 가 되고(안 떼면 뒤가 `.`
 * 이라 lookahead 가 실패해 `v0` 만 남는다), 확장자가 없는 `요구사항_v0.3` 은 떼면
 * `.3` 이 확장자로 오인돼 역시 `v0` 이 된다.
 */
function bestVersionMatch(fileName: string): RegExpExecArray | undefined {
  const candidates = [lastVersionMatch(stripExtension(fileName)), lastVersionMatch(fileName)]
  return candidates.reduce<RegExpExecArray | undefined>(
    (a, b) => ((b?.[0].length ?? 0) > (a?.[0].length ?? 0) ? b : a),
    undefined,
  )
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
  const best = bestVersionMatch(fileName)
  if (!best) return null

  const [, major, minor, suffix] = best
  // 표기를 하나로 접는다. 파일명에는 `v0_3`·`V0.3` 이 섞여 있는데 열에 그대로 두면
  // 같은 버전이 두 모양으로 보인다.
  return `v${major}${minor === undefined ? '' : `.${minor}`}${suffix.toLowerCase()}`
}

/** 비교용으로 쪼갠 판번호. `minor` 가 없는 `v2` 는 `v2.0` 과 같게 본다. */
export type FileVersion = { major: number; minor: number; suffix: string }

/**
 * 파일명의 판번호를 숫자로 쪼갠다. 없으면 null.
 *
 * `fileVersionLabel` 은 화면에 찍을 문자열이라 `'v0.10' < 'v0.9'` 처럼 사전순으로 뒤집힌다.
 * 크기를 물어야 하는 쪽은 이 함수를 쓴다.
 */
export function parseFileVersion(fileName: string): FileVersion | null {
  const best = bestVersionMatch(fileName)
  if (!best) return null

  const [, major, minor, suffix] = best
  return {
    major: Number(major),
    // `v2` 를 `v2.0` 으로 읽는다 — 안 그러면 `v2` 와 `v2.0` 이 다른 판이 된다.
    minor: minor === undefined ? 0 : Number(minor),
    suffix: suffix.toLowerCase(),
  }
}

/**
 * 두 파일명의 판번호 크기 비교. `a` 가 낮으면 음수, 같으면 0, 높으면 양수.
 *
 * **한쪽이라도 판번호가 없으면 null 이다.** 0(같음)으로 뭉개지 않는 이유: 호출부가
 * "이전 판을 올리려 한다"를 경고하는 자리인데, 근거가 없는 것과 근거가 있어서 같다고
 * 판정한 것은 사용자에게 보일 화면이 다르다. 실데이터에 판번호 없는 파일이 있다
 * (`06_로그인_회원가입_와이어프레임.html`).
 *
 * 접미(`v0_2b`)는 같은 minor 안에서 뒤에 온다 — `b` 는 `0.2` 의 수정본이지 다음 판이
 * 아니므로 `v0.2 < v0.2b < v0.3` 이다.
 */
export function compareFileVersions(a: string, b: string): number | null {
  const left = parseFileVersion(a)
  const right = parseFileVersion(b)
  if (left === null || right === null) return null

  if (left.major !== right.major) return left.major - right.major
  if (left.minor !== right.minor) return left.minor - right.minor
  return left.suffix < right.suffix ? -1 : left.suffix > right.suffix ? 1 : 0
}
