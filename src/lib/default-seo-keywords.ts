import type { SupabaseClient } from '@supabase/supabase-js'
import { PRODUCT_LANGUAGES, type Category } from './types'
import {
  buildSeoKeywordRuleName,
  dedupeSeoKeywords,
  normalizeSeoKeywords,
  serializeSeoKeywordBank,
  type SeoKeyword,
  type SeoKeywordType,
} from './seo-keywords'

type CategoryLike = Pick<Category, 'id' | 'name_zh' | 'slug'>

const LANGUAGE_KEYWORD_TEMPLATES: Record<string, {
  longTail: string[]
  attributes: string[]
  scenes: string[]
  audiences: string[]
  forbidden: string[]
}> = {
  en: {
    longTail: ['{base} for daily use', '{base} online', '{base} for Shopee listing', '{base} Malaysia', 'affordable {base}'],
    attributes: ['premium', 'durable', 'lightweight', 'easy to use', 'compact', 'gentle'],
    scenes: ['daily use', 'home use', 'travel', 'office', 'gift'],
    audiences: ['women', 'men', 'family', 'kids', 'adults'],
    forbidden: ['cure', 'medical grade', 'guaranteed', '100% original', 'cheapest', 'No.1'],
  },
  ms: {
    longTail: ['{base} untuk kegunaan harian', '{base} online', '{base} Shopee', '{base} Malaysia', '{base} mampu milik'],
    attributes: ['berkualiti', 'tahan lama', 'ringan', 'mudah digunakan', 'praktikal', 'lembut'],
    scenes: ['kegunaan harian', 'rumah', 'perjalanan', 'pejabat', 'hadiah'],
    audiences: ['wanita', 'lelaki', 'keluarga', 'kanak-kanak', 'dewasa'],
    forbidden: ['sembuh', 'rawatan', 'gred perubatan', '100% original', 'termurah', 'No.1'],
  },
  fil: {
    longTail: ['{base} for daily use', '{base} online', '{base} sa Shopee', 'affordable {base}', '{base} para sa bahay'],
    attributes: ['premium', 'matibay', 'magaan', 'madaling gamitin', 'compact', 'banayad'],
    scenes: ['araw-araw', 'bahay', 'biyahe', 'opisina', 'pangregalo'],
    audiences: ['babae', 'lalaki', 'pamilya', 'bata', 'adult'],
    forbidden: ['gamot', 'lunas', 'medical grade', '100% original', 'pinakamura', 'No.1'],
  },
  id: {
    longTail: ['{base} untuk pemakaian harian', '{base} online', '{base} Shopee', '{base} Malaysia', '{base} praktis'],
    attributes: ['premium', 'awet', 'ringan', 'mudah digunakan', 'praktis', 'lembut'],
    scenes: ['harian', 'rumah', 'travel', 'kantor', 'hadiah'],
    audiences: ['wanita', 'pria', 'keluarga', 'anak', 'dewasa'],
    forbidden: ['menyembuhkan', 'pengobatan', 'kelas medis', '100% original', 'termurah', 'No.1'],
  },
  th: {
    longTail: ['{base} สำหรับใช้ประจำวัน', '{base} ออนไลน์', '{base} Shopee', '{base} สำหรับบ้าน', '{base} พกพาสะดวก'],
    attributes: ['คุณภาพดี', 'ทนทาน', 'น้ำหนักเบา', 'ใช้งานง่าย', 'ขนาดกะทัดรัด', 'อ่อนโยน'],
    scenes: ['ใช้ประจำวัน', 'ใช้ที่บ้าน', 'เดินทาง', 'สำนักงาน', 'ของขวัญ'],
    audiences: ['ผู้หญิง', 'ผู้ชาย', 'ครอบครัว', 'เด็ก', 'ผู้ใหญ่'],
    forbidden: ['รักษา', 'ทางการแพทย์', 'รับประกันผล', '100% original', 'ถูกที่สุด', 'No.1'],
  },
  vi: {
    longTail: ['{base} dùng hằng ngày', '{base} online', '{base} Shopee', '{base} cho gia đình', '{base} tiện dụng'],
    attributes: ['cao cấp', 'bền', 'nhẹ', 'dễ sử dụng', 'nhỏ gọn', 'dịu nhẹ'],
    scenes: ['dùng hằng ngày', 'ở nhà', 'du lịch', 'văn phòng', 'quà tặng'],
    audiences: ['phụ nữ', 'nam giới', 'gia đình', 'trẻ em', 'người lớn'],
    forbidden: ['chữa khỏi', 'điều trị', 'cấp y tế', '100% original', 'rẻ nhất', 'No.1'],
  },
}

