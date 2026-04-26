import { NextRequest, NextResponse } from 'next/server'
import { getBuiltinKeyAccess } from '@/lib/builtin-key-access'
import { readBuiltinGeminiApiKey } from '@/lib/gemini-settings'
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
  if (!access.allowed) {
    return NextResponse.json({
      error: 'AI prompt generation requires an authorized email or verified built-in API password.',
      code: 'BUILTIN_KEY_ACCESS_REQUIRED',
    }, { status: 403 })
  }

  const apiKey = readBuiltinGeminiApiKey()
  if (!apiKey) {
    return NextResponse.json({ error: 'Built-in Gemini API key is not configured.' }, { status: 500 })
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

  const userPrompt = buildPromptGeneratorUserPrompt({
    categoryName: category.name_zh,
    categorySlug: category.slug,
    productType: String(product_type || '').trim(),
    imageStyle: String(image_style || '').trim(),
    peopleMode: String(people_mode || '').trim(),
    displayMethod: String(display_method || '').trim(),
    extraInfo: String(extra_info || '').trim(),
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
