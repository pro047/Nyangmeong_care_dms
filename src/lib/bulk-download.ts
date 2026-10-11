import type { Prisma } from '@/generated/prisma/client'
import { folderBreadcrumb, type FolderRow } from '@/lib/folder'
import { activeDocumentWhere } from '@/lib/trash'

/** 합계 상한. 초과(>)일 때만 막는다. */
export const BULK_MAX_TOTAL_BYTES = 200 * 1024 * 1024
/** 폴더가 없는 문서를 묶는 종류의 이름이자 zip 최상위 디렉터리 이름. */
export const UNCATEGORIZED_NAME = '미분류'

/** 서버 컴포넌트가 prop 으로 내리는 문서 1건 — 최신 버전 1건이 이미 풀려 있다. */
export type BulkDocument = {
  id: string
  title: string
  folderId: string | null
  fileName: string
  sizeBytes: number
  /**
   * 이 파일명·크기가 속한 판. 받을 때 이 판을 지목한다 — 안 그러면 화면을 연 뒤 누가 재업로드했을 때
   * 옛 파일명으로 새 내용이 들어간다(확장자가 바뀌었으면 안 열린다).
   */
  versionNo?: number
}

/** bulkDocumentQuery() 로 읽은 행의 모양. versions 는 정렬·개수를 요구하지 않는다. */
export type BulkDocumentRow = {
  id: string
  title: string
  folderId: string | null
  versions: { versionNo: number; fileName: string; sizeBytes: number }[]
}

/** 종류 1개. folderId 가 null 이면 미분류. */
export type BulkCategory = {
  folderId: string | null
  name: string
  /** 그 폴더와 모든 자손 폴더의 문서 수 */
  documentCount: number
  /** 같은 범위의 최신판 크기 합 */
  totalBytes: number
}

/** zip 에 넣을 항목 1건의 계획. */
export type ZipEntryPlan = {
  documentId: string
  title: string
  /** zip 안 경로. 구분자는 '/' 뿐이고 '/' 로 시작하지 않으며 '.'·'..'·빈 세그먼트가 없다 */
  path: string
  sizeBytes: number
}

const byIdAscending = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

// 휴지통 필터와 최신 버전 1건을 호출부에 맡기면 언젠가 빠진다 — 조회 실행은 호출부가 한다.
export function bulkDocumentQuery() {
  return {
    where: activeDocumentWhere(),
    select: {
      id: true,
      title: true,
      folderId: true,
      versions: {
        orderBy: { versionNo: 'desc' },
        take: 1,
        select: { versionNo: true, fileName: true, sizeBytes: true },
      },
    },
  } satisfies {
    where: Prisma.DocumentWhereInput
    select: Prisma.DocumentSelect
  }
}

/** 조회 행 → BulkDocument. versionNo 최댓값 1건을 고른다. 버전이 없는 문서는 뺀다. */
export function toBulkDocuments(rows: BulkDocumentRow[]): BulkDocument[] {
  const documents: BulkDocument[] = []
  for (const row of rows) {
    let latest: BulkDocumentRow['versions'][number] | undefined
    for (const version of row.versions) {
      if (latest === undefined || version.versionNo > latest.versionNo) latest = version
    }
    if (latest === undefined) continue
    documents.push({
      id: row.id,
      title: row.title,
      folderId: row.folderId,
      fileName: latest.fileName,
      versionNo: latest.versionNo,
      sizeBytes: latest.sizeBytes,
    })
  }
  return documents
}

/**
 * 문서가 속한 종류의 folderId. 미분류·목록에 없는 폴더·끊긴 조상·순환이면 null.
 * 버리면 그 문서를 받을 방법이 없어진다 — 조용히 빠진 zip 이 되느니 미분류로 넣는다.
 */
export function categoryIdOf(folderId: string | null, folders: FolderRow[]): string | null {
  if (folderId === null) return null
  const chain = folderBreadcrumb(folderId, folders)
  if (chain.length === 0) return null
  const root = chain[0]
  return root.parentId === null ? root.id : null
}

