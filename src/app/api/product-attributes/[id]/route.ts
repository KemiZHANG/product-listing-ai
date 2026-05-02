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
  const { data: column } = await supabase
    .from('product_attribute_columns')
    .select('id, name')
    .eq('id', id)
    .eq('workspace_key', workspaceKey)
    .maybeSingle()

  if (!column) {
    return NextResponse.json({ error: 'Attribute column not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('product_attribute_columns')
    .delete()
    .eq('id', id)
    .eq('workspace_key', workspaceKey)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
