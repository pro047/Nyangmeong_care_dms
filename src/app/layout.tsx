import type { Metadata } from 'next'
import { Noto_Sans_KR } from 'next/font/google'
import { GeistSans } from 'geist/font/sans'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const notoSansKr = Noto_Sans_KR({
  variable: '--font-noto-sans-kr',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

export const metadata: Metadata = {
  title: 'DMS — 팀 문서 관리',
  description: '팀 프로젝트 문서를 한 곳에서 관리합니다.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className={`${GeistSans.variable} ${notoSansKr.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        {/* 실패 알림은 전부 여기로 모인다. window.alert 은 흐름을 끊고 aria-live 도 없었다. */}
        <Toaster position="bottom-right" />
      </body>
    </html>
  )
}
