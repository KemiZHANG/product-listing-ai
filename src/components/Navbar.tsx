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
    <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 text-lg font-semibold text-slate-950">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-100 text-xl shadow-sm">
              🍌
            </span>
            <span className="tracking-tight">Nano Banana</span>
          </Link>

          <div className="hidden items-center gap-1 sm:flex">
            {visibleLinks.map((link) => {
              const isActive =
                link.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-100 text-slate-950'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="hidden max-w-[260px] truncate text-sm text-slate-500 md:inline">
              {userEmail}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 sm:hidden">
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
