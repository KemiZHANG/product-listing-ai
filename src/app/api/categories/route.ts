import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export async function GET() {
  const supabase = getServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: categories, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get prompt and image counts for each category
  const enriched = await Promise.all(
    (categories || []).map(async (cat) => {
      const [promptRes, imageRes] = await Promise.all([
        supabase.from('category_prompts').select('id', { count: 'exact', head: true }).eq('category_id', cat.id),
        supabase.from('category_images').select('id', { count: 'exact', head: true }).eq('category_id', cat.id),
      ])
      return {
        ...cat,
        prompt_count: promptRes.count ?? 0,
        image_count: imageRes.count ?? 0,
      }
    })
  )

  return NextResponse.json(enriched)
}

export async function POST(request: NextRequest) {
  const supabase = getServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name_zh, slug, icon } = body

  if (!name_zh || !slug) {
    return NextResponse.json({ error: 'name_zh and slug are required' }, { status: 400 })
  }

  // Check slug uniqueness per user
  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', user.id)
    .eq('slug', slug)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
  }

  // Get current max sort_order
  const { data: maxSort } = await supabase
    .from('categories')
    .select('sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextSortOrder = (maxSort?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('categories')
    .insert({
      user_id: user.id,
      name_zh,
      slug,
      icon: icon || '📦',
      sort_order: nextSortOrder,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
