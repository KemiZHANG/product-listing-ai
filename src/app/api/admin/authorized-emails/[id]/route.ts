import { NextRequest, NextResponse } from 'next/server'
import { isAdminEmail, isPrimaryAdminEmail } from '@/lib/admin'
import { getAuthorizedUser } from '@/lib/app-auth'
import { getServerSupabase } from '@/lib/supabase'

async function requireAdmin(request: NextRequest) {
  const { user, error } = await getAuthorizedUser(request)
  if (error || !user) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 403 })
  }

  if (!isAdminEmail(user.email)) {
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
  const { data: existing, error: existingError } = await supabase
    .from('builtin_key_authorizations')
    .select('email')
    .eq('id', params.id)
    .single()

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  if (isPrimaryAdminEmail(existing.email) && updateData.active === false) {
    return NextResponse.json({ error: 'Primary admin cannot be revoked.' }, { status: 403 })
  }

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminError = await requireAdmin(request)
  if (adminError) return adminError

  const supabase = getServerSupabase()
  const { data: existing, error: existingError } = await supabase
    .from('builtin_key_authorizations')
    .select('email')
    .eq('id', params.id)
    .single()

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  if (isPrimaryAdminEmail(existing.email)) {
    return NextResponse.json({ error: 'Primary admin cannot be deleted.' }, { status: 403 })
  }

  const { error } = await supabase
    .from('builtin_key_authorizations')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