function keywordId(type: SeoKeywordType, value: string) {
  return `${type}-${value.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\u0e00-\u0e7f]+/gi, '-').replace(/^-|-$/g, '')}`
}

function cleanBase(category: CategoryLike) {
  const fromSlug = category.slug.replace(/[-_]+/g, ' ').trim()
  return fromSlug || category.name_zh.trim() || 'product'
}

function baseCategorySlug(slug: string) {
  return slug.replace(/-migrated-\d+$/, '')
}

function uniqueCategories(categories: CategoryLike[]) {
  const bySlug = new Map<string, CategoryLike>()
  for (const category of categories) {
    const key = `${baseCategorySlug(category.slug)}:${category.name_zh}`
    const existing = bySlug.get(key)
    if (!existing || category.slug === baseCategorySlug(category.slug)) {
      bySlug.set(key, category)
    }
  }
  return Array.from(bySlug.values())
}

function makeKeyword(type: SeoKeywordType, keyword: string, priority: number, note?: string): SeoKeyword {
  return {
    id: keywordId(type, keyword),
    keyword,
    type,
    priority,
    ...(note ? { note } : {}),
  }
}

export function mergeSeoKeywords(existing: SeoKeyword[], incoming: SeoKeyword[]) {
  return dedupeSeoKeywords(normalizeSeoKeywords([...existing, ...incoming]))
}

export function buildDefaultSeoKeywords(category: CategoryLike, languageCode: string) {
  const template = LANGUAGE_KEYWORD_TEMPLATES[languageCode] || LANGUAGE_KEYWORD_TEMPLATES.en
  const base = cleanBase(category)
  return normalizeSeoKeywords([
    makeKeyword('core', base, 5, 'category core keyword'),
    ...template.longTail.map((item) => makeKeyword('long_tail', item.replaceAll('{base}', base), 4)),
    ...template.attributes.map((item) => makeKeyword('attribute', item, 3)),
    ...template.scenes.map((item) => makeKeyword('scene', item, 3)),
    ...template.audiences.map((item) => makeKeyword('audience', item, 2)),
    ...template.forbidden.map((item) => makeKeyword('forbidden', item, 5, 'Shopee-safe exclusion')),
  ])
}

export async function ensureDefaultSeoKeywordBanks(
  supabase: SupabaseClient,
  userId: string,
  workspaceKey: string
) {
  const { data: categories } = await supabase
    .from('categories')
    .select('id,name_zh,slug')
    .eq('workspace_key', workspaceKey)

  if (!categories?.length) return

  const categoryList = uniqueCategories(categories as CategoryLike[])
  const expected = categoryList.flatMap((category) => PRODUCT_LANGUAGES.map((language) => ({
    category,
    language,
    name: buildSeoKeywordRuleName(category.id, language.code),
  })))

  const { data: existingRules } = await supabase
    .from('rule_templates')
    .select('name')
    .eq('workspace_key', workspaceKey)
    .like('name', 'SEO Keywords::%')

  const existingNames = new Set((existingRules || []).map((rule) => rule.name))
  const missingRows = expected
    .filter((item) => !existingNames.has(item.name))
    .map((item) => ({
      user_id: userId,
      workspace_key: workspaceKey,
      name: item.name,
      scope: 'title_description',
      content: serializeSeoKeywordBank({
        category_id: item.category.id,
        language_code: item.language.code,
        keywords: buildDefaultSeoKeywords(item.category, item.language.code),
      }),
      active: true,
    }))

  if (missingRows.length > 0) {
    await supabase
      .from('rule_templates')
      .insert(missingRows)
  }
}
