/**
 * 문서 삭제 권한. 올린 사람과 관리자만 지운다 (2026-09-06 결정, CLAUDE.md 예외).
 *
 * **env 를 import 하지 않는다.** env.ts 는 모듈 로드 시점에 process.env 를 검증하며
 * 던지므로 테스트에서 부를 수 없다 — env-schema.ts 를 분리한 것과 같은 이유다.
 * 관리자 id 는 호출부가 넘긴다.
 *
 * **소유자는 `Document.createdById`(최초 등록자)다.** `DocumentVersion.uploadedById`
 * (그 판을 올린 사람)가 아니다. 후자를 쓰면 남의 문서에 재업로드하는 순간 소유권이
 * 조용히 넘어가 원 작성자가 자기 문서를 잃는다.
 *
 * **관리자는 discordId 로 지목한다.** users.id 는 cuid 라 개발·운영 DB(Neon 브랜치)에서
 * 갈릴 수 있지만 discordId 는 계정에 붙어 있어 어느 DB에서나 같다.
 */

export const DELETE_FORBIDDEN = '올린 사람만 지울 수 있습니다.'

export type Viewer = {
  /** users.id */
  id: string
  discordId: string
}

/**
 * adminDiscordId 가 비어 있으면 관리자 없음이다 — 설정을 빠뜨렸을 때 권한이 새는 대신
 * 아무도 특권을 못 갖는 쪽으로 실패한다.
 */
export function isAdmin(viewer: Viewer, adminDiscordId: string | undefined): boolean {
  return adminDiscordId !== undefined && adminDiscordId !== '' && viewer.discordId === adminDiscordId
}

/**
 * 판정에 필요한 최소 정보. 화면 쪽은 이걸 받아서 관리자 discordId 를 모른 채 판정한다 —
 * 그 값을 표 컴포넌트까지 내리면 팀원 전원의 HTML 에 실려 나간다.
 */
export type DeletePermission = { viewerId: string; isAdmin: boolean }

export function deletePermission(
  viewer: Viewer,
  adminDiscordId: string | undefined,
): DeletePermission {
  return { viewerId: viewer.id, isAdmin: isAdmin(viewer, adminDiscordId) }
}

export function canDeleteRow(
  permission: DeletePermission,
  document: { createdById: string },
): boolean {
  return permission.isAdmin || permission.viewerId === document.createdById
}

export function canDeleteDocument(
  viewer: Viewer,
  document: { createdById: string },
  adminDiscordId: string | undefined,
): boolean {
  return canDeleteRow(deletePermission(viewer, adminDiscordId), document)
}

/**
 * 휴지통 목록에 얹을 소유자 조건. 관리자는 전체를 본다.
 *
 * 삭제한 사람이 아니라 **소유자** 기준이다 — 권한이 없던 시절에 남이 지운 내 문서도
 * 나에게 보여야 복구할 수 있다.
 */
export function trashOwnerWhere(
  viewer: Viewer,
  adminDiscordId: string | undefined,
): { createdById?: string } {
  return isAdmin(viewer, adminDiscordId) ? {} : { createdById: viewer.id }
}
