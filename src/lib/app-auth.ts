import type { NextRequest } from 'next/server'
import { isAdminEmail } from './admin'
import { isBuiltinKeyEmailAuthorized } from './builtin-key-access'
import { getAppEdition } from './app-edition'
import { getAuthenticatedUser } from './supabase'

export const APP_AUTH_ERROR = '该邮箱未被管理员授权，请联系管理员开通后再使用。'

export async function isAppEmailAuthorized(email: string | null | undefined) {
  if (getAppEdition() === 'resume') return true
  return isAdminEmail(email) || await isBuiltinKeyEmailAuthorized(email)
}

export async function getAuthorizedUser(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request)
  if (error || !user) {
    return { user: null, error: error || 'Unauthorized' }
  }

  if (!await isAppEmailAuthorized(user.email)) {
    return { user: null, error: APP_AUTH_ERROR }
  }

  return { user, error: null }
}
