import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'
import { defaultDetailPrompt } from '@/lib/product-generation'

export async function GET(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
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

  const categoryIds = (categories || []).map((cat) => cat.id)
  const [promptRes, imageRes] = categoryIds.length > 0
    ? await Promise.all([
        supabase.from('category_prompts').select('category_id').in('category_id', categoryIds),
        supabase.from('category_images').select('category_id').in('category_id', categoryIds),
      ])
    : [{ data: [] }, { data: [] }]

  const promptCounts = new Map<string, number>()
  for (const prompt of promptRes.data || []) {
    promptCounts.set(prompt.category_id, (promptCounts.get(prompt.category_id) || 0) + 1)
  }

  const imageCounts = new Map<string, number>()
  for (const image of imageRes.data || []) {
    imageCounts.set(image.category_id, (imageCounts.get(image.category_id) || 0) + 1)
  }

  const enriched = (categories || []).map((cat) => ({
    ...cat,
    prompt_count: promptCounts.get(cat.id) || 0,
    image_count: imageCounts.get(cat.id) || 0,
  }))

  return NextResponse.json(enriched)
}

export async function POST(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
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

  await supabase.from('category_prompts').insert([
    {
      category_id: data.id,
      prompt_number: 1,
      prompt_role: 'main_1',
      prompt_text: `以我上传的所有产品原图为唯一产品参考，严格保持产品外观、包装、标签、logo、颜色、比例和可见文字不变。生成一张高端电商${name_zh}商品主图，产品完整清晰并作为视觉中心，背景高级、干净、有层次，1:1正方形构图。`,
    },
    {
      category_id: data.id,
      prompt_number: 2,
      prompt_role: 'main_2',
      prompt_text: `以我上传的所有产品原图为唯一产品参考，严格保持产品本体不变。生成一张与第一张主图有细微差异的${name_zh}商品主图，调整陈列、光线、背景材质和构图层次，但不要改变商品信息，1:1正方形构图。`,
    },
    {
      category_id: data.id,
      prompt_number: 3,
      prompt_role: 'model_scene_1',
      prompt_text: `以我上传的所有产品原图为唯一产品参考，严格保持商品外观和包装不变。生成一张${name_zh}模特或使用场景图，人物或场景只作为辅助，商品必须清晰完整且为核心，画面真实高级，1:1正方形构图。`,
    },
    {
      category_id: data.id,
      prompt_number: 4,
      prompt_role: 'model_scene_2',
      prompt_text: `以我上传的所有产品原图为唯一产品参考，严格保持商品外观和包装不变。生成另一张${name_zh}使用场景图，与上一张在场景、光线和构图上有差异，商品仍然是视觉重点，1:1正方形构图。`,
    },
    {
      category_id: data.id,
      prompt_number: 5,
      prompt_role: 'detail_1',
      prompt_text: defaultDetailPrompt(name_zh, 1),
    },
    {
      category_id: data.id,
      prompt_number: 6,
      prompt_role: 'detail_2',
      prompt_text: defaultDetailPrompt(name_zh, 2),
    },
  ])

  return NextResponse.json(data, { status: 201 })
}
