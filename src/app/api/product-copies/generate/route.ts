import { NextRequest, NextResponse } from 'next/server'
import { getRequestSupabase } from '@/lib/supabase'
import { isAdminEmail } from '@/lib/admin'
import { isBuiltinKeyEmailAuthorized } from '@/lib/builtin-key-access'
import {
  buildProductImagePrompt,
  buildTitleDescriptionPrompt,
  defaultDetailPrompt,
  defaultMainPrompt,
  defaultScenePrompt,
  getLanguageLabel,
} from '@/lib/product-generation'
import { parseStoredGeminiSettings, readBuiltinGeminiApiKey } from '@/lib/gemini-settings'
import {
  COPY_IMAGE_PLAN_ATTRIBUTE_KEY,
  COPY_PLAN_ATTRIBUTE_KEY,
  DEFAULT_PRODUCT_IMAGE_ROLES,
  PRODUCT_LANGUAGES,
  normalizeProductImageRole,
  type ProductImageRole,
} from '@/lib/types'
import { formatSeoKeywordPrompt, isSeoKeywordRule, parseSeoKeywordBank, type SeoKeywordBank } from '@/lib/seo-keywords'
import { AI_ACCESS_ERROR, getGenerationAccess } from '@/lib/generation-access'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'
import { analyzeProductCopyQuality } from '@/lib/product-quality'
import { softenComplianceRiskText } from '@/lib/listing-text'
import {
  SHOPEE_CATEGORY_ATTRIBUTE_KEY,
  decodeShopeeCategorySelection,
  formatShopeeCategorySelection,
} from '@/lib/shopee-categories'

const IMAGE_ROLE_ORDER: ProductImageRole[] = ['main', 'scene', 'detail']

function promptRole(number: number) {
  return IMAGE_ROLE_ORDER[number - 1] || 'custom'
}

function promptNumberForRole(role: ProductImageRole) {
  return IMAGE_ROLE_ORDER.indexOf(role) + 1
}

function normalizeImageRoles(value: unknown, fallbackToDefault = true): ProductImageRole[] {
  const roles = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  const normalized = roles
    .map((role) => normalizeProductImageRole(String(role)))
    .filter(Boolean) as ProductImageRole[]
  const deduped = IMAGE_ROLE_ORDER.filter((role) => normalized.includes(role))
  return deduped.length > 0 ? deduped : fallbackToDefault ? DEFAULT_PRODUCT_IMAGE_ROLES : []
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      return null
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return null
}

function copySlotKey(languageCode: string, copyIndex: number) {
  return `${languageCode}-${copyIndex}`
}

function buildCopySlotsFromCounts(counts: Record<string, number>) {
  return PRODUCT_LANGUAGES.flatMap((language) => {
    const count = Math.min(Math.max(Math.floor(Number(counts[language.code] || 0)), 0), 20)
    return Array.from({ length: count }, (_, index) => {
      const copyIndex = index + 1
      return {
        key: copySlotKey(language.code, copyIndex),
        languageCode: language.code,
        copyIndex,
        imageRoles: DEFAULT_PRODUCT_IMAGE_ROLES,
      }
    })
  })
}

