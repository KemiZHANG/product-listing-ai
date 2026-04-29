import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'
import { encodeStoredGeminiSettings, isValidGeminiApiKey, parseStoredGeminiSettings } from '@/lib/gemini-settings'
import { getBuiltinKeyAuthorization } from '@/lib/builtin-key-access'
import { isAdminEmail } from '@/lib/admin'

async function withGenerationMode<T extends { gemini_api_key_encrypted: string | null }>(settings: T, email?: string | null) {
  const stored = parseStoredGeminiSettings(settings.gemini_api_key_encrypted)
  const hasStoredKey = Boolean(stored.apiKey)
  const hasValidStoredKey = isValidGeminiApiKey(stored.apiKey)
  const authorization = await getBuiltinKeyAuthorization(email)
  const admin = isAdminEmail(email)
  const generationMode = admin && stored.generationMode === 'direct' ? 'direct' : 'batch'
  const imageProvider = admin && stored.imageProvider === 'openai' ? 'openai' : 'gemini'
  return {
    ...settings,
    gemini_api_key_encrypted: hasStoredKey ? 'configured' : null,
    gemini_api_key_valid: hasValidStoredKey,
    generation_mode: generationMode,
    image_provider: imageProvider,
    builtin_key_email_authorized: Boolean(authorization?.active),
    builtin_key_authorization_note: authorization?.note || null,
    is_admin: admin,
  }
}

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

    return NextResponse.json(await withGenerationMode(newSettings, user.email))
  }

  return NextResponse.json(await withGenerationMode(settings, user.email))
}

export async function PUT(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { gemini_api_key, use_builtin_key, builtin_key_password_verified, generation_mode, image_provider } = body

  const updateData: Record<string, unknown> = {}

  const { data: existingSettings } = await supabase
    .from('system_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  const currentStored = parseStoredGeminiSettings(existingSettings?.gemini_api_key_encrypted)
  const admin = isAdminEmail(user.email)

  if (generation_mode === 'direct' && !admin) {
    return NextResponse.json({
      error: '普通即时模式仅管理员可使用。请使用 Batch 半价模式。',
    }, { status: 403 })
  }

  if (image_provider === 'openai' && !admin) {
    return NextResponse.json({
      error: 'GPT Image 2 仅管理员可使用。',
    }, { status: 403 })
  }

  if (gemini_api_key !== undefined) {
    const trimmedKey = String(gemini_api_key).trim()
    if (!isValidGeminiApiKey(trimmedKey)) {
      return NextResponse.json({
        error: '请输入有效的 Gemini API Key。Google AI Studio 的 key 通常以 AIza 开头。',
      }, { status: 400 })
    }
  }

  if (gemini_api_key !== undefined || generation_mode !== undefined || image_provider !== undefined) {
    updateData.gemini_api_key_encrypted = encodeStoredGeminiSettings({
      apiKey: gemini_api_key !== undefined ? String(gemini_api_key).trim() : currentStored.apiKey,
      generationMode: generation_mode === 'direct' && admin ? 'direct' : 'batch',
      imageProvider: image_provider !== undefined
        ? (image_provider === 'openai' && admin ? 'openai' : 'gemini')
        : (currentStored.imageProvider === 'openai' && admin ? 'openai' : 'gemini'),
    })
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
  let result
  if (existingSettings) {
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

  return NextResponse.json(await withGenerationMode(result.data, user.email))
}
