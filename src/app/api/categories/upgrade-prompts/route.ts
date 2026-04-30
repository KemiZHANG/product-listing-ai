import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'
import { defaultDetailPrompt } from '@/lib/product-generation'

export async function POST(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: categories, error } = await supabase
    .from('categories')
    .select('id, name_zh')
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let updated = 0
  for (const category of categories || []) {
    const { data: existingPrompts } = await supabase
      .from('category_prompts')
      .select('id, prompt_number, prompt_text')
      .eq('category_id', category.id)
      .order('prompt_number', { ascending: true })

    const byNumber = new Map((existingPrompts || []).map((prompt) => [prompt.prompt_number, prompt]))
    const promptRows = [
      { number: 1, role: 'main_1', text: byNumber.get(1)?.prompt_text || '' },
      { number: 2, role: 'main_2', text: byNumber.get(2)?.prompt_text || '' },
      { number: 3, role: 'model_scene_1', text: byNumber.get(3)?.prompt_text || '' },
      { number: 4, role: 'model_scene_2', text: byNumber.get(5)?.prompt_text || byNumber.get(4)?.prompt_text || '' },
      { number: 5, role: 'detail_1', text: defaultDetailPrompt(category.name_zh, 1) },
      { number: 6, role: 'detail_2', text: defaultDetailPrompt(category.name_zh, 2) },
    ]

    await supabase.from('category_prompts').delete().eq('category_id', category.id)
    await supabase.from('category_prompts').insert(promptRows.map((prompt) => ({
      category_id: category.id,
      prompt_number: prompt.number,
      prompt_role: prompt.role,
      prompt_text: prompt.text,
    })))
    updated += 1
  }

  return NextResponse.json({ updated })
}
