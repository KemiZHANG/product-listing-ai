import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'

function normalizeLanguages(value: unknown) {
  if (!Array.isArray(value)) return ['en']
  const languages = value.map((item) => String(item).trim()).filter(Boolean)
  return languages.length > 0 ? languages : ['en']
}

function normalizeAttributes(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, string>
}

export async function GET(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim()
  const categoryId = searchParams.get('category_id')?.trim()
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 80), 1), 200)

  let query = supabase
    .from('products')
    .select(`
      *,
      categories(id,name_zh,slug,icon),
      images:product_images(*)
    `)
    .eq('user_id', user.id)
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}

export async function POST(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
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
      .eq('user_id', user.id)
      .maybeSingle()

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      user_id: user.id,
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
