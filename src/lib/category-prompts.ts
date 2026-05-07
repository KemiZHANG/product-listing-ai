import { defaultDetailPrompt, defaultMainPrompt, defaultScenePrompt } from './product-generation'
import { normalizeProductImageRole, type ProductImageRole } from './types'

export type CategoryPromptLike = {
  id?: string
  category_id?: string
  prompt_number: number
  prompt_role?: string | null
  prompt_text?: string | null
  [key: string]: unknown
}

const IMAGE_ROLE_ORDER: ProductImageRole[] = ['main', 'scene', 'detail']

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function getCategoryPromptSubject(category: { slug?: string | null; name_zh?: string | null }) {
  const slug = String(category.slug || '').trim()
  if (slug) {
    return titleCaseWords(slug.replace(/[-_]+/g, ' '))
  }
  return String(category.name_zh || '').trim()
}

export function promptNumberForImageRole(role: ProductImageRole) {
  return IMAGE_ROLE_ORDER.indexOf(role) + 1
}

export function legacyPromptNumberForImageRole(role: ProductImageRole) {
  if (role === 'main') return 1
  if (role === 'scene') return 3
  return 5
}

export function getPromptRoleFromRow(prompt: Pick<CategoryPromptLike, 'prompt_number' | 'prompt_role'>) {
  const normalized = normalizeProductImageRole(prompt.prompt_role)
  if (normalized) return normalized

  if (prompt.prompt_number === 1 || prompt.prompt_number === 2) return 'main'
  if (prompt.prompt_number === 3 || prompt.prompt_number === 4) return 'scene'
  if (prompt.prompt_number === 5 || prompt.prompt_number === 6) return 'detail'
  return null
}

function defaultPromptText(categoryName: string, role: ProductImageRole) {
  if (role === 'main') return defaultMainPrompt(categoryName, 1)
  if (role === 'scene') return defaultScenePrompt(categoryName, 1)
  return defaultDetailPrompt(categoryName, 1)
}

function pickPromptForRole(prompts: CategoryPromptLike[], role: ProductImageRole) {
  const byRole = prompts.find((prompt) => normalizeProductImageRole(prompt.prompt_role) === role && prompt.prompt_text)
  if (byRole) return byRole

  const legacyNumber = legacyPromptNumberForImageRole(role)
  const byLegacyNumber = prompts.find((prompt) => prompt.prompt_number === legacyNumber && prompt.prompt_text)
  if (byLegacyNumber) return byLegacyNumber

  return prompts.find((prompt) => getPromptRoleFromRow(prompt) === role && prompt.prompt_text) || null
}

export function compactCategoryPrompts(prompts: CategoryPromptLike[] | null | undefined, categoryName: string) {
  const rows = prompts || []

  return IMAGE_ROLE_ORDER.map((role) => {
    const picked = pickPromptForRole(rows, role)
    return {
      ...(picked || {}),
      prompt_number: promptNumberForImageRole(role),
      prompt_role: role,
      prompt_text: picked?.prompt_text || defaultPromptText(categoryName, role),
    }
  })
}

export function countCompactPromptRoles(prompts: CategoryPromptLike[] | null | undefined) {
  const roles = new Set<ProductImageRole>()
  for (const prompt of prompts || []) {
    const role = getPromptRoleFromRow(prompt)
    if (role) roles.add(role)
  }
  return roles.size
}
