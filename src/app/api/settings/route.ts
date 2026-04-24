import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: settings, error } = await supabase
    .from('system_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Create default settings if none exist
  if (!settings) {
    const { data: newSettings, error: createError } = await supabase
      .from('system_settings')
      .insert({
        user_id: user.id,
        gemini_api_key_encrypted: null,
        use_builtin_key: false,
        builtin_key_password_verified: false,
      })
      .select()
      .single()

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }

    return NextResponse.json(newSettings)
  }

  return NextResponse.json(settings)
}

export async function PUT(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { gemini_api_key, use_builtin_key, builtin_key_password_verified } = body

  const updateData: Record<string, unknown> = {}

  if (gemini_api_key !== undefined) {
    updateData.gemini_api_key_encrypted = gemini_api_key
  }
  if (use_builtin_key !== undefined) {
    updateData.use_builtin_key = use_builtin_key
    // If switching away from builtin, reset verification
    if (!use_builtin_key) {
      updateData.builtin_key_password_verified = false
    }
  }
  if (builtin_key_password_verified !== undefined) {
    updateData.builtin_key_password_verified = builtin_key_password_verified
  }

  // Upsert settings
  const { data: existing } = await supabase
    .from('system_settings')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  let result
  if (existing) {
    result = await supabase
      .from('system_settings')
      .update(updateData)
      .eq('user_id', user.id)
      .select()
      .single()
  } else {
    result = await supabase
      .from('system_settings')
      .insert({
        user_id: user.id,
        ...updateData,
      })
      .select()
      .single()
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 })
  }

  return NextResponse.json(result.data)
}
