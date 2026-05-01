import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'
import {
  buildSeoKeywordRuleName,
  parseSeoKeywordBank,
  serializeSeoKeywordBank,
  SEO_KEYWORD_RULE_PREFIX,
  normalizeSeoKeywords,
} from '@/lib/seo-keywords'

type RuleTemplateRow = {
  id: string
  name: string
  content: string
  active: boolean
  updated_at: string
}

async function ensureCategory(
  supabase: ReturnType<typeof getRequestSupabase>,
  userId: string,
  categoryId: string
) {
  const { data } = await supabase
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('user_id', userId)
    .maybeSingle()

  return Boolean(data)
}

export async function GET(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const categoryId = searchParams.get('category_id')?.trim()
  const languageCode = searchParams.get('language_code')?.trim()

  const { data, error } = await supabase
    .from('rule_templates')
    .select('id,name,content,active,updated_at')
    .eq('user_id', user.id)
    .like('name', `${SEO_KEYWORD_RULE_PREFIX}%`)
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const banks = ((data || []) as RuleTemplateRow[])
    .map((rule) => {
      const bank = parseSeoKeywordBank(rule.content)
      return bank ? { ...bank, rule_id: rule.id, active: rule.active, updated_at: rule.updated_at } : null
    })
    .filter(Boolean)
    .filter((bank) => !categoryId || bank?.category_id === categoryId)
    .filter((bank) => !languageCode || bank?.language_code === languageCode)

  return NextResponse.json(banks)
}

export async function POST(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const categoryId = String(body.category_id || '').trim()
  const languageCode = String(body.language_code || '').trim()

  if (!categoryId || !languageCode) {
    return NextResponse.json({ error: 'category_id and language_code are required' }, { status: 400 })
  }

  const categoryExists = await ensureCategory(supabase, user.id, categoryId)
  if (!categoryExists) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  const keywords = normalizeSeoKeywords(body.keywords)
  const name = buildSeoKeywordRuleName(categoryId, languageCode)
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
        name,
        scope: 'title_description',
        content,
        active: body.active !== false,
      },
      { onConflict: 'user_id,name' }
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
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
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
    .eq('user_id', user.id)
    .eq('name', buildSeoKeywordRuleName(categoryId, languageCode))

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
