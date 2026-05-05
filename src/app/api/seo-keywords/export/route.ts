import { NextRequest, NextResponse } from 'next/server'
import { parseSeoKeywordBank, SEO_KEYWORD_RULE_PREFIX } from '@/lib/seo-keywords'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

type RuleRow = { content: string }
type CategoryRow = { id: string; name_zh: string; slug: string }

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

export async function GET(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [{ data: rules, error }, { data: categoriesData }] = await Promise.all([
    supabase
      .from('rule_templates')
      .select('content')
      .eq('workspace_key', workspaceKey)
      .like('name', `${SEO_KEYWORD_RULE_PREFIX}%`)
      .order('updated_at', { ascending: false }),
    supabase
      .from('categories')
      .select('id,name_zh,slug')
      .eq('workspace_key', workspaceKey),
  ])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const categoryMap = new Map((categoriesData || []).map((category: CategoryRow) => [category.id, category]))
  const rows = [
    ['一级类目', '二级类目', '叶类目', 'language', 'keyword', 'type', 'priority', 'note'],
  ]

  for (const rule of (rules || []) as RuleRow[]) {
    const bank = parseSeoKeywordBank(rule.content)
    if (!bank) continue
    const category = categoryMap.get(bank.category_id)
    for (const keyword of bank.keywords) {
      rows.push([
        category?.name_zh || bank.category_id,
        '',
        category?.name_zh || bank.category_id,
        bank.language_code,
        keyword.keyword,
        keyword.type,
        String(keyword.priority),
        keyword.note || '',
      ])
    }
  }

  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="seo-keywords-${workspaceKey}.csv"`,
    },
  })
}
