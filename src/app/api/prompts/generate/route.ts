import { NextRequest, NextResponse } from 'next/server'
import { getBuiltinKeyAccess } from '@/lib/builtin-key-access'
import { isValidGeminiApiKey, parseStoredGeminiSettings, readBuiltinGeminiApiKey } from '@/lib/gemini-settings'
import { isAdminEmail } from '@/lib/admin'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'
import {
  buildPromptGeneratorInstruction,
  buildPromptGeneratorUserPrompt,
  cleanGeneratedPrompt,
  PROMPT_GENERATOR_MODEL,
} from '@/lib/prompt-generator-skill'

function extractText(response: unknown) {
  const parts = (response as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>
      }
    }>
  })?.candidates?.[0]?.content?.parts

  return parts?.map((part) => part.text || '').join('').trim() || ''
}

export async function POST(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await getBuiltinKeyAccess(user.id, user.email)
  const admin = isAdminEmail(user.email)
  const { data: settings } = await supabase
    .from('system_settings')
    .select('gemini_api_key_encrypted')
    .eq('user_id', user.id)
    .maybeSingle()
  const ownGeminiKey = parseStoredGeminiSettings(settings?.gemini_api_key_encrypted).apiKey || null
  const apiKey = admin || access.allowed ? readBuiltinGeminiApiKey() : ownGeminiKey

  if (!apiKey || !isValidGeminiApiKey(apiKey)) {
    return NextResponse.json({
      error: 'AI prompt generation requires an authorized email, verified built-in API password, or your own Gemini API key.',
      code: 'BUILTIN_KEY_ACCESS_REQUIRED',
    }, { status: 403 })
  }

  const body = await request.json()
  const {
    category_id,
    product_type,
    image_style,
    people_mode,
    display_method,
    extra_info,
  } = body

  if (!category_id) {
    return NextResponse.json({ error: 'category_id is required' }, { status: 400 })
  }

  const { data: category } = await supabase
    .from('categories')
    .select('id, name_zh, slug')
    .eq('id', category_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  const { data: prompts } = await supabase
    .from('category_prompts')
    .select('prompt_text')
    .eq('category_id', category_id)
    .order('prompt_number', { ascending: true })
    .limit(3)

  const { data: rules } = await supabase
    .from('rule_templates')
    .select('name, scope, content')
    .eq('user_id', user.id)
    .eq('active', true)

  const ruleText = (rules || [])
    .map((rule) => `【${rule.name} / ${rule.scope}】\n${rule.content}`)
    .join('\n\n')

  const userPrompt = buildPromptGeneratorUserPrompt({
    categoryName: category.name_zh,
    categorySlug: category.slug,
    productType: String(product_type || '').trim(),
    imageStyle: String(image_style || '').trim(),
    peopleMode: String(people_mode || '').trim(),
    displayMethod: String(display_method || '').trim(),
    extraInfo: [
      String(extra_info || '').trim(),
      ruleText ? `请遵守以下网站规则模板和图片输出限制：\n${ruleText}` : '',
    ].filter(Boolean).join('\n\n'),
    existingPrompts: prompts?.map((prompt) => prompt.prompt_text) || [],
  })

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${PROMPT_GENERATOR_MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: buildPromptGeneratorInstruction() }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1800,
      },
    }),
  })

  if (!response.ok) {
    return NextResponse.json({
      error: `Gemini prompt generation failed: ${await response.text()}`,
    }, { status: response.status })
  }

  const generatedText = cleanGeneratedPrompt(extractText(await response.json()))
  if (!generatedText) {
    return NextResponse.json({ error: 'Gemini did not return a prompt.' }, { status: 502 })
  }

  return NextResponse.json({
    model: PROMPT_GENERATOR_MODEL,
    prompt_text: generatedText,
  })
}
