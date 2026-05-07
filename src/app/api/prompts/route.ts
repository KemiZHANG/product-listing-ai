import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'
import { getPromptRoleFromRow, promptNumberForImageRole } from '@/lib/category-prompts'
import { normalizeProductImageRole } from '@/lib/types'

export async function POST(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
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
    .eq('workspace_key', workspaceKey)
    .maybeSingle()

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  const normalizedRole = normalizeProductImageRole(prompt_role)
  if (normalizedRole) {
    const { data: prompts, error: promptReadError } = await supabase
      .from('category_prompts')
      .select('id,prompt_number,prompt_role')
      .eq('category_id', category_id)
      .order('prompt_number', { ascending: true })

    if (promptReadError) {
      return NextResponse.json({ error: promptReadError.message }, { status: 500 })
    }

    const existing = (prompts || []).find((prompt) => getPromptRoleFromRow(prompt) === normalizedRole)
    if (existing) {
      const { data, error } = await supabase
        .from('category_prompts')
        .update({
          prompt_role: normalizedRole,
          prompt_text,
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json(data)
    }

    const { data, error } = await supabase
      .from('category_prompts')
      .insert({
        category_id,
        prompt_number: promptNumberForImageRole(normalizedRole),
        prompt_role: normalizedRole,
        prompt_text,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  }

  // Custom prompts are still allowed, but the three built-in image roles stay one per role.
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
