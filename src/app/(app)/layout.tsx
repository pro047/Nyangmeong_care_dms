import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { AppHeader } from '@/components/app-header'
import { AppSidebar } from '@/components/app-sidebar'
import type { FolderAliasRow } from '@/lib/folder'

export const dynamic = 'force-dynamic'

/**
 * 조회 실패를 삼키는 이유: 같은 세그먼트의 error.tsx 는 이 레이아웃의 예외를 잡지 못한다.
 * 터널이 끊겼을 때 여기서 던지면 DB 안내 화면조차 못 뜬다. 사이드바만 포기한다.
 */
async function getFolders(): Promise<FolderAliasRow[] | null> {
  try {
    // aliases 는 사이드바 Dialog 에서 편집한다.
    return await prisma.folder.findMany({
      select: { id: true, name: true, parentId: true, aliases: true },
    })
  } catch (err) {
    console.error('폴더 목록 조회 실패:', err)
    return null
  }
}

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  // proxy.ts의 검사는 낙관적 확인일 뿐이므로 실제 보호는 여기서 한 번 더 한다.
  const user = await getSession()
  if (!user) redirect('/login')

  const folders = await getFolders()

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader user={user} />
      <div className="flex flex-1">
        <AppSidebar folders={folders} />
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
