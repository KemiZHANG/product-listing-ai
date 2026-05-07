import type { SupabaseClient } from '@supabase/supabase-js'
import { getCategoryPromptSubject } from './category-prompts'
import { PRESET_CATEGORIES } from './presets'
import { defaultDetailPrompt, defaultMainPrompt, defaultScenePrompt } from './product-generation'
import { normalizeProductImageRole } from './types'
import { INTERNAL_WORKSPACE_KEY, type WorkspaceKey } from './workspace'

function pickPresetPrompt(
  preset: { name_zh: string; prompts: Array<{ prompt_number: number; prompt_role?: string; prompt_text: string }> },
  role: 'main' | 'scene' | 'detail'
) {
  const byRole = preset.prompts.find((prompt) => normalizeProductImageRole(prompt.prompt_role) === role)?.prompt_text
  if (byRole) return byRole

  const legacyNumber = role === 'main' ? 1 : role === 'scene' ? 3 : 5
  const legacy = preset.prompts.find((prompt) => prompt.prompt_number === legacyNumber)?.prompt_text
  if (legacy) return legacy

  const categorySubject = getCategoryPromptSubject({
    slug: (preset as { slug?: string }).slug,
    name_zh: preset.name_zh,
  })
  if (role === 'main') return defaultMainPrompt(categorySubject, 1)
  if (role === 'scene') return defaultScenePrompt(categorySubject, 1)
  return defaultDetailPrompt(categorySubject, 1)
}

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

    return [
      {
        category_id: categoryId,
        prompt_number: 1,
        prompt_role: 'main',
        prompt_text: pickPresetPrompt(preset, 'main'),
      },
      {
        category_id: categoryId,
        prompt_number: 2,
        prompt_role: 'scene',
        prompt_text: pickPresetPrompt(preset, 'scene'),
      },
      {
        category_id: categoryId,
        prompt_number: 3,
        prompt_role: 'detail',
        prompt_text: pickPresetPrompt(preset, 'detail'),
      },
    ]
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
