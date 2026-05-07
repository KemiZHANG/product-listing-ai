import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'
import { logServerEvent } from '@/lib/observability'

function normalizeLanguages(value: unknown) {
  if (!Array.isArray(value)) return ['en']
  const languages = value.map((item) => String(item).trim()).filter(Boolean)
  return languages.length > 0 ? languages : ['en']
}

function normalizeAttributes(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, string>
}

function countCopiesByProduct(copies: Array<{ product_id: string }>) {
  return copies.reduce<Record<string, number>>((counts, copy) => {
    counts[copy.product_id] = (counts[copy.product_id] || 0) + 1
    return counts
  }, {})
}

export async function GET(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim()
  const categoryId = searchParams.get('category_id')?.trim()
  const statusFilter = searchParams.get('status_filter')?.trim()
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 24), 1), 100)

  let query = supabase
    .from('products')
    .select(`
      *,
      categories(id,name_zh,slug,icon),
      images:product_images(*)
    `)
    .eq('workspace_key', workspaceKey)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (categoryId) {
    query = query.eq('category_id', categoryId)
  }

  if (search) {
    query = query.or(`sku.ilike.%${search}%,source_title.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) {
    logServerEvent('error', 'products.load_failed', {
      workspaceKey,
      search,
      categoryId,
      statusFilter,
      page,
      limit,
      message: error.message,
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const products = data || []
  const productIds = products.map((product) => product.id)
  let copyCounts: Record<string, number> = {}

  if (productIds.length > 0) {
    const { data: copies } = await supabase
      .from('product_copies')
      .select('product_id')
      .eq('workspace_key', workspaceKey)
      .in('product_id', productIds)
    copyCounts = countCopiesByProduct(copies || [])
  }

  const enrichedProducts = products.map((product) => ({
    ...product,
    copy_count_generated: copyCounts[product.id] || 0,
  }))

  const filteredProducts = enrichedProducts.filter((product) => {
    if (!statusFilter || statusFilter === 'all') return true

    const sourceImageCount = product.images?.length || 0
    if (statusFilter === 'missing_images') return sourceImageCount === 0
    if (statusFilter === 'generated') return (product.copy_count_generated || 0) > 0
    if (statusFilter === 'pending') return sourceImageCount > 0 && !(product.copy_count_generated || 0)
    return true
  })

  const total = filteredProducts.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * limit

  return NextResponse.json({
    data: filteredProducts.slice(start, start + limit),
    total,
    totalPages,
    page: safePage,
  })
}

export async function POST(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const sku = String(body.sku || '').trim()
  if (!sku) {
    return NextResponse.json({ error: 'sku is required' }, { status: 400 })
  }

  const categoryId = body.category_id ? String(body.category_id) : null
  if (categoryId) {
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .eq('workspace_key', workspaceKey)
      .maybeSingle()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      user_id: user.id,
      workspace_key: workspaceKey,
      category_id: categoryId,
      sku,
      source_title: String(body.source_title || ''),
      source_description: String(body.source_description || ''),
      selling_points: String(body.selling_points || ''),
      copy_count: Number(body.copy_count || 1),
      languages: normalizeLanguages(body.languages),
      attributes: normalizeAttributes(body.attributes),
      status: body.status || 'draft',
    })
    .select(`
      *,
      categories(id,name_zh,slug,icon),
      images:product_images(*)
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
