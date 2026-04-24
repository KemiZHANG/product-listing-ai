import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

const fallbackSupabaseUrl = 'https://ytphdxldfifgafvypyuz.supabase.co'
const fallbackSupabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0cGhkeGxkZmlmZ2FmdnlweXV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzI1NzUsImV4cCI6MjA5MjYwODU3NX0.zDVi3v_D4IakcLFuyXVS8u1LTNerTIKcrIHv9dYDFfc'

function isCompleteJwt(value: string | undefined) {
  return Boolean(value && value.split('.').length === 3)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || fallbackSupabaseUrl
const supabaseAnonKey = isCompleteJwt(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  : fallbackSupabaseAnonKey

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export function getServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]

  if (!token) {
    return { user: null, error: 'Missing auth token' }
  }

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || fallbackSupabaseUrl,
    isCompleteJwt(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      : fallbackSupabaseAnonKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data, error } = await authClient.auth.getUser(token)

  return {
    user: data.user,
    error: error?.message ?? null,
  }
}
