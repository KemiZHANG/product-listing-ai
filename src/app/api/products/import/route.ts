import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'
import { PRODUCT_LANGUAGES } from '@/lib/types'

const FIELD_ALIASES: Record<string, string[]> = {
  sku: ['sku', '商品sku', '商品编码', '货号', '商品货号', 'itemsku', 'itemcode'],
  source_title: ['title', '标题', '商品标题', '原始标题', '原标题', 'source_title', 'sourcetitle'],
  source_description: ['description', '描述', '商品描述', '原始描述', '原描述', 'source_description', 'sourcedescription'],
  category: ['category', '类目', '商品类目', '分类', 'category_slug', 'category_name', 'categoryname'],
  selling_points: ['卖点', '商品卖点', 'selling_points', 'sellingpoints', 'key_points', 'keypoints'],
  copy_count: ['副本数', '生成副本数', 'copy_count', 'copycount', 'copies'],
  languages: ['语言', '副本语言', 'languages', 'language', 'lang'],
}

const IMAGE_HEADERS = ['图片', '图片路径', '原图', '原始图片', 'raw_image_paths', 'image', 'images', 'image_urls']

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-:：/\\()[\]（）]+/g, '')
}

function getCell(row: Record<string, unknown>, aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeKey))
  const entry = Object.entries(row).find(([key]) => normalizedAliases.has(normalizeKey(key)))
  if (!entry) return ''
  return String(entry[1] ?? '').trim()
}

function getMappedHeader(headers: string[], aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeKey))
  return headers.find((header) => normalizedAliases.has(normalizeKey(header)))
}

function normalizeCategoryValue(value: string) {
  return normalizeKey(value).replace(/[>＞]/g, '')
}

function normalizeLanguages(value: string) {
  if (!value.trim()) return ['en']

  const languageMap = new Map<string, string>()
  PRODUCT_LANGUAGES.forEach((language) => {
    languageMap.set(normalizeKey(language.code), language.code)
    languageMap.set(normalizeKey(language.label), language.code)
  })
  languageMap.set('english', 'en')
  languageMap.set('malay', 'ms')
  languageMap.set('bahasamelayu', 'ms')
  languageMap.set('filipino', 'fil')
  languageMap.set('tagalog', 'fil')
  languageMap.set('indonesian', 'id')
  languageMap.set('thai', 'th')
  languageMap.set('vietnamese', 'vi')

  const codes = value
    .split(/[,，;；|、/\n]+/)
    .map((item) => languageMap.get(normalizeKey(item)) || '')
    .filter(Boolean)

  return Array.from(new Set(codes)).length > 0 ? Array.from(new Set(codes)) : ['en']
}

function parseCopyCount(value: string) {
  const number = Number(value || 1)
  if (!Number.isFinite(number)) return 1
  return Math.min(Math.max(Math.floor(number), 1), 20)
}

