import { NextRequest, NextResponse } from 'next/server'
import { defaultDetailPrompt, defaultMainPrompt, defaultScenePrompt } from '@/lib/product-generation'
import { normalizeProductImageRole } from '@/lib/types'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

function pickPromptText(
  prompts: Array<{ prompt_number: number; prompt_role?: string | null; prompt_text?: string | null }>,
  role: 'main' | 'scene' | 'detail',
  fallback: string
) {
  const byRole = prompts.find((prompt) => normalizeProductImageRole(prompt.prompt_role) === role)?.prompt_text
  if (byRole) return byRole

  const legacyNumber = role === 'main' ? 1 : role === 'scene' ? 3 : 5
  return prompts.find((prompt) => prompt.prompt_number === legacyNumber)?.prompt_text || fallback
}

export async function POST(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 })
  }

  const { data: categories, error } = await supabase
    .from('categories')
    .select('id, name_zh')
    .eq('workspace_key', workspaceKey)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let updated = 0
  for (const category of categories || []) {
    const { data: existingPrompts } = await supabase
      .from('category_prompts')
      .select('id, prompt_number, prompt_role, prompt_text')
      .eq('category_id', category.id)
      .order('prompt_number', { ascending: true })

    const existing = existingPrompts || []
    const promptRows = [
      {
        number: 1,
        role: 'main',
        text: pickPromptText(existing, 'main', defaultMainPrompt(category.name_zh, 1)),
      },
      {
        number: 2,
        role: 'scene',
        text: pickPromptText(existing, 'scene', defaultScenePrompt(category.name_zh, 1)),
      },
      {
        number: 3,
        role: 'detail',
        text: pickPromptText(existing, 'detail', defaultDetailPrompt(category.name_zh, 1)),
      },
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
