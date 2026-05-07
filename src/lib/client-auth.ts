'use client'

import { supabase } from './supabase'

export const UNAUTHORIZED_LOGIN_REASON = 'unauthorized'

export async function readJsonSafely(response: Response) {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function fetchAccessStatus(accessToken: string) {
  const response = await fetch('/api/auth/access', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  const payload = await readJsonSafely(response)

  return {
    ok: response.ok && payload?.allowed !== false,
    status: response.status,
    error: typeof payload?.error === 'string' ? payload.error : null,
  }
}

export async function signOutAndRedirectToLogin(reason = UNAUTHORIZED_LOGIN_REASON) {
  try {
    await supabase.auth.signOut({ scope: 'global' })
  } catch {
    // Ignore client sign-out errors and still force the browser back to login.
  }

  if (typeof window !== 'undefined') {
    window.location.replace(`/login?reason=${encodeURIComponent(reason)}`)
  }
}
