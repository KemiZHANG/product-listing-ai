import { NextRequest, NextResponse } from 'next/server'
import {
  buildSeoKeywordRuleName,
  parseSeoKeywordBank,
  serializeSeoKeywordBank,
  SEO_KEYWORD_RULE_PREFIX,
  normalizeSeoKeywords,
} from '@/lib/seo-keywords'
import { ensureDefaultSeoKeywordBanks, mergeSeoKeywords } from '@/lib/default-seo-keywords'
import { ensurePresetCategoriesForUser } from '@/lib/preset-seed'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type RuleTemplateRow = {
  id: string
  name: string
  content: string
  active: boolean
  updated_at: string
}

type CategoryRow = {
  id: string
  name_zh: string
  slug: string
  icon: string
}

async function ensureCategory(
  supabase: ReturnType<typeof getWorkspaceSupabase>,
  workspaceKey: string,
  categoryId: string
) {
  const { data } = await supabase
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('workspace_key', workspaceKey)
    .maybeSingle()

  return Boolean(data)
}

export async function GET(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const categoryId = searchParams.get('category_id')?.trim()
  const languageCode = searchParams.get('language_code')?.trim()

  try {
    const { data: existingCategory } = await supabase
      .from('categories')
      .select('id')
      .eq('workspace_key', workspaceKey)
      .limit(1)

    if (!existingCategory?.length) {
      await ensurePresetCategoriesForUser(supabase, user.id, workspaceKey)
    }

    await ensureDefaultSeoKeywordBanks(supabase, user.id, workspaceKey)
  } catch {
    // Keep the SEO page usable even if initial seeding hits a migration race.
  }

  const [{ data, error }, { data: categoriesData }] = await Promise.all([
    supabase
    .from('rule_templates')
    .select('id,name,content,active,updated_at')
    .eq('workspace_key', workspaceKey)
    .like('name', `${SEO_KEYWORD_RULE_PREFIX}%`)
      .order('updated_at', { ascending: false }),
    supabase
      .from('categories')
      .select('id,name_zh,slug,icon')
      .eq('workspace_key', workspaceKey),
  ])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const categoryMap = new Map((categoriesData || []).map((category: CategoryRow) => [category.id, category]))
  const banks = ((data || []) as RuleTemplateRow[])
    .map((rule) => {
      const bank = parseSeoKeywordBank(rule.content)
      const category = bank ? categoryMap.get(bank.category_id) : null
      return bank ? {
        ...bank,
        rule_id: rule.id,
        active: rule.active,
        updated_at: rule.updated_at,
        category_name_zh: category?.name_zh || '',
        category_slug: category?.slug || '',
        category_icon: category?.icon || '',
      } : null
    })
    .filter(Boolean)
    .filter((bank) => !categoryId || bank?.category_id === categoryId)
    .filter((bank) => !languageCode || bank?.language_code === languageCode)

  return NextResponse.json(banks)
}

export async function POST(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const categoryId = String(body.category_id || '').trim()
  const languageCode = String(body.language_code || '').trim()

  if (!categoryId || !languageCode) {
    return NextResponse.json({ error: 'category_id and language_code are required' }, { status: 400 })
  }

  const categoryExists = await ensureCategory(supabase, workspaceKey, categoryId)
  if (!categoryExists) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  const incomingKeywords = normalizeSeoKeywords(body.keywords)
  const name = buildSeoKeywordRuleName(categoryId, languageCode)
  const mode = body.mode === 'replace' ? 'replace' : 'append'

  const { data: existing } = await supabase
    .from('rule_templates')
    .select('content')
    .eq('workspace_key', workspaceKey)
    .eq('name', name)
    .maybeSingle()

  const existingKeywords = parseSeoKeywordBank(existing?.content || '')?.keywords || []
  const keywords = mode === 'replace'
    ? incomingKeywords
    : mergeSeoKeywords(existingKeywords, incomingKeywords)
  const content = serializeSeoKeywordBank({
    category_id: categoryId,
    language_code: languageCode,
    keywords,
    active: body.active !== false,
  })

  const { data, error } = await supabase
    .from('rule_templates')
    .upsert(
      {
        user_id: user.id,
        workspace_key: workspaceKey,
        name,
        scope: 'title_description',
        content,
        active: body.active !== false,
      },
      { onConflict: 'workspace_key,name' }
    )
    .select('id,name,content,active,updated_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const bank = parseSeoKeywordBank(data.content)
  return NextResponse.json({ ...bank, rule_id: data.id, active: data.active, updated_at: data.updated_at }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const categoryId = searchParams.get('category_id')?.trim()
  const languageCode = searchParams.get('language_code')?.trim()

  if (!categoryId || !languageCode) {
    return NextResponse.json({ error: 'category_id and language_code are required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('rule_templates')
    .delete()
    .eq('workspace_key', workspaceKey)
    .eq('name', buildSeoKeywordRuleName(categoryId, languageCode))

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
