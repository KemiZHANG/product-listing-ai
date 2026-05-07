'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { fetchAccessStatus, signOutAndRedirectToLogin } from '@/lib/client-auth'
import { supabase } from '@/lib/supabase'

const PUBLIC_PATHS = new Set(['/login'])
const ACCESS_CHECK_INTERVAL_MS = 15000

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublicPath = useMemo(() => PUBLIC_PATHS.has(pathname), [pathname])
  const [ready, setReady] = useState(isPublicPath)

  useEffect(() => {
    if (isPublicPath) {
      setReady(true)
      return
    }

    let disposed = false
    let checking = false

    const verifyAccess = async () => {
      if (disposed || checking) return
      checking = true

      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session?.access_token) {
          await signOutAndRedirectToLogin()
          return
        }

        const access = await fetchAccessStatus(session.access_token)
        if (!access.ok) {
          await signOutAndRedirectToLogin()
          return
        }

        if (!disposed) {
          setReady(true)
        }
      } finally {
        checking = false
      }
    }

    setReady(false)
    void verifyAccess()

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (disposed || isPublicPath) return

      if (event === 'SIGNED_OUT') {
        if (typeof window !== 'undefined') {
          window.location.replace('/login')
        }
        return
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void verifyAccess()
      }
    })

    const handleWindowFocus = () => {
      void verifyAccess()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void verifyAccess()
      }
    }

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const intervalId = window.setInterval(() => {
      void verifyAccess()
    }, ACCESS_CHECK_INTERVAL_MS)

    return () => {
      disposed = true
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      authListener.subscription.unsubscribe()
    }
  }, [isPublicPath])

  if (isPublicPath || ready) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm font-medium text-slate-500">
      Checking access...
    </div>
  )
}
