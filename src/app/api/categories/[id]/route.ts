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

  const { data: category, error } = await supabase
    .from('categories')
    .select('*')
    .eq('id', id)
    .eq('workspace_key', workspaceKey)
    .single()

  if (error || !category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  // Fetch prompts
  const { data: prompts } = await supabase
    .from('category_prompts')
    .select('*')
    .eq('category_id', id)
    .order('prompt_number', { ascending: true })

  // Fetch images
  const { data: images } = await supabase
    .from('category_images')
    .select('*')
    .eq('category_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    ...category,
    prompts: prompts || [],
    images: images || [],
  })
}

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
  const { name_zh, icon, sort_order } = body

  // Verify ownership
  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('id', id)
    .eq('workspace_key', workspaceKey)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  const updateData: Record<string, unknown> = {}
  if (name_zh !== undefined) updateData.name_zh = name_zh
  if (icon !== undefined) updateData.icon = icon
  if (sort_order !== undefined) updateData.sort_order = sort_order

  const { data, error } = await supabase
    .from('categories')
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

  // Verify ownership
  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('id', id)
    .eq('workspace_key', workspaceKey)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  // Delete related images from storage first
  const { data: images } = await supabase
    .from('category_images')
    .select('storage_path')
    .eq('category_id', id)

  if (images && images.length > 0) {
    const paths = images.map((img) => img.storage_path)
    await supabase.storage.from('images').remove(paths)
  }

  // Delete category (cascading deletes should handle prompts, images via DB triggers)
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
