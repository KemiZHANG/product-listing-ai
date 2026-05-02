'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isAdminEmail } from '@/lib/admin'
import { isAllowedAppEmail } from '@/lib/access-control'

const NAV_LINKS = [
  { href: '/', label: 'Products' },
  { href: '/categories', label: 'Categories' },
  { href: '/product-outputs', label: 'Product Outputs' },
  { href: '/outputs', label: 'Image Outputs' },
  { href: '/seo-keywords', label: 'SEO Keywords' },
  { href: '/rules', label: 'Rules' },
  { href: '/settings', label: 'Settings' },
]

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const visibleLinks = isAdminEmail(userEmail)
    ? [...NAV_LINKS, { href: '/admin/authorized-emails', label: 'Admin' }]
    : NAV_LINKS

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? null
      if (email && !isAllowedAppEmail(email)) {
        supabase.auth.signOut().finally(() => {
          router.replace('/login')
          router.refresh()
        })
        return
      }
      setUserEmail(email)
    })
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/82 shadow-[0_18px_70px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
      <div className="mx-auto flex h-[76px] max-w-[1600px] items-center justify-between px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-9">
          <Link href="/" className="group flex shrink-0 items-center gap-3 text-xl font-semibold text-slate-950">
            <span className="flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-amber-100 via-yellow-50 to-white text-2xl shadow-[0_12px_30px_rgba(245,158,11,0.18)] ring-1 ring-amber-200/70 transition-transform group-hover:-rotate-3 group-hover:scale-105">
              🍌
            </span>
            <span className="tracking-tight">
              Nano Listing <span className="text-blue-600">AI</span>
            </span>
          </Link>

          <div className="hidden items-center gap-2 lg:flex">
            {visibleLinks.map((link) => {
              const isActive =
                link.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/15'
                      : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-950'
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <span className="absolute -bottom-[18px] left-5 right-5 h-1 rounded-full bg-blue-500" />
                  )}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {userEmail && (
            <span className="hidden max-w-[260px] truncate rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm xl:inline">
              {userEmail}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="rounded-2xl border border-slate-200 bg-white/85 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-950"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-t border-slate-100 bg-white/75 px-4 py-2 lg:hidden">
        {visibleLinks.map((link) => {
          const isActive =
            link.href === '/'
              ? pathname === '/'
              : pathname.startsWith(link.href)
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-500 hover:bg-slate-50'
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
