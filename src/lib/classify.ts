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

/** 근거 한 줄. 없으면 사용자가 분류 전체를 의심한다 (사양 "UI — 올라가기 전에 보여준다"). */
export function matchReason(key: string, isAlias: boolean): string {
  return isAlias ? `별칭 '${key}' 일치` : `'${key}' 일치`
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
function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

/** 브라우저가 붙이는 중복 접미사. `(1)` 은 숫자일 때만 지운다 — 숫자가 아닌 괄호를
    **일괄** 지우면 문장 가운데의 핵심어까지 날아간다. 끝에 붙은 영문 코드는 층위가
    다른 문제라 TRAILING_CODE 가 위치를 한정해서 따로 뗀다. */
const DUPLICATE_SUFFIX = /\s*(?:\(\d+\)|(?:[-–—]\s*)?복사본)/gu

/** `v0.2` `v0_3` `v0_2b`. 구분자로 쪼개기 **전에** 원문에서 지워야 한다 — `v0_3` 을 먼저
    밑줄로 쪼개면 `v0`·`3` 이 되어 못 잡는다. */
const VERSION_TOKEN = /(?<=^|[\s_—–-])v\d+(?:[._]\d+)?[a-z]?(?=[\s_—–-]|$)/giu

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
 * 제안 폴더명용 핵심어. 표시용이라 대소문자는 그대로 두고 구분자만 공백 하나로 고른다.
 * 사람이 미리보기에서 확인·해제하는 것이 안전판이므로 이름 품질이 완벽할 필요는 없다.
 */
export function extractCore(fileName: string): string {
  const withoutNoise = stripExtension(fileName)
    .replace(DUPLICATE_SUFFIX, '')
    .replace(VERSION_TOKEN, '')
    .replace(DATE_TOKEN, '')

  const tokens = withoutNoise.split(SEPARATORS).filter((token) => token !== '')
  if (tokens.length > 0 && NUMBER_PREFIX.test(tokens[0])) tokens.shift()

  // 토큰이 1개 남으면 멈춘다 — `WF.html` 이 빈 제안이 되면 폴더를 아예 못 얻는다.
  while (tokens.length > 1 && TRAILING_CODE.test(tokens[tokens.length - 1])) tokens.pop()

  return tokens.join(' ')
}

export type ClassifyFolder = { id: string; name: string; aliases: string[] }

export type ClassifyResult =
  | { kind: 'match'; folderId: string; reason: string }
  | { kind: 'propose'; proposedName: string; reason: string }
  | { kind: 'unclassified'; reason: string }

type Candidate = { folderId: string; score: number; reason: string }

/**
 * 매칭은 "정규화한 파일명에 키가 부분 문자열로 들어 있는가"이고 점수는 키의 정규화 길이다.
 * 긴 키가 더 구체적이므로 `설계서` 와 `화면설계서` 가 함께 있으면 후자가 이긴다.
 */
export function classifyFileName(fileName: string, folders: ClassifyFolder[]): ClassifyResult {
  // 폴더가 하나도 없으면 제안조차 하지 않는다 — 사양: 조용히 아무 일도 안 하는 것이 정상이다.
  if (folders.length === 0) return { kind: 'unclassified', reason: REASON_NO_MATCH }

  const haystack = normalizeForMatch(stripExtension(fileName))

  let best: Candidate | null = null
  const bestFolderIds = new Set<string>()

  for (const folder of folders) {
    for (const [index, key] of [folder.name, ...folder.aliases].entries()) {
      const normalized = normalizeForMatch(key)
      if (normalized.length < MIN_KEY_LENGTH) continue
      if (!haystack.includes(normalized)) continue

      const score = normalized.length
      if (best !== null && score < best.score) continue
      if (best === null || score > best.score) {
        best = { folderId: folder.id, score, reason: matchReason(key, index > 0) }
        bestFolderIds.clear()
      }
      bestFolderIds.add(folder.id)
    }
  }

  if (best !== null) {
    // 같은 이름 폴더가 부모만 다르게 공존할 수 있다. 문자열 일치만으로는 고를 수 없다.
    if (bestFolderIds.size > 1) return { kind: 'unclassified', reason: REASON_AMBIGUOUS }
    return { kind: 'match', folderId: best.folderId, reason: best.reason }
  }

  const proposedName = extractCore(fileName)
  if (proposedName === '' || proposedName.length > MAX_PROPOSED_NAME_LENGTH) {
    return { kind: 'unclassified', reason: REASON_NO_MATCH }
  }

  return { kind: 'propose', proposedName, reason: REASON_PROPOSE }
}
