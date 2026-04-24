import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { prompt_text } = body

  if (!prompt_text) {
    return NextResponse.json({ error: 'prompt_text is required' }, { status: 400 })
  }

  // Verify ownership through category
  const { data: prompt } = await supabase
    .from('category_prompts')
    .select('*, categories!inner(user_id)')
    .eq('id', id)
    .maybeSingle()

  if (!prompt || (prompt.categories as unknown as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: 'Prompt not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('category_prompts')
    .update({ prompt_text })
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
  const supabase = getServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Verify ownership through category
  const { data: prompt } = await supabase
    .from('category_prompts')
    .select('*, categories!inner(user_id)')
    .eq('id', id)
    .maybeSingle()

  if (!prompt || (prompt.categories as unknown as { user_id: string }).user_id !== user.id) {
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
