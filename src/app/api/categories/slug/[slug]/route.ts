import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = await params

  const { data: category, error } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', slug)
    .eq('workspace_key', workspaceKey)
    .single()

  if (error || !category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  const [promptRes, imageRes] = await Promise.all([
    supabase
      .from('category_prompts')
      .select('*')
      .eq('category_id', category.id)
      .order('prompt_number', { ascending: true }),
    supabase
      .from('category_images')
      .select('*')
      .eq('category_id', category.id)
      .order('created_at', { ascending: true }),
  ])

  if (promptRes.error) {
    return NextResponse.json({ error: promptRes.error.message }, { status: 500 })
  }

  if (imageRes.error) {
    return NextResponse.json({ error: imageRes.error.message }, { status: 500 })
  }

  return NextResponse.json({
    ...category,
    prompts: promptRes.data || [],
    images: imageRes.data || [],
  })
}
