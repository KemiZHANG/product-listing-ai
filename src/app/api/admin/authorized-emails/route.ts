import { NextRequest, NextResponse } from 'next/server'
import { isAdminEmail, normalizeEmail } from '@/lib/admin'
import { getAuthorizedUser } from '@/lib/app-auth'
import { getServerSupabase } from '@/lib/supabase'

function tableMissingError(error: { code?: string; message?: string } | null) {
  if (!error?.message) return false
  const message = error.message.toLowerCase()
  return error.code === '42P01' || message.includes('does not exist') || message.includes('schema cache')
}

async function requireAdmin(request: NextRequest) {
  const { user, error } = await getAuthorizedUser(request)
  if (error || !user) {
    return { user: null, response: NextResponse.json({ error: error || 'Unauthorized' }, { status: 403 }) }
  }

  if (!isAdminEmail(user.email)) {
    return { user: null, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }

  return { user, response: null }
}

export async function GET(request: NextRequest) {
  const { response } = await requireAdmin(request)
  if (response) return response

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('builtin_key_authorizations')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    if (tableMissingError(error)) {
      return NextResponse.json({
        error: 'Authorization table is not installed. Run supabase/builtin_key_authorizations.sql in Supabase SQL Editor.',
        migrationRequired: true,
      }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ authorizations: data || [] })
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireAdmin(request)
  if (response || !user) return response

  const body = await request.json()
  const email = normalizeEmail(body.email)
  const note = typeof body.note === 'string' ? body.note.trim() || null : null

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('builtin_key_authorizations')
    .upsert({
      email,
      note,
      active: true,
      revoked_at: null,
      created_by: user.id,
    }, { onConflict: 'email' })
    .select()
    .single()

  if (error) {
    if (tableMissingError(error)) {
      return NextResponse.json({
        error: 'Authorization table is not installed. Run supabase/builtin_key_authorizations.sql in Supabase SQL Editor.',
        migrationRequired: true,
      }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ authorization: data }, { status: 201 })
}
