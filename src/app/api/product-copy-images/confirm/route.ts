import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

type CopyImageRow = {
  id: string
  copy_id: string
  output_storage_path: string | null
  output_filename: string | null
  pending_storage_path: string | null
  pending_filename: string | null
  product_copies?: { id: string; workspace_key: string } | null
}

export async function POST(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const imageId = String(body.image_id || '').trim()
  const action = String(body.action || '').trim()

  if (!imageId || !['accept', 'discard'].includes(action)) {
    return NextResponse.json({ error: 'image_id and action are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('product_copy_images')
    .select('id,copy_id,output_storage_path,output_filename,pending_storage_path,pending_filename,product_copies!inner(id,workspace_key)')
    .eq('id', imageId)
    .eq('product_copies.workspace_key', workspaceKey)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const row = data as unknown as CopyImageRow | null
  if (!row) return NextResponse.json({ error: 'Image task not found' }, { status: 404 })
  if (!row.pending_storage_path) return NextResponse.json({ error: 'No pending image to confirm' }, { status: 400 })

  const patch = action === 'accept'
    ? {
        previous_storage_path: row.output_storage_path,
        previous_filename: row.output_filename,
        output_storage_path: row.pending_storage_path,
        output_filename: row.pending_filename,
        pending_storage_path: null,
        pending_filename: null,
        pending_regeneration_note: '',
        status: 'completed',
        error_message: null,
      }
    : {
        pending_storage_path: null,
        pending_filename: null,
        pending_regeneration_note: '',
        status: row.output_storage_path ? 'completed' : 'failed',
        error_message: row.output_storage_path ? null : 'Pending regenerated image was discarded.',
      }

  const { data: updated, error: updateError } = await supabase
    .from('product_copy_images')
    .update(patch)
    .eq('id', imageId)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json(updated)
}
