import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import {
  buildSeoKeywordRuleName,
  normalizeSeoKeywords,
  parseSeoKeywordBank,
  serializeSeoKeywordBank,
  SEO_KEYWORD_TYPES,
  type SeoKeyword,
  type SeoKeywordType,
} from '@/lib/seo-keywords'
import { mergeSeoKeywords } from '@/lib/default-seo-keywords'
import { PRODUCT_LANGUAGES } from '@/lib/types'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

type ImportRow = Record<string, unknown>
type CategoryRow = { id: string; name_zh: string; slug: string }
type ImportGroup = {
  category: CategoryRow
  languageCode: string
  keywords: SeoKeyword[]
}

const TYPE_ALIASES: Record<string, SeoKeywordType> = {
  core: 'core',
  核心词: 'core',
  long_tail: 'long_tail',
  longtail: 'long_tail',
  长尾词: 'long_tail',
  attribute: 'attribute',
  属性词: 'attribute',
  scene: 'scene',
  场景词: 'scene',
  audience: 'audience',
  人群词: 'audience',
  forbidden: 'forbidden',
  禁词: 'forbidden',
  禁用词: 'forbidden',
}

function value(row: ImportRow, keys: string[]) {
  for (const key of keys) {
    const found = Object.entries(row).find(([name]) => name.trim().toLowerCase() === key.trim().toLowerCase())
    if (found) return String(found[1] || '').trim()
  }
  return ''
}

function normalizeLanguage(raw: string) {
  const lower = raw.trim().toLowerCase()
  const language = PRODUCT_LANGUAGES.find((item) =>
    item.code === lower ||
    item.label.toLowerCase() === lower ||
    lower.includes(item.code)
  )
  return language?.code || lower || 'en'
}

function normalizeType(raw: string): SeoKeywordType {
  return TYPE_ALIASES[raw.trim()] || TYPE_ALIASES[raw.trim().toLowerCase()] || 'long_tail'
}

function findCategory(categories: CategoryRow[], row: ImportRow) {
  const leaf = value(row, ['叶类目', 'leaf category', 'leaf_category', 'category', '类目']).toLowerCase()
  const third = value(row, ['三级类目', '3rd level category', 'third category']).toLowerCase()
  const second = value(row, ['二级类目', 'sub-category', 'subcategory']).toLowerCase()
  const first = value(row, ['一级类目', 'category root', 'root category']).toLowerCase()
  const candidates = [leaf, third, second, first].filter(Boolean)

  for (const candidate of candidates) {
    const matched = categories.find((category) =>
      category.id.toLowerCase() === candidate ||
      category.slug.toLowerCase() === candidate ||
      category.name_zh.toLowerCase() === candidate
    )
    if (matched) return matched
  }

  return null
}

function rowsFromBuffer(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: '' })
}

function buildGroups(rows: ImportRow[], categories: CategoryRow[]) {
  const grouped = new Map<string, ImportGroup>()
  const errors: Array<{ row: number; reason: string }> = []

  rows.forEach((row, index) => {
    const rowNumber = index + 2
    const category = findCategory(categories, row)
    const keyword = value(row, ['keyword', '关键词', 'seo keyword']).trim()

    if (!category || !keyword) {
      errors.push({
        row: rowNumber,
        reason: !category && !keyword ? '未匹配到类目且关键词为空' : !category ? '未匹配到类目' : '关键词为空',
      })
      return
    }

    const languageCode = normalizeLanguage(value(row, ['language', '语言', 'language_code']))
    const type = normalizeType(value(row, ['type', '类型']))
    const priority = Math.min(Math.max(Math.floor(Number(value(row, ['priority', '优先级']) || 3)), 1), 5)
    const note = value(row, ['note', '备注'])
    const key = `${category.id}:${languageCode}`
    const current = grouped.get(key) || { category, languageCode, keywords: [] }

    current.keywords.push({
      id: crypto.randomUUID(),
      keyword,
      type: SEO_KEYWORD_TYPES.some((item) => item.value === type) ? type : 'long_tail',
      priority,
      ...(note ? { note } : {}),
    })
    grouped.set(key, current)
  })

  return { grouped, errors }
}

export async function POST(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const action = String(formData.get('action') || 'commit')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: '请上传 Excel 或 CSV 文件。' }, { status: 400 })
  }

  const rows = rowsFromBuffer(await file.arrayBuffer())
  if (rows.length === 0) {
    return NextResponse.json({ error: '文件为空，或没有可读取的表格行。' }, { status: 400 })
  }

  const { data: categoriesData } = await supabase
    .from('categories')
    .select('id,name_zh,slug')
    .eq('workspace_key', workspaceKey)

  const categories = (categoriesData || []) as CategoryRow[]
  const { grouped, errors } = buildGroups(rows, categories)
  const groups = Array.from(grouped.values())

  if (action === 'preview') {
    return NextResponse.json({
      mode: 'preview',
      total_rows: rows.length,
      valid_rows: groups.reduce((sum, group) => sum + group.keywords.length, 0),
      skipped: errors.length,
      errors: errors.slice(0, 20),
      groups: groups.map((group) => ({
        category_id: group.category.id,
        category_name: group.category.name_zh,
        language_code: group.languageCode,
        keyword_count: group.keywords.length,
        sample_keywords: group.keywords.slice(0, 8).map((item) => item.keyword),
      })),
    })
  }

  let imported = 0
  for (const item of groups) {
    const name = buildSeoKeywordRuleName(item.category.id, item.languageCode)
    const { data: existing } = await supabase
      .from('rule_templates')
      .select('content')
      .eq('workspace_key', workspaceKey)
      .eq('name', name)
      .maybeSingle()

    const existingKeywords = parseSeoKeywordBank(existing?.content || '')?.keywords || []
    const keywords = mergeSeoKeywords(existingKeywords, normalizeSeoKeywords(item.keywords))
    const { error } = await supabase
      .from('rule_templates')
      .upsert(
        {
          user_id: user.id,
          workspace_key: workspaceKey,
          name,
          scope: 'title_description',
          content: serializeSeoKeywordBank({
            category_id: item.category.id,
            language_code: item.languageCode,
            keywords,
          }),
          active: true,
        },
        { onConflict: 'workspace_key,name' }
      )

    if (!error) imported += item.keywords.length
  }

  return NextResponse.json({
    mode: 'commit',
    imported,
    skipped: errors.length,
    groups: groups.length,
    errors: errors.slice(0, 20),
  })
}
