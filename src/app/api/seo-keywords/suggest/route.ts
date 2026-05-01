import { NextRequest, NextResponse } from 'next/server'
import { isAdminEmail } from '@/lib/admin'
import { isBuiltinKeyEmailAuthorized } from '@/lib/builtin-key-access'
import { parseStoredGeminiSettings, readBuiltinGeminiApiKey } from '@/lib/gemini-settings'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'
import { PRODUCT_LANGUAGES } from '@/lib/types'
import { normalizeSeoKeywords, type SeoKeyword, type SeoKeywordType } from '@/lib/seo-keywords'

type KeywordPayload = {
  keywords?: Array<Partial<SeoKeyword> & { type?: SeoKeywordType }>
}

async function getTextGenerationApiKey(
  supabase: ReturnType<typeof getRequestSupabase>,
  userId: string,
  userEmail?: string | null
) {
  const { data: settings } = await supabase
    .from('system_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  const stored = parseStoredGeminiSettings(settings?.gemini_api_key_encrypted)
  const admin = isAdminEmail(userEmail)
  const emailAuthorized = await isBuiltinKeyEmailAuthorized(userEmail)
  const passwordVerified = Boolean(settings?.use_builtin_key && settings?.builtin_key_password_verified)

  if (admin || emailAuthorized || passwordVerified) {
    return readBuiltinGeminiApiKey() || stored.apiKey || null
  }

  return stored.apiKey || null
}

async function generateKeywords(apiKey: string, prompt: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Gemini keyword API error ${response.status}: ${await response.text()}`)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini did not return keyword JSON')

  const parsed = JSON.parse(text) as KeywordPayload
  return normalizeSeoKeywords(parsed.keywords || [])
}

export async function POST(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const categoryId = String(body.category_id || '').trim()
  const languageCode = String(body.language_code || 'en').trim()
  const seedText = String(body.seed_text || '').trim()

  if (!categoryId) {
    return NextResponse.json({ error: 'category_id is required' }, { status: 400 })
  }

  const [{ data: category }, { data: rules }] = await Promise.all([
    supabase
      .from('categories')
      .select('id,name_zh,slug')
      .eq('id', categoryId)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('rule_templates')
      .select('content')
      .eq('user_id', user.id)
      .eq('active', true),
  ])

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  const apiKey = await getTextGenerationApiKey(supabase, user.id, user.email)
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API key is required before keyword suggestion.' }, { status: 400 })
  }

  const languageLabel = PRODUCT_LANGUAGES.find((language) => language.code === languageCode)?.label || languageCode
  const ruleText = (rules || []).map((rule) => rule.content).join('\n\n').slice(0, 6000)
  const prompt = [
    'You are an ecommerce marketplace SEO keyword strategist for Shopee/TikTok style listings.',
    'Generate a practical keyword bank for one product category and one target language.',
    '',
    `Category Chinese name: ${category.name_zh}`,
    `Category slug: ${category.slug}`,
    `Target language: ${languageLabel} (${languageCode})`,
    seedText ? `User seed/product examples: ${seedText}` : 'User seed/product examples: none',
    '',
    'Rules and compliance constraints:',
    ruleText || 'Avoid misleading, medical, exaggerated, competitor, off-platform, and unsupported claims.',
    '',
    'Return ONLY JSON with this shape:',
    '{"keywords":[{"keyword":"...","type":"core|long_tail|attribute|scene|audience|forbidden","priority":1-5,"note":"short reason"}]}',
    '',
    'Requirements:',
    '- Create 4 core keywords, 8 long_tail keywords, 8 attribute keywords, 6 scene keywords, 4 audience keywords, and 8 forbidden keywords.',
    '- Use the target language for customer-facing keywords when possible.',
    '- Keep keywords realistic for marketplace search and faithful to the category.',
    '- Forbidden keywords should include risky absolute, medical, counterfeit, off-platform, and unsupported claim wording relevant to this category.',
    '- Do not include competitor marketplace names as positive keywords.',
  ].join('\n')

  try {
    const keywords = await generateKeywords(apiKey, prompt)
    return NextResponse.json({ keywords })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Keyword suggestion failed' },
      { status: 500 }
    )
  }
}
