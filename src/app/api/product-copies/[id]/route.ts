import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
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
    .eq('workspace_key', workspaceKey)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Product copy not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const staffNote = String(body.staff_note || '').slice(0, 2000)

  const { data, error } = await supabase
    .from('product_copies')
    .update({ staff_note: staffNote })
    .eq('id', id)
    .eq('workspace_key', workspaceKey)
    .select('*')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Product copy not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}
