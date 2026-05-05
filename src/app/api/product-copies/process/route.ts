import { NextRequest, NextResponse } from 'next/server'
import { isAdminEmail } from '@/lib/admin'
import { isBuiltinKeyEmailAuthorized } from '@/lib/builtin-key-access'
import { parseStoredGeminiSettings, readBuiltinGeminiApiKey } from '@/lib/gemini-settings'
import { getRequestSupabase } from '@/lib/supabase'
import { AI_ACCESS_ERROR, getGenerationAccess } from '@/lib/generation-access'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'
import { analyzeProductCopyQuality } from '@/lib/product-quality'
import { isSeoKeywordRule, parseSeoKeywordBank, type SeoKeywordBank } from '@/lib/seo-keywords'
import {
  SHOPEE_CATEGORY_ATTRIBUTE_KEY,
  decodeShopeeCategorySelection,
  formatShopeeCategorySelection,
} from '@/lib/shopee-categories'

export const maxDuration = 300

type CopyRecord = {
  id: string
  product_id: string
  generated_title: string
  generated_description: string
  language_code: string
  products?: {
    category_id: string | null
    attributes: Record<string, string> | null
  } | Array<{
    category_id: string | null
    attributes: Record<string, string> | null
  }> | null
}

type CopyImageRecord = {
  id: string
  copy_id: string
  prompt_number: number
  prompt_text: string
  output_storage_path: string | null
  pending_regeneration_note: string | null
}

type ProductImageRecord = {
  product_id: string
  display_name: string
  storage_path: string
}

async function getImageApiKey(
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

function getMimeType(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() || 'jpg'
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  }
  return mimeMap[ext] || 'image/jpeg'
}

function extractGeneratedImageBase64(response: unknown): string | null {
  const parts = (response as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inline_data?: { data?: string }
          inlineData?: { data?: string }
        }>
      }
    }>
  })?.candidates?.[0]?.content?.parts

  if (!parts) return null
  for (const part of parts) {
    const data = part.inline_data?.data || part.inlineData?.data
    if (data) return data
  }
  return null
}

