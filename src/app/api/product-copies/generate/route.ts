import { NextRequest, NextResponse } from 'next/server'
import { getRequestSupabase } from '@/lib/supabase'
import { isAdminEmail } from '@/lib/admin'
import { isBuiltinKeyEmailAuthorized } from '@/lib/builtin-key-access'
import { buildProductImagePrompt, buildTitleDescriptionPrompt, defaultDetailPrompt, getLanguageLabel } from '@/lib/product-generation'
import { parseStoredGeminiSettings, readBuiltinGeminiApiKey } from '@/lib/gemini-settings'
import { COPY_PLAN_ATTRIBUTE_KEY, PRODUCT_LANGUAGES } from '@/lib/types'
import { formatSeoKeywordPrompt, isSeoKeywordRule, parseSeoKeywordBank, type SeoKeywordBank } from '@/lib/seo-keywords'
import { AI_ACCESS_ERROR, getGenerationAccess } from '@/lib/generation-access'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

const ROLE_ORDER = ['main_1', 'main_2', 'model_scene_1', 'model_scene_2', 'detail_1', 'detail_2']

function promptRole(number: number) {
  return ROLE_ORDER[number - 1] || 'custom'
}

function copyIndexes(count: number) {
  return Array.from({ length: Math.max(1, Math.min(count || 1, 20)) }, (_, index) => index + 1)
}

