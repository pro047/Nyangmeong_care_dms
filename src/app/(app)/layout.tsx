import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { AppHeader } from '@/components/app-header'
import { AppSidebar } from '@/components/app-sidebar'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  // proxy.ts의 검사는 낙관적 확인일 뿐이므로 실제 보호는 여기서 한 번 더 한다.
  const user = await getSession()
  if (!user) redirect('/login')

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader user={user} />
      <div className="flex flex-1">
        <AppSidebar />
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