/** 종류 목록. 최상위 폴더(이름 ko 오름차순, 0건 포함) + 미분류(1건 이상일 때만, 맨 끝). */
export function bulkCategories(folders: FolderRow[], documents: BulkDocument[]): BulkCategory[] {
  const totals = new Map<string | null, { documentCount: number; totalBytes: number }>()
  for (const document of documents) {
    const key = categoryIdOf(document.folderId, folders)
    const total = totals.get(key) ?? { documentCount: 0, totalBytes: 0 }
    total.documentCount += 1
    total.totalBytes += document.sizeBytes
    totals.set(key, total)
  }

  const categories: BulkCategory[] = folders
    .filter((folder) => folder.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko') || byIdAscending(a, b))
    .map((folder) => ({
      folderId: folder.id,
      name: folder.name,
      documentCount: totals.get(folder.id)?.documentCount ?? 0,
      totalBytes: totals.get(folder.id)?.totalBytes ?? 0,
    }))

  const uncategorized = totals.get(null)
  if (uncategorized) {
    categories.push({ folderId: null, name: UNCATEGORIZED_NAME, ...uncategorized })
  }
  return categories
}

/** 고른 종류에 속한 문서. 하위 폴더 문서 포함. 반환 순서는 id 오름차순. */
export function selectBulkDocuments(
  folders: FolderRow[],
  documents: BulkDocument[],
  selected: readonly (string | null)[],
): BulkDocument[] {
  const wanted = new Set(selected)
  return documents
    .filter((document) => wanted.has(categoryIdOf(document.folderId, folders)))
    .sort(byIdAscending)
}

export function bulkTotalBytes(documents: readonly { sizeBytes: number }[]): number {
  return documents.reduce((sum, document) => sum + document.sizeBytes, 0)
}

export function exceedsBulkLimit(totalBytes: number, limitBytes: number = BULK_MAX_TOTAL_BYTES): boolean {
  return totalBytes > limitBytes
}

/** 경로 세그먼트 1개를 zip·파일시스템에 안전한 이름으로. 빈 문자열을 돌려주지 않는다. */
export function safeZipSegment(name: string): string {
  const cleaned = name
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\:*?"<>|]/g, '_')
    .trim()
    // 끝의 점·공백은 Windows 가 지우고, 세그먼트 전체가 점이면 '.'·'..' 가 된다.
    .replace(/[. ]+$/, '')
  return cleaned === '' ? '_' : cleaned
}

// 판정 키가 원문이면 zip 안에서는 다르지만 macOS·Windows 에서 풀면 한쪽이 덮이는 이름을 못 잡는다.
const collisionKey = (path: string) => path.normalize('NFC').toLowerCase()

function numbered(name: string, n: number): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return `${name} (${n})`
  return `${name.slice(0, dot)} (${n})${name.slice(dot)}`
}

function directoryOf(document: BulkDocument, folders: FolderRow[]): string[] {
  if (categoryIdOf(document.folderId, folders) === null || document.folderId === null) {
    return [UNCATEGORIZED_NAME]
  }
  return folderBreadcrumb(document.folderId, folders).map((folder) => safeZipSegment(folder.name))
}

/** 문서들 → zip 경로 계획. 입력 순서와 무관하게 결과가 같다(id 오름차순으로 처리·반환). */
export function planZipEntries(folders: FolderRow[], documents: BulkDocument[]): ZipEntryPlan[] {
  const sorted = [...documents].sort(byIdAscending)
  const directories = sorted.map((document) => directoryOf(document, folders))

  // 파일이 형제 디렉터리와 같은 이름이 되지 않도록 디렉터리 경로를 먼저 점유한다.
  const used = new Set<string>()
  for (const segments of directories) {
    for (let depth = 1; depth <= segments.length; depth++) {
      used.add(collisionKey(segments.slice(0, depth).join('/')))
    }
  }

  return sorted.map((document, index) => {
    const prefix = `${directories[index].join('/')}/`
    const base = safeZipSegment(document.fileName)

    let name = base
    for (let n = 2; used.has(collisionKey(prefix + name)); n++) name = numbered(base, n)

    const path = prefix + name
    used.add(collisionKey(path))
    return { documentId: document.id, title: document.title, path, sizeBytes: document.sizeBytes }
  })
}

/** 쿼리를 붙이지 않는다 — inline·v 없이 최신판을 첨부로 받는다. */
export function bulkDownloadUrl(documentId: string, versionNo?: number): string {
  const path = `/api/documents/${encodeURIComponent(documentId)}/download`
  return versionNo === undefined ? path : `${path}?v=${versionNo}`
}

/** `DMS_문서_YYYYMMDD_HHmm.zip`. 서버 TZ 에 흔들리지 않게 Asia/Seoul 을 박는다. */
export function bulkZipName(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `DMS_문서_${part('year')}${part('month')}${part('day')}_${part('hour')}${part('minute')}.zip`
}