function parseLanguageCopyPlan(product: {
  copy_count?: number | null
  languages?: string[] | null
  attributes?: Record<string, unknown> | null
}) {
  const allowedCodes = new Set(PRODUCT_LANGUAGES.map((language) => language.code))
  const rawPlan = product.attributes?.[COPY_PLAN_ATTRIBUTE_KEY]
  let parsed: Record<string, unknown> | null = null

  if (typeof rawPlan === 'string') {
    try {
      parsed = JSON.parse(rawPlan)
    } catch {
      parsed = null
    }
  } else if (rawPlan && typeof rawPlan === 'object' && !Array.isArray(rawPlan)) {
    parsed = rawPlan as Record<string, unknown>
  }

  if (parsed) {
    const plan = PRODUCT_LANGUAGES
      .map((language) => ({
        languageCode: language.code,
        count: Math.min(Math.max(Math.floor(Number(parsed?.[language.code] || 0)), 0), 20),
      }))
      .filter((item) => item.count > 0)

    if (plan.length > 0) return plan
  }

  const fallbackLanguages = Array.isArray(product.languages)
    ? product.languages.filter((code) => allowedCodes.has(code))
    : []
  const languages = fallbackLanguages.length > 0 ? fallbackLanguages : ['en']
  const count = Math.max(1, Math.min(Number(product.copy_count || 1), 20))

  return languages.map((languageCode) => ({ languageCode, count }))
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

async function generateTitleDescription(apiKey: string | null, prompt: string) {
  if (!apiKey) return null

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

  if (!response.ok) return null
  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) return null

  try {
    const parsed = JSON.parse(text)
    return {
      title: String(parsed.title || ''),
      description: String(parsed.description || ''),
    }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const productIds = Array.isArray(body.product_ids)
    ? body.product_ids.map((id: unknown) => String(id)).filter(Boolean)
    : []

  if (productIds.length === 0) {
    return NextResponse.json({ error: 'product_ids is required' }, { status: 400 })
  }

  const access = await getGenerationAccess(supabase, user.id, user.email)
  if (!access.allowed) {
    return NextResponse.json({ error: AI_ACCESS_ERROR, code: 'AI_ACCESS_REQUIRED' }, { status: 403 })
  }

  const { data: rules } = await supabase
    .from('rule_templates')
    .select('name,content,active')
    .eq('workspace_key', workspaceKey)
    .eq('active', true)

  const ruleText = (rules || [])
    .filter((rule) => !isSeoKeywordRule(rule.name, rule.content))
    .map((rule) => rule.content)
    .filter(Boolean)
    .join('\n\n')
  const seoKeywordBanks = (rules || [])
    .map((rule) => parseSeoKeywordBank(rule.content))
    .filter(Boolean) as SeoKeywordBank[]
  const textApiKey = await getTextGenerationApiKey(supabase, user.id, user.email)

  const { data: products, error: productError } = await supabase
    .from('products')
    .select('*, categories(id,name_zh,slug,icon), images:product_images(*)')
    .eq('workspace_key', workspaceKey)
    .in('id', productIds)

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 })
  }

  if (!products || products.length === 0) {
    return NextResponse.json({ error: 'No products found' }, { status: 404 })
  }

  const createdCopyIds: string[] = []

  for (const product of products) {
    if (!product.category_id) {
      await supabase
        .from('products')
        .update({ status: 'needs_review', error_message: '请选择商品类目后再生成。' })
        .eq('id', product.id)
      continue
    }

    const { data: prompts } = await supabase
      .from('category_prompts')
      .select('prompt_number, prompt_role, prompt_text')
      .eq('category_id', product.category_id)
      .order('prompt_number', { ascending: true })

    const categoryName = product.categories?.name_zh || '商品'
    const promptTemplates = ROLE_ORDER.map((role, index) => {
      const number = index + 1
      const existing = (prompts || []).find((prompt) => prompt.prompt_number === number)
      if (existing?.prompt_text) {
        return {
          prompt_number: number,
          prompt_role: existing.prompt_role || role,
          prompt_text: existing.prompt_text,
        }
      }

      return {
        prompt_number: number,
        prompt_role: role,
        prompt_text: role === 'detail_1'
          ? defaultDetailPrompt(categoryName, 1)
          : defaultDetailPrompt(categoryName, 2),
      }
    })

    await supabase.from('product_copies').delete().eq('product_id', product.id)

    const copyPlan = parseLanguageCopyPlan(product)
    for (const { languageCode, count } of copyPlan) {
      const languageLabel = getLanguageLabel(languageCode)
      for (const copyIndex of copyIndexes(count)) {
        const seoKeywordText = formatSeoKeywordPrompt(
          seoKeywordBanks.find((bank) =>
            bank.category_id === product.category_id &&
            bank.language_code === languageCode
          )
        )
        const textResult = await generateTitleDescription(textApiKey, buildTitleDescriptionPrompt({
          sku: product.sku,
          sourceTitle: product.source_title,
          sourceDescription: product.source_description,
          sellingPoints: product.selling_points,
          categoryName,
          attributes: product.attributes || {},
          languageLabel,
          copyIndex,
          ruleText,
          seoKeywordText,
        }))

        const { data: copy, error: copyError } = await supabase
          .from('product_copies')
          .insert({
            product_id: product.id,
            user_id: user.id,
            workspace_key: workspaceKey,
            sku: product.sku,
            copy_index: copyIndex,
            language_code: languageCode,
            language_label: languageLabel,
            generated_title: textResult?.title || product.source_title || '',
            generated_description: textResult?.description || product.source_description || '',
            status: 'queued',
          })
          .select()
          .single()

        if (copyError || !copy) {
          continue
        }

        createdCopyIds.push(copy.id)
        const images = promptTemplates.map((prompt) => ({
          copy_id: copy.id,
          prompt_number: prompt.prompt_number,
          prompt_role: prompt.prompt_role || promptRole(prompt.prompt_number),
          prompt_text: buildProductImagePrompt(prompt.prompt_text, {
            sku: product.sku,
            sourceTitle: product.source_title,
            sourceDescription: product.source_description,
            sellingPoints: product.selling_points,
            categoryName,
            attributes: product.attributes || {},
            languageLabel,
            copyIndex,
            ruleText,
            seoKeywordText,
          }),
          status: 'queued',
        }))

        await supabase.from('product_copy_images').insert(images)
      }
    }

    await supabase
      .from('products')
      .update({ status: 'queued', error_message: null })
      .eq('id', product.id)
  }

  if (createdCopyIds.length > 0) {
    const processUrl = new URL('/api/product-copies/process', request.url)
    fetch(processUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: request.headers.get('authorization') || '',
      },
      body: JSON.stringify({ copy_ids: createdCopyIds }),
    }).catch(() => {
      // Copies remain queued and can be processed later.
    })
  }

  return NextResponse.json({ created: createdCopyIds.length, copy_ids: createdCopyIds }, { status: 201 })
}
