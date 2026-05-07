import { NextRequest, NextResponse } from 'next/server'
import { logServerEvent } from '@/lib/observability'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

export async function PATCH(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const ids = Array.isArray(body.ids)
    ? body.ids.map((id: unknown) => String(id)).filter(Boolean)
    : []
  const allowedListingStatuses = new Set(['not_listed', 'listed', 'needs_edit', 'paused', 'done'])
  const patch: Record<string, unknown> = {}

  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids is required' }, { status: 400 })
  }

  if ('listing_status' in body && allowedListingStatuses.has(String(body.listing_status))) {
    patch.listing_status = String(body.listing_status)
    patch.operator_email = user.email || null
    if (body.listing_status === 'listed') {
      patch.listed_at = new Date().toISOString()
    }
  }
  if ('store_name' in body) {
    patch.store_name = String(body.store_name || '').trim().slice(0, 160)
  }
  if ('operator_note' in body) {
    patch.operator_note = String(body.operator_note || '').slice(0, 3000)
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No supported fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('product_copies')
    .update(patch)
    .eq('workspace_key', workspaceKey)
    .in('id', ids)
    .select('id')

  if (error) {
    logServerEvent('error', 'product_copies.batch_update_failed', {
      workspaceKey,
      idCount: ids.length,
      fields: Object.keys(patch),
      message: error.message,
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  logServerEvent('info', 'product_copies.batch_updated', {
    workspaceKey,
    idCount: data?.length || 0,
    fields: Object.keys(patch),
  })

  return NextResponse.json({ updated: data?.length || 0 })
}
