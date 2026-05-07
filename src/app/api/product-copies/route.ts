import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'
import { logServerEvent } from '@/lib/observability'
import { decodeShopeeCategorySelection, formatShopeeCategorySelection } from '@/lib/shopee-categories'
import { SHOPEE_CATEGORY_ATTRIBUTE_KEY } from '@/lib/shopee-categories'

type ProductCopyImageRow = {
  status?: string | null
}

type ProductCopyRow = {
  id: string
  listing_status?: string | null
  product_copy_images?: ProductCopyImageRow[]
  products?: {
    attributes?: Record<string, string> | null
  } | null
}

export async function GET(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const sku = searchParams.get('sku')?.trim()
  const categoryId = searchParams.get('category_id')?.trim()
  const language = searchParams.get('language')?.trim()
  const date = searchParams.get('date')?.trim()
  const listingFilter = searchParams.get('listing_filter')?.trim()
  const shopeeSearch = searchParams.get('shopee_search')?.trim().toLowerCase()
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 12), 1), 100)

  let query = supabase
    .from('product_copies')
    .select(`
      *,
      products!inner(
        id,
        sku,
        category_id,
        source_title,
        source_description,
        attributes,
        categories(id,name_zh,slug,icon)
      ),
      product_copy_images(*)
    `)
    .eq('workspace_key', workspaceKey)
    .order('created_at', { ascending: false })

  if (sku) {
    query = query.ilike('sku', `%${sku}%`)
  }
  if (language) {
    query = query.eq('language_code', language)
  }
  if (categoryId) {
    query = query.eq('products.category_id', categoryId)
  }
  if (date) {
    query = query.gte('created_at', `${date}T00:00:00`).lt('created_at', `${date}T23:59:59`)
  }

  const { data, error } = await query

  if (error) {
    logServerEvent('error', 'product_copies.load_failed', {
      workspaceKey,
      sku,
      categoryId,
      language,
      date,
      listingFilter,
      page,
      limit,
      message: error.message,
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = ((data || []) as ProductCopyRow[]).filter((copy) => {
    const images = copy.product_copy_images || []
    const imageFailed = images.some((image) => image.status === 'failed')
    const normalizedListingStatus = copy.listing_status || 'not_listed'

    if (listingFilter && listingFilter !== 'all') {
      if (listingFilter === 'image_failed') {
        if (!imageFailed) return false
      } else if (normalizedListingStatus !== listingFilter) {
        return false
      }
    }

    if (shopeeSearch) {
      const shopeeCategory = formatShopeeCategorySelection(
        decodeShopeeCategorySelection(copy.products?.attributes?.[SHOPEE_CATEGORY_ATTRIBUTE_KEY])
      ).toLowerCase()

      if (!shopeeCategory.includes(shopeeSearch)) {
        return false
      }
    }

    return true
  })

  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * limit
  const pagedRows = rows.slice(start, start + limit)

  return NextResponse.json({
    data: pagedRows,
    total,
    totalPages,
    page: safePage,
    failedCopyIds: rows
      .filter((copy) => (copy.product_copy_images || []).some((image) => image.status === 'failed'))
      .map((copy) => copy.id),
  })
}
