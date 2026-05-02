import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { data: image } = await supabase
    .from('product_images')
    .select('id, storage_path, products!inner(workspace_key)')
    .eq('id', id)
    .eq('products.workspace_key', workspaceKey)
    .maybeSingle()

  if (!image) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('product_images')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.storage.from('images').remove([image.storage_path])
  return NextResponse.json({ success: true })
}
