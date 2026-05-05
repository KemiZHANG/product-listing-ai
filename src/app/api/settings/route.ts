import { NextRequest, NextResponse } from 'next/server'
import { getRequestSupabase } from '@/lib/supabase'
import { getAuthorizedUser } from '@/lib/app-auth'
import { encodeStoredGeminiSettings, isValidGeminiApiKey, parseStoredGeminiSettings } from '@/lib/gemini-settings'
import { getBuiltinKeyAuthorization } from '@/lib/builtin-key-access'
import { isAdminEmail } from '@/lib/admin'
import { isValidOpenAIApiKey } from '@/lib/openai-image'

async function withGenerationMode<T extends {
  gemini_api_key_encrypted: string | null
  use_builtin_key: boolean
  builtin_key_password_verified: boolean
}>(settings: T, email?: string | null) {
  const stored = parseStoredGeminiSettings(settings.gemini_api_key_encrypted)
  const hasStoredKey = Boolean(stored.apiKey)
  const hasValidStoredKey = isValidGeminiApiKey(stored.apiKey)
  const hasStoredOpenAIKey = Boolean(stored.openaiApiKey)
  const hasValidStoredOpenAIKey = isValidOpenAIApiKey(stored.openaiApiKey)
  const authorization = await getBuiltinKeyAuthorization(email)
  const admin = isAdminEmail(email)
  const emailAuthorized = Boolean(authorization?.active)
  const lockedToStaffBatch = emailAuthorized && !admin
  const generationMode = lockedToStaffBatch ? 'batch' : (stored.generationMode === 'direct' ? 'direct' : 'batch')
  const imageProvider = lockedToStaffBatch ? 'gemini' : (stored.imageProvider === 'openai' ? 'openai' : 'gemini')
  return {
    ...settings,
    gemini_api_key_encrypted: hasStoredKey ? 'configured' : null,
    gemini_api_key_valid: hasValidStoredKey,
    openai_api_key_encrypted: hasStoredOpenAIKey ? 'configured' : null,
    openai_api_key_valid: hasValidStoredOpenAIKey,
    generation_mode: generationMode,
    image_provider: imageProvider,
    builtin_key_email_authorized: emailAuthorized,
    builtin_key_authorization_note: authorization?.note || null,
    is_admin: admin,
  }
}

export async function GET(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthorizedUser(request)
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
  const { user, error: authError } = await getAuthorizedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { gemini_api_key, openai_api_key, use_builtin_key, builtin_key_password_verified, generation_mode, image_provider } = body

  const updateData: Record<string, unknown> = {}

  const { data: existingSettings } = await supabase
    .from('system_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  const currentStored = parseStoredGeminiSettings(existingSettings?.gemini_api_key_encrypted)
  const admin = isAdminEmail(user.email)
  const authorization = await getBuiltinKeyAuthorization(user.email)
  const emailAuthorized = Boolean(authorization?.active)
  const lockedToStaffBatch = emailAuthorized && !admin

  if (lockedToStaffBatch && generation_mode === 'direct') {
    return NextResponse.json({
      error: '公司授权邮箱仅开放 Nano Banana Batch 模式。',
    }, { status: 403 })
  }

  if (lockedToStaffBatch && image_provider === 'openai') {
    return NextResponse.json({
      error: '公司授权邮箱仅开放 Nano Banana Batch 模式。',
    }, { status: 403 })
  }

  if (gemini_api_key !== undefined && String(gemini_api_key).trim()) {
    const trimmedKey = String(gemini_api_key).trim()
    if (!isValidGeminiApiKey(trimmedKey)) {
      return NextResponse.json({
        error: '请输入有效的 Gemini API Key。Google AI Studio 的 key 通常以 AIza 开头。',
      }, { status: 400 })
    }
  }

  if (openai_api_key !== undefined && String(openai_api_key).trim()) {
    const trimmedKey = String(openai_api_key).trim()
    if (!isValidOpenAIApiKey(trimmedKey)) {
      return NextResponse.json({
        error: '请输入有效的 OpenAI API Key，通常以 sk- 开头。',
      }, { status: 400 })
    }
  }

  if (
    gemini_api_key !== undefined ||
    openai_api_key !== undefined ||
    generation_mode !== undefined ||
    image_provider !== undefined
  ) {
    updateData.gemini_api_key_encrypted = encodeStoredGeminiSettings({
      apiKey: gemini_api_key !== undefined ? (String(gemini_api_key).trim() || null) : currentStored.apiKey,
      openaiApiKey: openai_api_key !== undefined ? (String(openai_api_key).trim() || null) : currentStored.openaiApiKey,
      generationMode: lockedToStaffBatch
        ? 'batch'
        : generation_mode !== undefined
          ? (generation_mode === 'direct' ? 'direct' : 'batch')
          : currentStored.generationMode,
      imageProvider: lockedToStaffBatch
        ? 'gemini'
        : image_provider !== undefined
          ? (image_provider === 'openai' ? 'openai' : 'gemini')
          : currentStored.imageProvider,
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
