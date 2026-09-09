/**
 * 파일명으로 폴더를 정하는 규칙. 전부 순수 함수다 — 실데이터 기준선 7건(`MILESTONES.md`)이
 * 이 파일의 판정 기준이고, 규칙을 바꾸면 그 표로 다시 대조한다.
 */

/** 매칭 키의 정규화 길이 최소값. 1글자 키는 아무 파일명에나 붙어 소음이라 후보에서 뺀다. */
export const MIN_KEY_LENGTH = 2

/** 제안 폴더 이름의 상한. folderCreateSchema 의 max(100) 과 같은 값이다. */
const MAX_PROPOSED_NAME_LENGTH = 100

export const REASON_NO_MATCH = '맞는 폴더 없음'
export const REASON_AMBIGUOUS = '여러 폴더에 해당해 고르지 못함'
export const REASON_PROPOSE = '맞는 폴더가 없어 새 폴더를 제안'

export const REASON_SUB_NONE = '하위 이름 없음'
export const REASON_SUB_AMBIGUOUS = '하위가 여러 개라 상위에 둠'
export const REASON_SUB_PROPOSE = '새 하위 폴더 제안'

/** 근거 한 줄. 없으면 사용자가 분류 전체를 의심한다 (사양 "UI — 올라가기 전에 보여준다"). */
export function matchReason(key: string, isAlias: boolean): string {
  return isAlias ? `별칭 '${key}' 일치` : `'${key}' 일치`
}

/** 2단계 결과는 카테고리 근거와 하위 근거를 둘 다 보여야 한다 — 어느 단계에서 갈렸는지가
    사용자가 고칠지 말지를 정하는 정보다. */
export function subReason(categoryReason: string, tail: string): string {
  return `${categoryReason} · ${tail}`
}

/**
 * 매칭용 정규화. NFC 를 먼저 돌려야 맥에서 올린 자모 분리 한글(NFD)이 합쳐진다 —
 * 이게 없으면 `요구사항` ≠ `요구사항` 이 되고 화면상 구분이 안 돼 조용히 실패한다.
 * 문자·숫자 이외를 전부 지우므로 공백·밑줄·하이픈·전각대시·점·괄호가 한 번에 사라진다.
 */
