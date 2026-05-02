import type { NextRequest } from 'next/server'
import { isAdminEmail } from './admin'
import { isAllowedAppEmail } from './access-control'
import { isBuiltinKeyEmailAuthorized } from './builtin-key-access'
import { getAuthenticatedUser, getServerSupabase } from './supabase'

export const INTERNAL_WORKSPACE_KEY = 'internal'
export const EXTERNAL_WORKSPACE_KEY = 'external'

export type WorkspaceKey = typeof INTERNAL_WORKSPACE_KEY | typeof EXTERNAL_WORKSPACE_KEY

export async function getWorkspaceKeyForEmail(email: string | null | undefined): Promise<WorkspaceKey> {
  if (isAdminEmail(email) || await isBuiltinKeyEmailAuthorized(email)) {
    return INTERNAL_WORKSPACE_KEY
  }
  return EXTERNAL_WORKSPACE_KEY
}

export async function getWorkspaceContext(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request)
  if (error || !user) {
    return { user: null, workspaceKey: null, error: error || 'Unauthorized' }
  }

  if (!isAllowedAppEmail(user.email)) {
    return { user: null, workspaceKey: null, error: 'Email is not allowed for this app' }
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
