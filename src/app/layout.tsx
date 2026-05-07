import type { Metadata } from 'next'
import localFont from 'next/font/local'
import AuthGate from '@/components/AuthGate'
import { getBrandConfig } from '@/lib/brand'
import { UiLanguageProvider } from '@/lib/ui-language'
import './globals.css'

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
})

const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
})

const brand = getBrandConfig()

export const metadata: Metadata = {
  title: brand.appName,
  description: brand.shortDescription,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable} bg-gray-50 text-gray-900 antialiased`}>
        <UiLanguageProvider>
          <AuthGate>{children}</AuthGate>
        </UiLanguageProvider>
      </body>
    </html>
  )
}
