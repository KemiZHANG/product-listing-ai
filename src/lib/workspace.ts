import type { NextRequest } from 'next/server'
import { isAdminEmail } from './admin'
import { isBuiltinKeyEmailAuthorized } from './builtin-key-access'
import { getAuthorizedUser } from './app-auth'
import { getAppEdition } from './app-edition'
import { getServerSupabase } from './supabase'

export const INTERNAL_WORKSPACE_KEY = 'internal'
export const EXTERNAL_WORKSPACE_KEY = 'external'

export type WorkspaceKey = typeof INTERNAL_WORKSPACE_KEY | typeof EXTERNAL_WORKSPACE_KEY

export async function getWorkspaceKeyForEmail(email: string | null | undefined): Promise<WorkspaceKey> {
  if (getAppEdition() === 'resume') {
    return EXTERNAL_WORKSPACE_KEY
  }

  if (isAdminEmail(email) || await isBuiltinKeyEmailAuthorized(email)) {
    return INTERNAL_WORKSPACE_KEY
  }
  return EXTERNAL_WORKSPACE_KEY
}

export async function getWorkspaceContext(request: NextRequest) {
  const { user, error } = await getAuthorizedUser(request)
  if (error || !user) {
    return { user: null, workspaceKey: null, error: error || 'Unauthorized' }
  }

  return {
    user,
    workspaceKey: await getWorkspaceKeyForEmail(user.email),
    error: null,
  }
}

export function getWorkspaceSupabase() {
  return getServerSupabase()
}

export function withWorkspace<T extends Record<string, unknown>>(
  row: T,
  userId: string,
  workspaceKey: WorkspaceKey
) {
  return {
    ...row,
    user_id: userId,
    workspace_key: workspaceKey,
  }
}
