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
  { href: '/rules', label: 'Rules' },
  { href: '/outputs', label: 'Legacy Outputs' },
  { href: '/jobs', label: 'Legacy Jobs' },
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
    <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 shadow-[0_1px_0_rgba(15,23,42,0.03)] backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-9">
          <Link href="/" className="flex shrink-0 items-center gap-3 text-xl font-semibold text-slate-950">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-yellow-50 text-2xl shadow-sm ring-1 ring-amber-200/60">
              🍌
            </span>
            <span className="tracking-tight">Nano Banana</span>
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
                  className={`relative rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-slate-100 text-slate-950 shadow-sm'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <span className="absolute -bottom-[18px] left-4 right-4 h-1 rounded-full bg-slate-950" />
                  )}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {userEmail && (
            <span className="hidden max-w-[260px] truncate rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm xl:inline">
              {userEmail}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden">
        {visibleLinks.map((link) => {
          const isActive =
            link.href === '/'
              ? pathname === '/'
              : pathname.startsWith(link.href)
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-slate-100 text-slate-950'
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
