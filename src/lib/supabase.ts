import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

function isCompleteJwt(value: string | undefined) {
  if (!value) return false
  const parts = value.split('.')
  return parts.length === 3 && value.length > 120 && parts.every((part) => part.length > 10)
}

function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!value) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL')
  }
  return value
}

function getSupabaseAnonKey() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!value) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  if (!isCompleteJwt(value)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not a complete JWT')
  }
  return value
}

function requireServerEnv(name: 'SUPABASE_SERVICE_ROLE_KEY') {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

let browserSupabase: SupabaseClient | null = null

function getBrowserSupabase() {
  if (!browserSupabase) {
    browserSupabase = createClient(getSupabaseUrl(), getSupabaseAnonKey())
  }
  return browserSupabase
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getBrowserSupabase() as unknown as Record<PropertyKey, unknown>
    const value = client[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})

export function getServerSupabase() {
  return createClient(
    getSupabaseUrl(),
    requireServerEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  return authHeader?.match(/^Bearer\s+(.+)$/i)?.[1] || null
}

export function getRequestSupabase(request: NextRequest) {
  const token = getBearerToken(request)

  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
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
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data, error } = await authClient.auth.getUser(token)

  return {
    user: data.user,
    error: error?.message ?? null,
  }
}
