import { NextRequest, NextResponse } from 'next/server'
import { getAuthorizedUser } from '@/lib/app-auth'
import { getAppEdition } from '@/lib/app-edition'
import { logServerEvent } from '@/lib/observability'
import { getWorkspaceKeyForEmail } from '@/lib/workspace'

export async function GET(request: NextRequest) {
  const { user, error } = await getAuthorizedUser(request)
  if (error || !user) {
    logServerEvent('warn', 'auth.access_denied', {
      edition: getAppEdition(),
      reason: error || 'Unauthorized',
      path: request.nextUrl.pathname,
    })
    return NextResponse.json({ allowed: false, error: error || 'Unauthorized' }, { status: 403 })
  }

  return NextResponse.json({
    allowed: true,
    edition: getAppEdition(),
    workspace_key: await getWorkspaceKeyForEmail(user.email),
  })
}