async function generateImage(apiKey: string, promptText: string, references: Array<{ mimeType: string; base64: string }>) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            ...references.map((reference) => ({
              inline_data: {
                mime_type: reference.mimeType,
                data: reference.base64,
              },
            })),
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Gemini image API error ${response.status}: ${await response.text()}`)
  }

  const base64 = extractGeneratedImageBase64(await response.json())
  if (!base64) throw new Error('Gemini did not return an image')
  return base64
}

export async function POST(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await getGenerationAccess(supabase, user.id, user.email)
  if (!access.allowed) {
    return NextResponse.json({ error: AI_ACCESS_ERROR, code: 'AI_ACCESS_REQUIRED' }, { status: 403 })
  }

  const apiKey = await getImageApiKey(supabase, user.id, user.email)
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API key is required before image generation.' }, { status: 400 })
  }

  const body = await request.json()
  const copyIds = Array.isArray(body.copy_ids)
    ? body.copy_ids.map((id: unknown) => String(id)).filter(Boolean)
    : []
  if (copyIds.length === 0) {
    return NextResponse.json({ error: 'copy_ids is required' }, { status: 400 })
  }

  const { data: copies } = await supabase
    .from('product_copies')
    .select('id, product_id, generated_title, generated_description, language_code, products(category_id, attributes)')
    .eq('workspace_key', workspaceKey)
    .in('id', copyIds)

  const copyRecords = (copies || []) as unknown as CopyRecord[]
  const productIds = Array.from(new Set(copyRecords.map((copy) => copy.product_id)))
  const { data: rules } = await supabase
    .from('rule_templates')
    .select('name,content,active')
    .eq('workspace_key', workspaceKey)
    .eq('active', true)

  const seoKeywordBanks = (rules || [])
    .filter((rule) => isSeoKeywordRule(rule.name, rule.content))
    .map((rule) => parseSeoKeywordBank(rule.content))
    .filter(Boolean) as SeoKeywordBank[]

  const [{ data: copyImages }, { data: productImages }] = await Promise.all([
    supabase
      .from('product_copy_images')
      .select('id, copy_id, prompt_number, prompt_text, output_storage_path, pending_regeneration_note')
      .in('copy_id', copyRecords.map((copy) => copy.id))
      .eq('status', 'queued')
      .order('prompt_number', { ascending: true }),
    supabase
      .from('product_images')
      .select('product_id, display_name, storage_path')
      .in('product_id', productIds),
  ])

  const imagesByProduct = new Map<string, ProductImageRecord[]>()
  for (const image of (productImages || []) as ProductImageRecord[]) {
    const list = imagesByProduct.get(image.product_id) || []
    list.push(image)
    imagesByProduct.set(image.product_id, list)
  }

  let completed = 0
  let failed = 0
  const failedCopyIds = new Set<string>()
  const failedProductIds = new Set<string>()
  for (const copyImage of (copyImages || []) as CopyImageRecord[]) {
    const copy = copyRecords.find((item) => item.id === copyImage.copy_id)
    if (!copy) continue

    const sourceImages = imagesByProduct.get(copy.product_id) || []
    if (sourceImages.length === 0) {
      failed += 1
      failedCopyIds.add(copyImage.copy_id)
      failedProductIds.add(copy.product_id)
      await supabase
        .from('product_copy_images')
        .update({ status: 'failed', error_message: '商品没有原始参考图。' })
        .eq('id', copyImage.id)
      continue
    }

    try {
      await supabase.from('product_copy_images').update({ status: 'generating' }).eq('id', copyImage.id)
      const references = []
      for (const image of sourceImages) {
        const { data: fileData, error } = await supabase.storage.from('images').download(image.storage_path)
        if (error || !fileData) throw new Error(`参考图下载失败: ${image.display_name}`)
        references.push({
          mimeType: getMimeType(image.storage_path),
          base64: Buffer.from(await fileData.arrayBuffer()).toString('base64'),
        })
      }

      const regenerationInstruction = copyImage.pending_regeneration_note?.trim()
      const promptText = regenerationInstruction
        ? [
            copyImage.prompt_text,
            '',
            '【本次单张重生要求】',
            regenerationInstruction,
            '请在不改变商品事实、包装、Logo、颜色和规格的前提下改进画面。',
          ].join('\n')
        : copyImage.prompt_text
      const generatedBase64 = await generateImage(apiKey, promptText, references)
      const outputBuffer = Buffer.from(generatedBase64, 'base64')
      const outputFilename = `P${copyImage.prompt_number}_${Date.now()}.png`
      const outputPath = `${user.id}/product-copies/${copyImage.copy_id}/${outputFilename}`

      const { error: uploadError } = await supabase.storage
        .from('outputs')
        .upload(outputPath, outputBuffer, {
          contentType: 'image/png',
          upsert: false,
        })

      if (uploadError) throw new Error(uploadError.message)

      const hasCurrentImage = Boolean(copyImage.output_storage_path)
      await supabase
        .from('product_copy_images')
        .update(hasCurrentImage
          ? {
              status: 'needs_review',
              error_message: null,
              pending_storage_path: outputPath,
              pending_filename: outputFilename,
            }
          : {
              status: 'completed',
              error_message: null,
              output_storage_path: outputPath,
              output_filename: outputFilename,
              pending_storage_path: null,
              pending_filename: null,
              pending_regeneration_note: '',
            })
        .eq('id', copyImage.id)
      completed += 1
    } catch (err) {
      failed += 1
      failedCopyIds.add(copyImage.copy_id)
      failedProductIds.add(copy.product_id)
      await supabase
        .from('product_copy_images')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : 'Unknown image generation error',
        })
        .eq('id', copyImage.id)
    }
  }

  const failedCopyIdList = Array.from(failedCopyIds)
  const completedCopyIds = copyRecords
    .map((copy) => copy.id)
    .filter((copyId) => !failedCopyIds.has(copyId))

  const { data: imageStatusRows } = await supabase
    .from('product_copy_images')
    .select('copy_id,status')
    .in('copy_id', copyRecords.map((copy) => copy.id))

  const imageStats = new Map<string, { total: number; completed: number }>()
  for (const row of (imageStatusRows || []) as Array<{ copy_id: string; status: string }>) {
    const stats = imageStats.get(row.copy_id) || { total: 0, completed: 0 }
    stats.total += 1
    if (row.status === 'completed' || row.status === 'needs_review') stats.completed += 1
    imageStats.set(row.copy_id, stats)
  }

  for (const copy of copyRecords) {
    const product = Array.isArray(copy.products) ? copy.products[0] : copy.products
    const stats = imageStats.get(copy.id) || { total: 0, completed: 0 }
    const seoBank = seoKeywordBanks.find((bank) =>
      bank.category_id === product?.category_id &&
      bank.language_code === copy.language_code
    )
    const shopeeCategory = formatShopeeCategorySelection(
      decodeShopeeCategorySelection(product?.attributes?.[SHOPEE_CATEGORY_ATTRIBUTE_KEY])
    )
    const qualityReport = analyzeProductCopyQuality({
      title: copy.generated_title,
      description: copy.generated_description,
      seoBank,
      completedImageCount: stats.completed,
      totalImageCount: stats.total,
      shopeeCategory,
    })

    await supabase
      .from('product_copies')
      .update({
        seo_score: qualityReport.seo.score,
        quality_status: qualityReport.status,
        quality_report: qualityReport,
      })
      .eq('id', copy.id)
  }

  if (completedCopyIds.length > 0) {
    await supabase
      .from('product_copies')
      .update({ status: 'completed', error_message: null })
      .in('id', completedCopyIds)
  }

  if (failedCopyIdList.length > 0) {
    await supabase
      .from('product_copies')
      .update({ status: 'needs_review' })
      .in('id', failedCopyIdList)
  }

  const successfulProductIds = productIds.filter((productId) => !failedProductIds.has(productId))
  if (successfulProductIds.length > 0) {
    await supabase
      .from('products')
      .update({ status: 'completed', error_message: null })
      .in('id', successfulProductIds)
  }

  const failedProductIdList = Array.from(failedProductIds)
  if (failedProductIdList.length > 0) {
    await supabase
      .from('products')
      .update({ status: 'needs_review', error_message: '部分副本或图片生成失败，请进入 Product Outputs 查看。' })
      .in('id', failedProductIdList)
  }

  return NextResponse.json({ completed, failed })
}
