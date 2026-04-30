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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      categories(id,name_zh,slug,icon),
      images:product_images(*)
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()

  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
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
    .update({
      category_id: categoryId,
      sku: String(body.sku || '').trim(),
      source_title: String(body.source_title || ''),
      source_description: String(body.source_description || ''),
      selling_points: String(body.selling_points || ''),
      copy_count: Number(body.copy_count || 1),
      languages: normalizeLanguages(body.languages),
      attributes: normalizeAttributes(body.attributes),
      status: body.status || 'draft',
      error_message: null,
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select(`
      *,
      categories(id,name_zh,slug,icon),
      images:product_images(*)
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { data: images } = await supabase
    .from('product_images')
    .select('storage_path, products!inner(user_id)')
    .eq('product_id', id)
    .eq('products.user_id', user.id)

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const paths = (images || []).map((image) => image.storage_path).filter(Boolean)
  if (paths.length > 0) {
    await supabase.storage.from('images').remove(paths)
  }

  return NextResponse.json({ success: true })
}
