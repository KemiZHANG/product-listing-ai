import { NextRequest, NextResponse } from 'next/server'
import { getAuthorizedUser } from '@/lib/app-auth'
import { getAppEdition } from '@/lib/app-edition'
import { getWorkspaceKeyForEmail } from '@/lib/workspace'

export async function GET(request: NextRequest) {
  const { user, error } = await getAuthorizedUser(request)
  if (error || !user) {
    return NextResponse.json({ allowed: false, error: error || 'Unauthorized' }, { status: 403 })
  }

  return NextResponse.json({
    allowed: true,
    edition: getAppEdition(),
    workspace_key: await getWorkspaceKeyForEmail(user.email),
  })
}
