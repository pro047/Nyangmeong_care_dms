/**
 * 목록 표가 요구하는 행의 모양. **목록(`/`)과 검색(`/search`) 두 쿼리가 이걸 만족해야 한다.**
 *
 * 컴포넌트가 아니라 여기 있는 이유: 표 껍데기(`document-table.tsx`, 서버)와 행
 * (`document-rows.tsx`, 클라이언트)이 같은 타입을 쓰는데, 한쪽에서 다른 쪽으로 import 하면
 * 경계가 타입 때문에 끌려간다.
 */
export type DocumentListItem = {
  id: string
  title: string
  /** 삭제 버튼을 그릴지 정한다 (ownership.ts). 두 쿼리 모두 include 라 이미 실려 온다. */
  createdById: string
  /** 정렬 기준과 같은 값이어야 한다 — updatedAt 을 그리면 보이는 날짜와 행 순서가 어긋난다. */
  createdAt: Date
  folder: { name: string } | null
  tags: { tag: { name: string } }[]
  /**
   * **`versionNo` 내림차순 전량이다.** `[0]` 이 최신이고 나머지는 펼쳤을 때 보여줄 이력이다.
   * `take: 1` 이던 것을 2026-09-13 에 뗐다 — 운영 실측으로 문서 33건에 버전 47행이라
   * 전량을 실어도 무시할 수준이고, 펼칠 때 왕복을 새로 내면 사람이 기다린다.
   */
  versions: {
    id: string
    versionNo: number
    fileName: string
    sizeBytes: number
    createdAt: Date
    uploadedBy: { username: string }
  }[]
}
