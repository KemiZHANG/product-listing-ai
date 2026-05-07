import type { NextRequest } from 'next/server'
import { isPrimaryAdminEmail } from './admin'
import { isBuiltinKeyEmailAuthorized } from './builtin-key-access'
import { getAppEdition } from './app-edition'
import { ensureProfileForUser } from './profile'
import { getAuthenticatedUser } from './supabase'

export const APP_AUTH_ERROR = 'This company email is not authorized. Ask the primary admin to restore access.'

export async function isAppEmailAuthorized(email: string | null | undefined) {
  if (getAppEdition() === 'resume') return true
  return isPrimaryAdminEmail(email) || await isBuiltinKeyEmailAuthorized(email)
}

export async function getAuthorizedUser(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request)
  if (error || !user) {
    return { user: null, error: error || 'Unauthorized' }
  }

  if (!await isAppEmailAuthorized(user.email)) {
    return { user: null, error: APP_AUTH_ERROR }
  }

  await ensureProfileForUser(user)

  return { user, error: null }
}
