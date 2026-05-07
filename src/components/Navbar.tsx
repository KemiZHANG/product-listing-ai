'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import BrandMark from '@/components/BrandMark'
import LanguageToggle from '@/components/LanguageToggle'
import { getClientBrandConfig } from '@/lib/brand'
import { pickText, useUiLanguage } from '@/lib/ui-language'
import { isPrimaryAdminEmail } from '@/lib/admin'
import { supabase } from '@/lib/supabase'

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const brand = getClientBrandConfig()
  const { language } = useUiLanguage()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const navLinks = [
    { href: '/dashboard', label: pickText(language, { zh: '概览', en: 'Dashboard' }) },
    { href: '/', label: pickText(language, { zh: '商品', en: 'Products' }) },
    { href: '/categories', label: pickText(language, { zh: '类目', en: 'Categories' }) },
    { href: '/product-outputs', label: pickText(language, { zh: '副本输出', en: 'Product Outputs' }) },
    { href: '/outputs', label: pickText(language, { zh: '图片输出', en: 'Image Outputs' }) },
    { href: '/seo-keywords', label: pickText(language, { zh: 'SEO 关键词', en: 'SEO Keywords' }) },
    { href: '/rules', label: pickText(language, { zh: '规则', en: 'Rules' }) },
    { href: '/settings', label: pickText(language, { zh: '设置', en: 'Settings' }) },
  ]

  const visibleLinks = isPrimaryAdminEmail(userEmail)
    ? [...navLinks, { href: '/admin/authorized-emails', label: pickText(language, { zh: '管理', en: 'Admin' }) }]
    : navLinks

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/78 shadow-[0_18px_70px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" className="group flex shrink-0 items-center gap-3 text-lg font-semibold text-slate-950">
            <BrandMark />
            <span className="tracking-tight">
              {brand.appName}
            </span>
          </Link>

          <div className="hidden items-center gap-2 lg:flex">
            {visibleLinks.map((link) => {
              const isActive = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/15'
                      : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-950'
                  }`}
                >
                  {link.label}
                  {isActive && <span className="absolute -bottom-[15px] left-4 right-4 h-1 rounded-full bg-sky-600" />}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <LanguageToggle />
          {userEmail && (
            <span className="hidden max-w-[260px] truncate rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm xl:inline">
              {userEmail}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="rounded-xl border border-slate-200 bg-white/85 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors duration-200 hover:border-slate-300 hover:bg-white hover:text-slate-950"
          >
            {pickText(language, { zh: '退出', en: 'Logout' })}
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-t border-slate-100 bg-white/75 px-4 py-2 lg:hidden">
        {visibleLinks.map((link) => {
          const isActive = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors duration-200 ${
                isActive ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {link.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
