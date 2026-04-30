import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { category_id, prompt_text, prompt_role } = body

  if (!category_id || !prompt_text) {
    return NextResponse.json({ error: 'category_id and prompt_text are required' }, { status: 400 })
  }

  // Verify the category belongs to the user
  const { data: category } = await supabase
    .from('categories')
    .select('id')
    .eq('id', category_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  // Get current max prompt_number
  const { data: maxPrompt } = await supabase
    .from('category_prompts')
    .select('prompt_number')
    .eq('category_id', category_id)
    .order('prompt_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextNumber = (maxPrompt?.prompt_number ?? 0) + 1

  const { data, error } = await supabase
    .from('category_prompts')
    .insert({
      category_id,
      prompt_number: nextNumber,
      prompt_role: prompt_role || 'custom',
      prompt_text,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