function parseLanguageCopyPlan(product: {
  copy_count?: number | null
  languages?: string[] | null
  attributes?: Record<string, unknown> | null
}) {
  const allowedCodes = new Set(PRODUCT_LANGUAGES.map((language) => language.code))
  const rawPlan = product.attributes?.[COPY_PLAN_ATTRIBUTE_KEY]
  const parsed = parseJsonRecord(rawPlan)

  if (parsed) {
    const counts = Object.fromEntries(PRODUCT_LANGUAGES.map((language) => [
      language.code,
      Math.min(Math.max(Math.floor(Number(parsed?.[language.code] || 0)), 0), 20),
    ]))
    const slots = buildCopySlotsFromCounts(counts)
    if (slots.length > 0) {
      const imagePlan = parseJsonRecord(product.attributes?.[COPY_IMAGE_PLAN_ATTRIBUTE_KEY])
      const plannedCopies = Array.isArray(imagePlan?.copies) ? imagePlan.copies : []
      const imagePlanByKey = new Map<string, ProductImageRole[]>()
      for (const item of plannedCopies) {
        if (!item || typeof item !== 'object') continue
        const record = item as Record<string, unknown>
        const languageCode = String(record.languageCode || '')
        const copyIndex = Math.max(1, Math.floor(Number(record.copyIndex || 1)))
        if (!allowedCodes.has(languageCode)) continue
        imagePlanByKey.set(copySlotKey(languageCode, copyIndex), normalizeImageRoles(record.imageRoles, false))
      }

      return slots.map((slot) => ({
        ...slot,
        imageRoles: imagePlanByKey.get(slot.key) || slot.imageRoles,
      }))
    }
  }

  const fallbackLanguages = Array.isArray(product.languages)
    ? product.languages.filter((code) => allowedCodes.has(code))
    : []
  const languages = fallbackLanguages.length > 0 ? fallbackLanguages : ['en']
  const count = Math.max(1, Math.min(Number(product.copy_count || 1), 20))
  const counts = Object.fromEntries(PRODUCT_LANGUAGES.map((language) => [
    language.code,
    languages.includes(language.code) ? count : 0,
  ]))
  return buildCopySlotsFromCounts(counts)
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

function defaultPromptForRole(categoryName: string, role: ProductImageRole) {
  if (role === 'main') return defaultMainPrompt(categoryName, 1)
  if (role === 'scene') return defaultScenePrompt(categoryName, 1)
  return defaultDetailPrompt(categoryName, 1)
}

function legacyPromptNumberForRole(role: ProductImageRole) {
  if (role === 'main') return 1
  if (role === 'scene') return 3
  return 5
}

function findPromptForRole(
  prompts: Array<{ prompt_number: number; prompt_role?: string | null; prompt_text?: string | null }> | null | undefined,
  role: ProductImageRole
) {
  const normalizedMatch = (prompts || []).find((prompt) => normalizeProductImageRole(prompt.prompt_role) === role)
  if (normalizedMatch?.prompt_text) return normalizedMatch
  const legacyMatch = (prompts || []).find((prompt) => prompt.prompt_number === legacyPromptNumberForRole(role))
  if (legacyMatch?.prompt_text) return legacyMatch
  return null
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
  const imageCopyIds: string[] = []

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
    const promptTemplatesByRole = new Map(IMAGE_ROLE_ORDER.map((role) => {
      const number = promptNumberForRole(role)
      const existing = findPromptForRole(prompts, role)
      if (existing?.prompt_text) {
        return {
          prompt_number: number,
          prompt_role: role,
          prompt_text: existing.prompt_text,
        }
      }

      return {
        prompt_number: number,
        prompt_role: role,
        prompt_text: defaultPromptForRole(categoryName, role),
      }
    }).map((prompt) => [prompt.prompt_role, prompt]))

    await supabase.from('product_copies').delete().eq('product_id', product.id)

    const copyPlan = parseLanguageCopyPlan(product)
    let productHasImageJobs = false
    for (const { languageCode, copyIndex, imageRoles } of copyPlan) {
      const languageLabel = getLanguageLabel(languageCode)
      const hasSourceImages = (product.images || []).length > 0
      const selectedPromptTemplates = imageRoles
        .filter(() => hasSourceImages)
        .map((role) => promptTemplatesByRole.get(role))
        .filter(Boolean) as Array<{ prompt_number: number; prompt_role: ProductImageRole; prompt_text: string }>

        const seoKeywordBank = seoKeywordBanks.find((bank) =>
          bank.category_id === product.category_id &&
          bank.language_code === languageCode
        )
        const seoKeywordText = formatSeoKeywordPrompt(
          seoKeywordBank
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
        const generatedTitle = softenComplianceRiskText(textResult?.title || product.source_title || '')
        const generatedDescription = softenComplianceRiskText(textResult?.description || product.source_description || '')
        const shopeeCategory = formatShopeeCategorySelection(
          decodeShopeeCategorySelection(product.attributes?.[SHOPEE_CATEGORY_ATTRIBUTE_KEY])
        )
        const qualityReport = analyzeProductCopyQuality({
          title: generatedTitle,
          description: generatedDescription,
          seoBank: seoKeywordBank,
          completedImageCount: 0,
          totalImageCount: selectedPromptTemplates.length,
          shopeeCategory,
        })

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
            generated_title: generatedTitle,
            generated_description: generatedDescription,
            seo_score: qualityReport.seo.score,
            quality_status: qualityReport.status,
            quality_report: qualityReport,
            status: selectedPromptTemplates.length > 0 ? 'queued' : 'completed',
          })
          .select()
          .single()

        if (copyError || !copy) {
          continue
        }

        createdCopyIds.push(copy.id)
        if (selectedPromptTemplates.length > 0) {
          imageCopyIds.push(copy.id)
          productHasImageJobs = true
        }
        const images = selectedPromptTemplates.map((prompt) => ({
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
            promptRole: prompt.prompt_role || promptRole(prompt.prompt_number),
          }),
          status: 'queued',
        }))

        if (images.length > 0) {
          await supabase.from('product_copy_images').insert(images)
        }
    }

    await supabase
      .from('products')
      .update({ status: productHasImageJobs ? 'queued' : 'completed', error_message: null })
      .eq('id', product.id)
  }

  if (imageCopyIds.length > 0) {
    const processUrl = new URL('/api/product-copies/process', request.url)
    fetch(processUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: request.headers.get('authorization') || '',
      },
      body: JSON.stringify({ copy_ids: imageCopyIds }),
    }).catch(() => {
      // Copies remain queued and can be processed later.
    })
  }

  return NextResponse.json({ created: createdCopyIds.length, copy_ids: createdCopyIds }, { status: 201 })
}
