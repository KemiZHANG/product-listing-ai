import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

function isCompleteJwt(value: string | undefined) {
  if (!value) return false
  const parts = value.split('.')
  return parts.length === 3 && value.length > 120 && parts.every((part) => part.length > 10)
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const supabaseAnonKey = (() => {
  const value = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!isCompleteJwt(value)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not a complete JWT')
  }
  return value
})()

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export function getServerSupabase() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  return authHeader?.match(/^Bearer\s+(.+)$/i)?.[1] || null
}

export function getRequestSupabase(request: NextRequest) {
  const token = getBearerToken(request)

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined,
  })
}

export async function getAuthenticatedUser(request: NextRequest) {
  const token = getBearerToken(request)

  if (!token) {
    return { user: null, error: 'Missing auth token' }
  }

  const authClient = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data, error } = await authClient.auth.getUser(token)

  return {
    user: data.user,
    error: error?.message ?? null,
  }
}
