import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'
import { normalizeProductImageRole } from '@/lib/types'

export async function PUT(
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
  const { prompt_text, prompt_role } = body

  if (!prompt_text) {
    return NextResponse.json({ error: 'prompt_text is required' }, { status: 400 })
  }

  // Verify ownership through category
  const { data: prompt } = await supabase
    .from('category_prompts')
    .select('*, categories!inner(workspace_key)')
    .eq('id', id)
    .eq('categories.workspace_key', workspaceKey)
    .maybeSingle()

  if (!prompt) {
    return NextResponse.json({ error: 'Prompt not found' }, { status: 404 })
  }

  const normalizedRole = normalizeProductImageRole(prompt_role)
  const updateData: Record<string, unknown> = {
    prompt_text,
    prompt_role: normalizedRole || prompt_role || 'custom',
  }

  const { data, error } = await supabase
    .from('category_prompts')
    .update(updateData)
    .eq('id', id)
    .select()
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
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Verify ownership through category
  const { data: prompt } = await supabase
    .from('category_prompts')
    .select('*, categories!inner(workspace_key)')
    .eq('id', id)
    .eq('categories.workspace_key', workspaceKey)
    .maybeSingle()

  if (!prompt) {
    return NextResponse.json({ error: 'Prompt not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('category_prompts')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // The DB trigger handles renumbering automatically

  return NextResponse.json({ success: true })
}
