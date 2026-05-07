import { NextRequest, NextResponse } from 'next/server'
import { AI_ACCESS_ERROR, getGenerationAccess } from '@/lib/generation-access'
import { logServerEvent } from '@/lib/observability'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

type CopyImageRow = {
  id: string
  copy_id: string
  status: string
  product_copies?: { id: string; workspace_key: string } | null
}

export async function POST(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await getGenerationAccess(supabase, user.id, user.email)
  if (!access.allowed) {
    return NextResponse.json({ error: AI_ACCESS_ERROR, code: 'AI_ACCESS_REQUIRED' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const imageIds = Array.isArray(body.image_ids)
    ? body.image_ids.map((id: unknown) => String(id)).filter(Boolean)
    : []
  const copyIds = Array.isArray(body.copy_ids)
    ? body.copy_ids.map((id: unknown) => String(id)).filter(Boolean)
    : []
  const failedOnly = body.failed_only !== false
  const regenerationNote = String(body.regeneration_note || '').trim().slice(0, 500)

  if (imageIds.length === 0 && copyIds.length === 0) {
    return NextResponse.json({ error: 'image_ids or copy_ids is required' }, { status: 400 })
  }

  let query = supabase
    .from('product_copy_images')
    .select('id,copy_id,status,product_copies!inner(id,workspace_key)')
    .eq('product_copies.workspace_key', workspaceKey)

  if (imageIds.length > 0) {
    query = query.in('id', imageIds)
  }
  if (copyIds.length > 0) {
    query = query.in('copy_id', copyIds)
  }
  if (failedOnly) {
    query = query.in('status', ['failed', 'needs_review'])
  }

  const { data: rows, error: readError } = await query
  if (readError) {
    logServerEvent('error', 'product_copy_images.retry_read_failed', {
      workspaceKey,
      imageIdCount: imageIds.length,
      copyIdCount: copyIds.length,
      failedOnly,
      message: readError.message,
    })
    return NextResponse.json({ error: readError.message }, { status: 500 })
  }

  const imageRows = (rows || []) as unknown as CopyImageRow[]
  const retryImageIds = imageRows.map((row) => row.id)
  const retryCopyIds = Array.from(new Set(imageRows.map((row) => row.copy_id)))

  if (retryImageIds.length === 0) {
    return NextResponse.json({ queued: 0, copy_ids: [] })
  }

  const { error: updateError } = await supabase
    .from('product_copy_images')
    .update({
      status: 'queued',
      error_message: null,
      pending_storage_path: null,
      pending_filename: null,
      pending_regeneration_note: regenerationNote,
    })
    .in('id', retryImageIds)

  if (updateError) {
    logServerEvent('error', 'product_copy_images.retry_update_failed', {
      workspaceKey,
      retryImageCount: retryImageIds.length,
      retryCopyCount: retryCopyIds.length,
      message: updateError.message,
    })
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  await supabase
    .from('product_copies')
    .update({ status: 'queued', error_message: null })
    .eq('workspace_key', workspaceKey)
    .in('id', retryCopyIds)

  const processUrl = new URL('/api/product-copies/process', request.url)
  fetch(processUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('authorization') || '',
    },
    body: JSON.stringify({ copy_ids: retryCopyIds }),
  }).catch(() => {
    // Images remain queued, so the user can retry again from the workbench.
  })

  logServerEvent('info', 'product_copy_images.retry_queued', {
    workspaceKey,
    retryImageCount: retryImageIds.length,
    retryCopyCount: retryCopyIds.length,
  })

  return NextResponse.json({ queued: retryImageIds.length, copy_ids: retryCopyIds })
}