export async function POST(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const firstSheet = workbook.SheetNames[0]
  if (!firstSheet) {
    return NextResponse.json({ error: 'Excel file has no sheets' }, { status: 400 })
  }

  const sheet = workbook.Sheets[firstSheet]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No product rows found' }, { status: 400 })
  }

  const headers = Object.keys(rows[0] || {}).map((header) => header.trim()).filter(Boolean)
  const mappedHeaders = new Set(
    Object.values(FIELD_ALIASES)
      .map((aliases) => getMappedHeader(headers, aliases))
      .filter(Boolean)
  )
  const imageHeaderSet = new Set(IMAGE_HEADERS.map(normalizeKey))
  const imageHeaders = headers.filter((header) => imageHeaderSet.has(normalizeKey(header)))
  imageHeaders.forEach((header) => mappedHeaders.add(header))

  const { data: categories, error: categoryError } = await supabase
    .from('categories')
    .select('id,name_zh,slug')
    .eq('user_id', user.id)

  if (categoryError) {
    return NextResponse.json({ error: categoryError.message }, { status: 500 })
  }

  const categoryMap = new Map<string, string>()
  ;(categories || []).forEach((category) => {
    categoryMap.set(normalizeCategoryValue(category.id), category.id)
    categoryMap.set(normalizeCategoryValue(category.slug), category.id)
    categoryMap.set(normalizeCategoryValue(category.name_zh), category.id)
  })

  const { data: existingColumns, error: columnsError } = await supabase
    .from('product_attribute_columns')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })

  if (columnsError) {
    return NextResponse.json({ error: columnsError.message }, { status: 500 })
  }

  const existingColumnNames = new Set((existingColumns || []).map((column) => column.name))
  const attributeHeaders = headers.filter((header) => !mappedHeaders.has(header))
  const missingColumns = attributeHeaders.filter((header) => !existingColumnNames.has(header))

  if (missingColumns.length > 0) {
    const maxSort = (existingColumns || []).reduce((max, column) => Math.max(max, column.sort_order ?? 0), -1)
    const { error: insertColumnsError } = await supabase
      .from('product_attribute_columns')
      .insert(missingColumns.map((name, index) => ({
        user_id: user.id,
        name,
        sort_order: maxSort + index + 1,
      })))

    if (insertColumnsError) {
      return NextResponse.json({ error: insertColumnsError.message }, { status: 500 })
    }
  }

  const warnings: string[] = []
  if (imageHeaders.length > 0) {
    warnings.push('已识别图片相关列，但浏览器无法通过 Excel 中的本地路径读取电脑文件；请导入后在每个 SKU 行内上传原始图片。')
  }

  const products = rows.map((row, index) => {
    const sku = getCell(row, FIELD_ALIASES.sku)
    const categoryValue = getCell(row, FIELD_ALIASES.category)
    const categoryId = categoryValue ? categoryMap.get(normalizeCategoryValue(categoryValue)) || null : null
    const attributes = Object.fromEntries(
      attributeHeaders
        .map((header) => [header, String(row[header] ?? '').trim()] as const)
        .filter(([, value]) => value)
    )

    if (categoryValue && !categoryId) {
      warnings.push(`第 ${index + 2} 行 SKU ${sku || '(空)'} 的类目 "${categoryValue}" 未匹配到现有类目，已留空待检查。`)
    }

    return {
      user_id: user.id,
      category_id: categoryId,
      sku,
      source_title: getCell(row, FIELD_ALIASES.source_title),
      source_description: getCell(row, FIELD_ALIASES.source_description),
      selling_points: getCell(row, FIELD_ALIASES.selling_points),
      copy_count: parseCopyCount(getCell(row, FIELD_ALIASES.copy_count)),
      languages: normalizeLanguages(getCell(row, FIELD_ALIASES.languages)),
      attributes,
      status: categoryId ? 'draft' : 'needs_review',
      error_message: null,
    }
  })

  const validProducts = products.filter((product) => product.sku)
  const failed = products.length - validProducts.length
  if (failed > 0) {
    warnings.push(`${failed} 行缺少 SKU，已跳过。`)
  }

  if (validProducts.length === 0) {
    return NextResponse.json({ error: 'No valid SKU rows found', warnings }, { status: 400 })
  }

  const { data: existingProducts } = await supabase
    .from('products')
    .select('sku')
    .eq('user_id', user.id)
    .in('sku', validProducts.map((product) => product.sku))

  const existingSkuSet = new Set((existingProducts || []).map((product) => product.sku))

  const { error: upsertError } = await supabase
    .from('products')
    .upsert(validProducts, { onConflict: 'user_id,sku' })

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message, warnings }, { status: 500 })
  }

  const updated = validProducts.filter((product) => existingSkuSet.has(product.sku)).length
  const created = validProducts.length - updated

  return NextResponse.json({
    success: true,
    total_rows: rows.length,
    imported: validProducts.length,
    created,
    updated,
    failed,
    attributes_created: missingColumns.length,
    warnings: Array.from(new Set(warnings)),
  })
}
