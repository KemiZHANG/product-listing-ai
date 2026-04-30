import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'

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
    .from('product_copies')
    .select(`
      *,
      products!inner(
        id,
        sku,
        category_id,
        source_title,
        source_description,
        selling_points,
        attributes,
        categories(id,name_zh,slug,icon),
        images:product_images(*)
      ),
      product_copy_images(*)
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Product copy not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}
