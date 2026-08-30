/**
 * 문서 생성(`/api/documents`)과 재업로드(`/api/documents/[id]/versions`)가 공유하는 문구.
 *
 * `keyToken` 은 검증만 되고 소모되지 않는다 (upload-token.ts). 사용 기록 저장소를 따로
 * 두는 대신 "그 키로 DocumentVersion 이 이미 생겼는가"를 소모 여부로 읽는다 — 키가
 * UUID 라 정상 경로에서는 중복될 수 없다.
 */
export const S3_KEY_ALREADY_USED = '이미 사용된 업로드입니다. 파일을 다시 올려 주세요.'
