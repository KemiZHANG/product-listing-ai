import { getServerSupabase } from './supabase'
import { normalizeEmail } from './admin'

export type BuiltinKeyAuthorization = {
  id: string
  email: string
  active: boolean
  note: string | null
  created_at: string
  updated_at: string
  revoked_at: string | null
  created_by: string | null
}

export async function getBuiltinKeyAuthorization(email: string | null | undefined) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return null

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('builtin_key_authorizations')
    .select('*')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (error) {
    if (
      error.code === '42P01' ||
      error.message.toLowerCase().includes('does not exist') ||
      error.message.toLowerCase().includes('schema cache')
    ) {
      return null
    }
    throw error
  }

  return data as BuiltinKeyAuthorization | null
}

export async function isBuiltinKeyEmailAuthorized(email: string | null | undefined) {
  const authorization = await getBuiltinKeyAuthorization(email)
  return Boolean(authorization?.active)
}

export async function getBuiltinKeyAccess(userId: string, email: string | null | undefined) {
  const supabase = getServerSupabase()
  const authorization = await getBuiltinKeyAuthorization(email)

  const { data: settings, error } = await supabase
    .from('system_settings')
    .select('use_builtin_key, builtin_key_password_verified')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  const emailAuthorized = Boolean(authorization?.active)
  const passwordVerified = Boolean(settings?.use_builtin_key && settings?.builtin_key_password_verified)

  return {
    allowed: emailAuthorized || passwordVerified,
    emailAuthorized,
    passwordVerified,
    authorization,
  }
}
