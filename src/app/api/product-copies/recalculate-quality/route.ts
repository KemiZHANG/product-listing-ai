import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'
import { analyzeProductCopyQuality } from '@/lib/product-quality'
import { isSeoKeywordRule, parseSeoKeywordBank, type SeoKeywordBank } from '@/lib/seo-keywords'
import {
  SHOPEE_CATEGORY_ATTRIBUTE_KEY,
  decodeShopeeCategorySelection,
  formatShopeeCategorySelection,
} from '@/lib/shopee-categories'

type CopyRow = {
  id: string
  generated_title: string
  generated_description: string
  language_code: string
  products?: {
    category_id: string | null
    attributes: Record<string, string> | null
  } | null
  product_copy_images?: Array<{
    status: string
    pending_storage_path?: string | null
  }>
}

export async function POST(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const copyIds = Array.isArray(body.copy_ids)
    ? body.copy_ids.map((id: unknown) => String(id)).filter(Boolean)
    : []

  const { data: rules } = await supabase
    .from('rule_templates')
    .select('name,content,active')
    .eq('workspace_key', workspaceKey)
    .eq('active', true)

  const seoKeywordBanks = (rules || [])
    .filter((rule) => isSeoKeywordRule(rule.name, rule.content))
    .map((rule) => parseSeoKeywordBank(rule.content))
    .filter(Boolean) as SeoKeywordBank[]

  let query = supabase
    .from('product_copies')
    .select(`
      id,
      generated_title,
      generated_description,
      language_code,
      products(category_id, attributes),
      product_copy_images(status, pending_storage_path)
    `)
    .eq('workspace_key', workspaceKey)

  if (copyIds.length > 0) query = query.in('id', copyIds)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const copies = (data || []) as unknown as CopyRow[]
  for (const copy of copies) {
    const images = copy.product_copy_images || []
    const completed = images.filter((image) => image.status === 'completed' || Boolean(image.pending_storage_path)).length
    const product = copy.products
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
      completedImageCount: completed,
      totalImageCount: images.length,
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

  return NextResponse.json({ updated: copies.length })
}
