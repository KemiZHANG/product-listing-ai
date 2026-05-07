import { NextRequest, NextResponse } from 'next/server'
import { isPrimaryAdminEmail } from '@/lib/admin'
import { getAuthenticatedUser, getServerSupabase } from '@/lib/supabase'

async function requireAdmin(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser(request)
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isPrimaryAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  return null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminError = await requireAdmin(request)
  if (adminError) return adminError

  const body = await request.json()
  const updateData: Record<string, unknown> = {}

  if (typeof body.active === 'boolean') {
    updateData.active = body.active
    updateData.revoked_at = body.active ? null : new Date().toISOString()
  }

  if (body.note !== undefined) {
    updateData.note = typeof body.note === 'string' ? body.note.trim() || null : null
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('builtin_key_authorizations')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ authorization: data })
}
