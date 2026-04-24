import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getServerSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const supabase = getServerSupabase()
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { password } = body

  if (!password) {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 })
  }

  const accessPassword = process.env.BUILTIN_KEY_ACCESS_PASSWORD
  if (!accessPassword) {
    return NextResponse.json({ error: 'Built-in key access is not configured' }, { status: 500 })
  }

  if (password !== accessPassword) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 403 })
  }

  // Password matches - update settings
  const { data: existing } = await supabase
    .from('system_settings')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('system_settings')
      .update({
        builtin_key_password_verified: true,
        use_builtin_key: true,
      })
      .eq('user_id', user.id)
  } else {
    await supabase
      .from('system_settings')
      .insert({
        user_id: user.id,
        use_builtin_key: true,
        builtin_key_password_verified: true,
      })
  }

  return NextResponse.json({ success: true, message: 'Password verified' })
}
