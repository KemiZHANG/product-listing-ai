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
  const allowedListingStatuses = new Set(['not_listed', 'listed', 'needs_edit', 'paused', 'done'])
  const patch: Record<string, unknown> = {}

  if ('staff_note' in body) patch.staff_note = String(body.staff_note || '').slice(0, 2000)
  if ('operator_note' in body) patch.operator_note = String(body.operator_note || '').slice(0, 3000)
  if ('store_name' in body) patch.store_name = String(body.store_name || '').slice(0, 160)
  if ('listing_status' in body && allowedListingStatuses.has(String(body.listing_status))) {
    patch.listing_status = String(body.listing_status)
    patch.operator_email = user.email || null
    if (body.listing_status === 'listed' && !body.listed_at) {
      patch.listed_at = new Date().toISOString()
    }
  }
  if ('listed_at' in body) {
    patch.listed_at = body.listed_at ? new Date(String(body.listed_at)).toISOString() : null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No supported fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('product_copies')
    .update(patch)
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
