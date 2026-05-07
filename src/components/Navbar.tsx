'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import BrandMark from '@/components/BrandMark'
import LanguageToggle from '@/components/LanguageToggle'
import { isAdminEmail } from '@/lib/admin'
import { getClientBrandConfig } from '@/lib/brand'
import { signOutAndRedirectToLogin } from '@/lib/client-auth'
import { getNavbarCopy } from '@/lib/ui-copy'
import { useUiLanguage } from '@/lib/ui-language'
import { supabase } from '@/lib/supabase'

export default function Navbar() {
  const pathname = usePathname()
  const brand = getClientBrandConfig()
  const { language } = useUiLanguage()
  const text = getNavbarCopy(language)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  const navLinks = [
    { href: '/dashboard', label: text.dashboard },
    { href: '/', label: text.products },
    { href: '/categories', label: text.categories },
    { href: '/product-outputs', label: text.productOutputs },
    { href: '/outputs', label: text.imageOutputs },
    { href: '/seo-keywords', label: text.seoKeywords },
    { href: '/rules', label: text.rules },
    { href: '/settings', label: text.settings },
  ]

  const visibleLinks = isAdminEmail(userEmail)
    ? [...navLinks, { href: '/admin/authorized-emails', label: text.admin }]
    : navLinks

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: 'global' }).catch(() => null)
    await signOutAndRedirectToLogin()
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/78 shadow-[0_18px_70px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="group flex shrink-0 items-center gap-3 text-lg font-semibold text-slate-950">
            <BrandMark />
            <span className="tracking-tight">{brand.appName}</span>
          </Link>

          <div className="hidden items-center gap-1.5 lg:flex">
            {visibleLinks.map((link) => {
              const isActive = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative rounded-xl px-2.5 py-2 text-xs font-semibold transition-all duration-200 xl:px-3 xl:text-sm ${
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
            {text.logout}
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
