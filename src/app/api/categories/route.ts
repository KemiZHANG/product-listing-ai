import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'
import { defaultDetailPrompt, defaultMainPrompt, defaultScenePrompt } from '@/lib/product-generation'
import { ensurePresetCategoriesForUser } from '@/lib/preset-seed'
import { countCompactPromptRoles, getCategoryPromptSubject } from '@/lib/category-prompts'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type EnrichedCategory = {
  id: string
  name_zh: string
  slug: string
  sort_order: number
  prompt_count: number
  image_count: number
  created_at?: string
} & Record<string, unknown>

function baseCategorySlug(slug: string) {
  return slug.replace(/-migrated-\d+$/, '')
}

function preferVisibleCategory(current: EnrichedCategory, next: EnrichedCategory) {
  if (next.prompt_count !== current.prompt_count) return next.prompt_count > current.prompt_count ? next : current
  const currentIsBase = current.slug === baseCategorySlug(current.slug)
  const nextIsBase = next.slug === baseCategorySlug(next.slug)
  if (nextIsBase !== currentIsBase) return nextIsBase ? next : current
  return new Date(next.created_at || 0).getTime() < new Date(current.created_at || 0).getTime() ? next : current
}

function dedupeVisibleCategories(categories: EnrichedCategory[]) {
  const byBaseSlug = new Map<string, EnrichedCategory>()
  for (const category of categories) {
    const key = `${baseCategorySlug(category.slug)}:${category.name_zh || ''}`
    const existing = byBaseSlug.get(key)
    byBaseSlug.set(key, existing ? preferVisibleCategory(existing, category) : category)
  }
  return Array.from(byBaseSlug.values()).sort((a, b) => {
    const sortA = Number(a.sort_order ?? 0)
    const sortB = Number(b.sort_order ?? 0)
    if (sortA !== sortB) return sortA - sortB
    return String(a.slug).localeCompare(String(b.slug))
  })
}

function defaultPromptRows(categoryId: string, categoryName: string) {
  const categorySubject = getCategoryPromptSubject({ slug: categoryName, name_zh: categoryName })
  return [
    {
      category_id: categoryId,
      prompt_number: 1,
      prompt_role: 'main',
      prompt_text: defaultMainPrompt(categorySubject, 1),
    },
    {
      category_id: categoryId,
      prompt_number: 2,
      prompt_role: 'scene',
      prompt_text: defaultScenePrompt(categorySubject, 1),
    },
    {
      category_id: categoryId,
      prompt_number: 3,
      prompt_role: 'detail',
      prompt_text: defaultDetailPrompt(categorySubject, 1),
    },
  ]
}

export async function GET(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 })
  }

  let { data: categories, error } = await supabase
    .from('categories')
    .select('*')
    .eq('workspace_key', workspaceKey)
    .order('sort_order', { ascending: true })

  if (!error && (!categories || categories.length === 0)) {
    await ensurePresetCategoriesForUser(supabase, user.id, workspaceKey)
    const retry = await supabase
      .from('categories')
      .select('*')
      .eq('workspace_key', workspaceKey)
      .order('sort_order', { ascending: true })
    categories = retry.data
    error = retry.error
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const categoryIds = (categories || []).map((cat) => cat.id)
  const [promptRes, imageRes] = categoryIds.length > 0
    ? await Promise.all([
        supabase.from('category_prompts').select('category_id,prompt_number,prompt_role').in('category_id', categoryIds),
        supabase.from('category_images').select('category_id').in('category_id', categoryIds),
      ])
    : [{ data: [] }, { data: [] }]

  const promptsByCategory = new Map<string, Array<{ category_id: string; prompt_number: number; prompt_role?: string | null }>>()
  for (const prompt of promptRes.data || []) {
    const rows = promptsByCategory.get(prompt.category_id) || []
    rows.push(prompt)
    promptsByCategory.set(prompt.category_id, rows)
  }

  const imageCounts = new Map<string, number>()
  for (const image of imageRes.data || []) {
    imageCounts.set(image.category_id, (imageCounts.get(image.category_id) || 0) + 1)
  }

  const enriched = (categories || []).map((cat) => ({
    ...cat,
    prompt_count: countCompactPromptRoles(promptsByCategory.get(cat.id)),
    image_count: imageCounts.get(cat.id) || 0,
  }))

  return NextResponse.json(dedupeVisibleCategories(enriched))
}

export async function POST(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const name_zh = String(body.name_zh || '').trim()
  const slug = String(body.slug || '').trim()
  const icon = String(body.icon || '').trim()

  if (!name_zh || !slug) {
    return NextResponse.json({ error: 'name_zh and slug are required' }, { status: 400 })
  }

  const normalizedSlug = slug.replace(/-migrated-\d+$/, '')

  const { data: existing } = await supabase
    .from('categories')
    .select('id,slug')
    .eq('workspace_key', workspaceKey)
    .or(`slug.eq.${normalizedSlug},slug.like.${normalizedSlug}-migrated-%`)
    .limit(1)

  if (existing?.length) {
    return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
  }

  const { data: maxSort } = await supabase
    .from('categories')
    .select('sort_order')
    .eq('workspace_key', workspaceKey)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextSortOrder = (maxSort?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('categories')
    .insert({
      user_id: user.id,
      workspace_key: workspaceKey,
      name_zh,
      slug: normalizedSlug,
      icon: icon || 'box',
      sort_order: nextSortOrder,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { error: promptError } = await supabase
    .from('category_prompts')
    .insert(defaultPromptRows(data.id, normalizedSlug))
  if (promptError) {
    return NextResponse.json({ error: promptError.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
