import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}