export function normalizeForMatch(raw: string): string {
  return raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/** 확장자는 신호가 아니다 — `.html` 이 화면설계서와 와이어프레임 양쪽에 걸쳐 있다. */
export function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

/** 브라우저가 붙이는 중복 접미사. `(1)` 은 숫자일 때만 지운다 — 숫자가 아닌 괄호를
    **일괄** 지우면 문장 가운데의 핵심어까지 날아간다. 끝에 붙은 영문 코드는 층위가
    다른 문제라 TRAILING_CODE 가 위치를 한정해서 따로 뗀다. */
const DUPLICATE_SUFFIX = /\s*(?:\(\d+\)|(?:[-–—]\s*)?복사본)/gu

/** `v0.2` `v0_3` `v0_2b`. 구분자로 쪼개기 **전에** 원문에서 지워야 한다 — `v0_3` 을 먼저
    밑줄로 쪼개면 `v0`·`3` 이 되어 못 잡는다.

    **minor 는 3자리까지만 받는다** (2026-09-09). 상한이 없으면 뒤따르는 날짜를 삼킨다 —
    `보고서_v1_2026_08_17` 이 `minor=2026` 이 되어 목록에 `v1.2026` 으로 찍히고, 비교를
    붙이면 `v2_20260819` 가 `v2.1` 보다 새 판으로 판정된다. 운영 32건에는 해당 파일이
    0건이라(2026-09-09 실측) 이 수정으로 기존 분류 결과는 바뀌지 않는다.
    캡처 그룹은 목록의 버전 열(`file-version.ts`)이 값을 읽으려고 얹은 것이다 —
    여기서는 `.replace(…, '')` 라 그룹이 있든 없든 동작이 같다. 정규식을 두 벌 두면
    한쪽 요구로 고칠 때 다른 쪽이 조용히 깨지므로 이 한 벌을 정본으로 쓴다. */
export const VERSION_TOKEN = /(?<=^|[\s_—–-])v(\d+)(?:[._](\d{1,3}))?([a-z]?)(?=[\s_—–-]|$)/giu

/** `2026_08_17` `2026.08.17` `20260819` `260817`. 버전과 같은 이유로 토큰화 전에 지운다. */
const DATE_TOKEN = /(?<=^|[\s_—–-])(?:\d{4}[._-]\d{1,2}[._-]\d{1,2}|\d{8}|\d{6})(?=[\s_—–-]|$)/gu

const SEPARATORS = /[_\s—–-]+/u

/** 맨 앞 숫자 prefix. 순서 번호는 분류 신호가 아니다 — `03_` 은 화면설계서 2건인데
    와이어프레임은 `04_`·`06_` 로 갈린다. */
const NUMBER_PREFIX = /^\d{1,3}$/u

/** 끝에 붙은 짧은 영문 대문자 코드(`HLT`·`(HLT)`). 카테고리가 아니라 그 문서만의
    식별자라 폴더 이름에 들어가면 문서 1건짜리 폴더가 된다. 소문자(`final`)와 5자 이상은
    실제 단어일 확률이 높아 건드리지 않는다. */
const TRAILING_CODE = /^\(?[A-Z]{2,4}\)?$/u

/**
 * 제품명. 모든 문서에 붙을 수 있어 하위 폴더를 좁히지 못한다 —
 * `냥멍케어_기능명세서_건강기록` 이 `건강기록` 이 아니라 `냥멍케어 건강기록` 폴더를 만들면
 * 같은 주제가 두 폴더로 갈린다.
 *
 * 원래는 "정착 뒤엔 매칭이 이긴다"로 수용했는데, 그 근거는 사람이 미리보기에서 고치는
 * 업로드 경로에서만 성립한다. 소급 이동은 무인이라 안전판이 없고, 카테고리에 그 주제의
 * 문서가 1건뿐이면 매칭할 상대가 영영 생기지 않는다 (`기능명세서 > 건강기록`).
 */
// 비교는 정규화된 형태끼리 한다 — 이 파일이 NFD 로 저장돼도 판정이 안 흔들린다.
const PRODUCT_TOKENS = ['냥멍케어'].map(normalizeForMatch)

/**
 * 노이즈만 걷어낸 토큰열. 카테고리 구간 제거를 토큰 단위로 해야 표기(공백·대소문자)가
 * 보존된다 — 정규화 문자열에서 잘라내면 `로그인회원가입` 같은 붙임말이 나온다.
 */
export function coreTokens(
  fileName: string,
  /**
   * 말미 코드(`HLT`)를 남길지. 기본은 폴더용이라 뗀다.
   *
   * **문서를 구별하는 쪽은 남겨야 한다** (2026-09-09). 폴더 이름을 지을 때 `HLT` 를 빼는
   * 것은 맞지만(문서 1건짜리 폴더가 생긴다), 문서 식별에서는 그게 바로 구별의 근거다 —
   * 떼면 `건강기록_와이어프레임_HLT` 와 `..._PAY` 가 같은 문서가 된다.
   */
  { keepTrailingCode = false }: { keepTrailingCode?: boolean } = {},
): string[] {
  const withoutNoise = stripExtension(fileName)
    .replace(DUPLICATE_SUFFIX, '')
    .replace(VERSION_TOKEN, '')
    .replace(DATE_TOKEN, '')

  const tokens = withoutNoise.split(SEPARATORS).filter((token) => token !== '')
  if (tokens.length > 0 && NUMBER_PREFIX.test(tokens[0])) tokens.shift()

  // 토큰이 1개 남으면 멈춘다 — `WF.html` 이 빈 제안이 되면 폴더를 아예 못 얻는다.
  while (!keepTrailingCode && tokens.length > 1 && TRAILING_CODE.test(tokens[tokens.length - 1]))
    tokens.pop()

  // 제품명을 걷는다. 전부 제품명이면 그대로 둔다 — 빈 이름보다는 나쁜 이름이 낫다.
  const isProduct = (token: string) =>
    PRODUCT_TOKENS.includes(normalizeForMatch(token))
  if (tokens.some((token) => !isProduct(token))) {
    return tokens.filter((token) => !isProduct(token))
  }

  return tokens
}

/**
 * 제안 폴더명용 핵심어. 표시용이라 대소문자는 그대로 두고 구분자만 공백 하나로 고른다.
 * 사람이 미리보기에서 확인·해제하는 것이 안전판이므로 이름 품질이 완벽할 필요는 없다.
 */
export function extractCore(fileName: string): string {
  return coreTokens(fileName).join(' ')
}

/**
 * 하위 폴더 이름. keys 는 매칭된 카테고리 폴더의 이름과 별칭이다.
 *
 * 연속된 토큰 부분열의 정규화 결합이 키와 같으면 그 구간을 통째로 지운다 — 실데이터의
 * `03_메인페이지_기능_명세서…` 에서 카테고리 `기능명세서` 가 `기능`·`명세서` 두 토큰에
 * 걸쳐 있어 토큰 하나씩 비교하면 안 지워진다.
 *
 * 결과가 빈 문자열인 것은 정상이다 — `04_기능명세서_v0.1.xlsx` 처럼 카테고리뿐인 파일명은
 * 남는 토큰이 0개이고, 호출자는 그것을 "카테고리 루트에 둔다"로 읽는다(확정 규칙 4).
 */
export function extractSubName(fileName: string, keys: string[]): string {
  const tokens = coreTokens(fileName)

  const keySet = new Set<string>()
  for (const key of keys) {
    const normalized = normalizeForMatch(key)
    if (normalized.length >= MIN_KEY_LENGTH) keySet.add(normalized)
  }

  let i = 0
  while (i < tokens.length) {
    let hit = false
    // 같은 시작점에서는 긴 구간부터 본다 — 짧은 쪽을 먼저 지우면 여러 토큰에 걸친
    // 카테고리의 나머지 토큰이 하위 이름에 남는다.
    for (let j = tokens.length - 1; j >= i; j--) {
      if (!keySet.has(normalizeForMatch(tokens.slice(i, j + 1).join('')))) continue
      tokens.splice(i, j - i + 1)
      hit = true
      break
    }
    // 지웠으면 i 를 올리지 않는다 — 같은 자리에 이어지는 키도 지워야 한다.
    if (!hit) i += 1
  }

  return tokens.join(' ')
}

export type ClassifyFolder = {
  id: string
  name: string
  parentId: string | null
  aliases: string[]
}

export type ClassifyResult =
  | { kind: 'match'; folderId: string; reason: string }
  // parentId 가 null 이면 새 루트 카테고리, 아니면 그 카테고리 밑의 새 하위 폴더다.
  | { kind: 'propose'; parentId: string | null; proposedName: string; reason: string }
  | { kind: 'unclassified'; reason: string }

type Match = { folder: ClassifyFolder; reason: string; ambiguous: boolean }

/**
 * 매칭은 "정규화한 파일명에 키가 부분 문자열로 들어 있는가"이고 점수는 키의 정규화 길이다.
 * 긴 키가 더 구체적이므로 `설계서` 와 `화면설계서` 가 함께 있으면 후자가 이긴다.
 */
function bestMatch(haystack: string, candidates: ClassifyFolder[]): Match | null {
  let best: { folder: ClassifyFolder; score: number; reason: string } | null = null
  const bestFolderIds = new Set<string>()

  for (const folder of candidates) {
    for (const [index, key] of [folder.name, ...folder.aliases].entries()) {
      const normalized = normalizeForMatch(key)
      if (normalized.length < MIN_KEY_LENGTH) continue
      if (!haystack.includes(normalized)) continue

      const score = normalized.length
      if (best !== null && score < best.score) continue
      if (best === null || score > best.score) {
        best = { folder, score, reason: matchReason(key, index > 0) }
        bestFolderIds.clear()
      }
      bestFolderIds.add(folder.id)
    }
  }

  if (best === null) return null
  return { folder: best.folder, reason: best.reason, ambiguous: bestFolderIds.size > 1 }
}

/**
 * 2단계로 정한다 — 루트 폴더로 카테고리를 먼저 고르고, 그 폴더의 **직계 자식만** 후보로
 * 다시 매칭한다. 평면 매칭을 유지하면 점수가 키 길이라 자식 `로그인`(3)이 부모
 * `화면설계서`(5)에게 항상 져서 하위 폴더를 만들어도 재사용되지 않는다(확정 규칙 1).
 */
export function classifyFileName(fileName: string, folders: ClassifyFolder[]): ClassifyResult {
  const roots = folders.filter((folder) => folder.parentId === null)
  // 카테고리가 될 루트가 없으면 제안조차 하지 않는다 — 사양: 조용히 아무 일도 안 하는 것이
  // 정상이다. 자식만 있는 목록도 여기로 떨어진다(카테고리를 고를 근거가 없다).
  if (roots.length === 0) return { kind: 'unclassified', reason: REASON_NO_MATCH }

  const haystack = normalizeForMatch(stripExtension(fileName))

  const category = bestMatch(haystack, roots)

  if (category === null) {
    // 새 카테고리 제안은 1뎁스까지다(확정 규칙 6) — 파일명 안에서 어느 토큰이 카테고리인지
    // 가릴 근거가 없다.
    const proposedName = extractCore(fileName)
    if (proposedName === '' || proposedName.length > MAX_PROPOSED_NAME_LENGTH) {
      return { kind: 'unclassified', reason: REASON_NO_MATCH }
    }
    return { kind: 'propose', parentId: null, proposedName, reason: REASON_PROPOSE }
  }

  // 같은 이름 루트가 공존할 수 있다. 문자열 일치만으로는 고를 수 없다.
  if (category.ambiguous) return { kind: 'unclassified', reason: REASON_AMBIGUOUS }

  const children = folders.filter((folder) => folder.parentId === category.folder.id)
  const sub = bestMatch(haystack, children)

  if (sub !== null) {
    if (sub.ambiguous) {
      return {
        kind: 'match',
        folderId: category.folder.id,
        reason: subReason(category.reason, REASON_SUB_AMBIGUOUS),
      }
    }
    return {
      kind: 'match',
      folderId: sub.folder.id,
      reason: subReason(category.reason, `하위 ${sub.reason}`),
    }
  }

  // 붙는 자식이 없을 때만 파일명에서 뽑는다(확정 규칙 2). 매칭이 먼저라야 제품명 접두사
  // (`냥멍케어`)가 붙은 파일이 두 번째부터 기존 하위 폴더로 들어간다.
  const subName = extractSubName(fileName, [category.folder.name, ...category.folder.aliases])
  if (subName === '' || subName.length > MAX_PROPOSED_NAME_LENGTH) {
    return {
      kind: 'match',
      folderId: category.folder.id,
      reason: subReason(category.reason, REASON_SUB_NONE),
    }
  }

  return {
    kind: 'propose',
    parentId: category.folder.id,
    proposedName: subName,
    reason: subReason(category.reason, REASON_SUB_PROPOSE),
  }
}
