import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'
import {
  SHOPEE_CATEGORY_ATTRIBUTE_KEY,
  decodeShopeeCategorySelection,
  formatShopeeCategorySelection,
} from '@/lib/shopee-categories'
import { sanitizeListingText } from '@/lib/listing-text'

type ExportCopy = {
  id: string
  sku: string
  language_label: string
  copy_index: number
  generated_title: string
  generated_description: string
  listing_status?: string | null
  store_name?: string | null
  listed_at?: string | null
  operator_note?: string | null
  staff_note?: string | null
  created_at: string
  products?: {
    attributes?: Record<string, string> | null
    categories?: { name_zh?: string | null } | null
  } | null
  product_copy_images?: Array<{
    prompt_number: number
    output_storage_path: string | null
  }>
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function csvRow(values: unknown[]) {
  return values.map(csvCell).join(',')
}

export async function GET(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const ids = (searchParams.get('ids') || '').split(',').map((id) => id.trim()).filter(Boolean)
  const sku = searchParams.get('sku')?.trim()
  const categoryId = searchParams.get('category_id')?.trim()
  const language = searchParams.get('language')?.trim()
  const date = searchParams.get('date')?.trim()
  const listingStatus = searchParams.get('listing_status')?.trim()

  let query = supabase
    .from('product_copies')
    .select(`
      id,
      sku,
      language_label,
      copy_index,
      generated_title,
      generated_description,
      listing_status,
      store_name,
      listed_at,
      operator_note,
      staff_note,
      created_at,
      products!inner(attributes,categories(name_zh),category_id),
      product_copy_images(prompt_number,output_storage_path)
    `)
    .eq('workspace_key', workspaceKey)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (ids.length > 0) query = query.in('id', ids)
  if (sku) query = query.ilike('sku', `%${sku}%`)
  if (language) query = query.eq('language_code', language)
  if (categoryId) query = query.eq('products.category_id', categoryId)
  if (date) query = query.gte('created_at', `${date}T00:00:00`).lt('created_at', `${date}T23:59:59`)
  if (listingStatus && !['all', 'image_failed'].includes(listingStatus)) query = query.eq('listing_status', listingStatus)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data || []) as unknown as ExportCopy[]
  const storagePaths = Array.from(new Set(rows.flatMap((copy) =>
    (copy.product_copy_images || []).map((image) => image.output_storage_path).filter(Boolean) as string[]
  )))
  const signedPairs = await Promise.all(storagePaths.map(async (path) => {
    const { data: signed } = await supabase.storage.from('outputs').createSignedUrl(path, 60 * 60 * 24 * 7)
    return [path, signed?.signedUrl || ''] as const
  }))
  const signedMap = Object.fromEntries(signedPairs)

  const header = [
    'SKU',
    '语言',
    '副本序号',
    '商品类目',
    'Shopee 类目',
    '标题',
    '描述',
    '上品状态',
    '店铺名',
    '上品时间',
    '员工备注',
    '图片链接',
    '创建时间',
  ]

  const body = rows.map((copy) => {
    const shopeeCategory = formatShopeeCategorySelection(
      decodeShopeeCategorySelection(copy.products?.attributes?.[SHOPEE_CATEGORY_ATTRIBUTE_KEY])
    )
    const imageLinks = (copy.product_copy_images || [])
      .slice()
      .sort((a, b) => a.prompt_number - b.prompt_number)
      .map((image) => image.output_storage_path ? signedMap[image.output_storage_path] : '')
      .filter(Boolean)
      .join('\n')

    return csvRow([
      copy.sku,
      copy.language_label,
      copy.copy_index,
      copy.products?.categories?.name_zh || '',
      shopeeCategory,
      sanitizeListingText(copy.generated_title),
      sanitizeListingText(copy.generated_description),
      copy.listing_status || 'not_listed',
      copy.store_name || '',
      copy.listed_at || '',
      copy.operator_note || copy.staff_note || '',
      imageLinks,
      copy.created_at,
    ])
  })

  const csv = `\uFEFF${csvRow(header)}\n${body.join('\n')}`
  const filename = `product-copies-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
