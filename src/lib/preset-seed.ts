import type { SupabaseClient } from '@supabase/supabase-js'
import { PRESET_CATEGORIES } from './presets'
import { defaultDetailPrompt } from './product-generation'
import { INTERNAL_WORKSPACE_KEY, type WorkspaceKey } from './workspace'

export async function ensurePresetCategoriesForUser(
  supabase: SupabaseClient,
  userId: string,
  workspaceKey: WorkspaceKey = INTERNAL_WORKSPACE_KEY
) {
  const { data: existingCategories, error: existingError } = await supabase
    .from('categories')
    .select('id, slug')
    .eq('workspace_key', workspaceKey)

  if (existingError) {
    throw existingError
  }

  const existingBySlug = new Map(
    (existingCategories || []).map((category) => [
      String(category.slug).replace(/-migrated-\d+$/, ''),
      category.id,
    ])
  )
  const missingPresets = PRESET_CATEGORIES.filter((preset) => !existingBySlug.has(preset.slug))

  if (missingPresets.length === 0) {
    return
  }

  const rows = missingPresets.map((preset) => ({
    user_id: userId,
    workspace_key: workspaceKey,
    name_zh: preset.name_zh,
    slug: preset.slug,
    icon: preset.icon,
    sort_order: PRESET_CATEGORIES.findIndex((category) => category.slug === preset.slug),
    is_preset: true,
  }))

  const { data: insertedCategories, error: categoryError } = await supabase
    .from('categories')
    .insert(rows)
    .select('id, slug')

  if (categoryError) {
    throw categoryError
  }

  const insertedBySlug = new Map(
    (insertedCategories || []).map((category) => [category.slug, category.id])
  )
  const promptRows = missingPresets.flatMap((preset) => {
    const categoryId = insertedBySlug.get(preset.slug)
    if (!categoryId) return []

    const byNumber = new Map(preset.prompts.map((prompt) => [prompt.prompt_number, prompt.prompt_text]))
    const prompts = [
      { prompt_number: 1, prompt_role: 'main_1', prompt_text: byNumber.get(1) || '' },
      { prompt_number: 2, prompt_role: 'main_2', prompt_text: byNumber.get(2) || '' },
      { prompt_number: 3, prompt_role: 'model_scene_1', prompt_text: byNumber.get(3) || '' },
      { prompt_number: 4, prompt_role: 'model_scene_2', prompt_text: byNumber.get(5) || byNumber.get(4) || '' },
      { prompt_number: 5, prompt_role: 'detail_1', prompt_text: defaultDetailPrompt(preset.name_zh, 1) },
      { prompt_number: 6, prompt_role: 'detail_2', prompt_text: defaultDetailPrompt(preset.name_zh, 2) },
    ]

    return prompts.map((prompt) => ({
      category_id: categoryId,
      prompt_number: prompt.prompt_number,
      prompt_role: prompt.prompt_role,
      prompt_text: prompt.prompt_text,
    }))
  })

  if (promptRows.length > 0) {
    const { error: promptInsertError } = await supabase
      .from('category_prompts')
      .insert(promptRows)

    if (promptInsertError) {
      throw promptInsertError
    }
  }
}
