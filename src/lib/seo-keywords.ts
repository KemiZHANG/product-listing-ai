import { sanitizeListingText } from './listing-text'

export type SeoKeywordType =
  | 'core'
  | 'long_tail'
  | 'attribute'
  | 'scene'
  | 'audience'
  | 'forbidden'

export interface SeoKeyword {
  id: string
  keyword: string
  type: SeoKeywordType
  priority: number
  note?: string
}

export interface SeoKeywordBank {
  category_id: string
  language_code: string
  keywords: SeoKeyword[]
  active?: boolean
  updated_at?: string
  rule_id?: string
}

export type SeoScoreResult = {
  score: number
  matched_keywords: string[]
  forbidden_keywords: string[]
  suggestions: string[]
}

export const SEO_KEYWORD_RULE_PREFIX = 'SEO Keywords::'

export const GLOBAL_FORBIDDEN_KEYWORDS = [
  'cure',
  'treat disease',
  'medical grade',
  'clinically proven',
  'guaranteed whitening',
  'guaranteed weight loss',
  'No.1',
  'cheapest',
  '100% original',
  'official certified',
  'WhatsApp',
  'Telegram',
  'http://',
  'https://',
]

export const SEO_KEYWORD_TYPES: Array<{ value: SeoKeywordType; label: string; hint: string }> = [
  { value: 'core', label: '核心词', hint: '标题里必须自然出现的商品主词，优先靠前。' },
  { value: 'long_tail', label: '长尾词', hint: '更细分的搜索词或需求词，用于覆盖具体购买意图。' },
  { value: 'attribute', label: '属性词', hint: '材质、颜色、规格、质地、容量、风格等真实属性。' },
  { value: 'scene', label: '场景词', hint: '日常、旅行、办公、礼品、节日、家用等使用场景。' },
  { value: 'audience', label: '人群词', hint: '适用对象、年龄段、性别、家庭成员或使用角色。' },
  { value: 'forbidden', label: '禁用词', hint: '标题、描述、图片文字中都不得出现的词。' },
]

export function buildSeoKeywordRuleName(categoryId: string, languageCode: string) {
  return `${SEO_KEYWORD_RULE_PREFIX}${categoryId}::${languageCode}`
}

export function normalizeSeoKeywords(value: unknown): SeoKeyword[] {
  if (!Array.isArray(value)) return []
  const allowed = new Set(SEO_KEYWORD_TYPES.map((item) => item.value))

  return value
    .map((item, index) => {
      const raw = item as Partial<SeoKeyword>
      const keyword = String(raw.keyword || '').trim()
      const type = allowed.has(raw.type as SeoKeywordType) ? raw.type as SeoKeywordType : 'long_tail'
      const priority = Math.min(Math.max(Math.floor(Number(raw.priority || 3)), 1), 5)
      const note = String(raw.note || '').trim()

      return {
        id: String(raw.id || `${Date.now()}-${index}`),
        keyword,
        type,
        priority,
        ...(note ? { note } : {}),
      }
    })
    .filter((item) => item.keyword)
}

export function dedupeSeoKeywords(keywords: SeoKeyword[]) {
  const merged = new Map<string, SeoKeyword>()
  for (const item of normalizeSeoKeywords(keywords)) {
    const key = `${item.type}:${item.keyword.trim().toLowerCase()}`
    const current = merged.get(key)
    if (!current || item.priority > current.priority) merged.set(key, item)
  }
  return Array.from(merged.values())
}

export function parseSeoKeywordBank(content: string): SeoKeywordBank | null {
  try {
    const parsed = JSON.parse(content || '{}') as Partial<SeoKeywordBank> & { type?: string }
    if (parsed.type !== 'seo_keyword_bank') return null
    const categoryId = String(parsed.category_id || '').trim()
    const languageCode = String(parsed.language_code || '').trim()
    if (!categoryId || !languageCode) return null
    return {
      category_id: categoryId,
      language_code: languageCode,
      keywords: normalizeSeoKeywords(parsed.keywords),
      active: parsed.active !== false,
      updated_at: parsed.updated_at,
    }
  } catch {
    return null
  }
}

export function serializeSeoKeywordBank(bank: SeoKeywordBank) {
  return JSON.stringify({
    type: 'seo_keyword_bank',
    category_id: bank.category_id,
    language_code: bank.language_code,
    keywords: dedupeSeoKeywords(bank.keywords),
    active: bank.active !== false,
    updated_at: new Date().toISOString(),
  })
}

export function isSeoKeywordRule(name?: string | null, content?: string | null) {
  if (name?.startsWith(SEO_KEYWORD_RULE_PREFIX)) return true
  return Boolean(content && parseSeoKeywordBank(content))
}

export function formatSeoKeywordPrompt(bank?: SeoKeywordBank | null) {
  const keywords = normalizeSeoKeywords(bank?.keywords)
  if (keywords.length === 0) return ''

  const byType = new Map<SeoKeywordType, SeoKeyword[]>()
  for (const item of keywords) {
    const list = byType.get(item.type) || []
    list.push(item)
    byType.set(item.type, list)
  }

  const lines = SEO_KEYWORD_TYPES.flatMap((type) => {
    const items = (byType.get(type.value) || [])
      .sort((a, b) => b.priority - a.priority)
      .map((item) => `${item.keyword}${item.note ? ` (${item.note})` : ''}`)
    return items.length ? [`${type.label}: ${items.join(', ')}`] : []
  })

  return [
    '【SEO 关键词库】',
    ...lines,
    '',
    '使用要求：',
    '- 标题优先把最高优先级核心词自然放在前 20-25 个字符范围内。',
    '- 每个副本选择不同的长尾词、属性词、场景词组合，避免标题和描述重复。',
    '- 关键词必须自然融入，不要堆砌，不要牺牲可读性。',
    '- 禁用词不得出现在标题、描述或图片文字中。',
    '- 如果关键词与原始商品信息冲突，优先保持商品真实性，不要硬塞关键词。',
  ].join('\n')
}

function includesKeyword(content: string, keyword: string) {
  return content.includes(keyword.trim().toLowerCase())
}

export function scoreSeoContent(title: string, description: string, bank?: SeoKeywordBank | null): SeoScoreResult {
  const cleanTitle = sanitizeListingText(title)
  const cleanDescription = sanitizeListingText(description)
  const normalizedTitle = cleanTitle.toLowerCase()
  const content = `${cleanTitle}\n${cleanDescription}`.toLowerCase()
  const hasContent = Boolean(cleanTitle || cleanDescription)
  if (!hasContent) {
    return {
      score: 0,
      matched_keywords: [],
      forbidden_keywords: [],
      suggestions: ['请先输入标题和描述后再评分。'],
    }
  }

  const bankKeywords = normalizeSeoKeywords(bank?.keywords)
  const globalForbidden = GLOBAL_FORBIDDEN_KEYWORDS.map((keyword) => ({
    id: `global-${keyword.toLowerCase()}`,
    keyword,
    type: 'forbidden' as const,
    priority: 5,
    note: 'global forbidden',
  }))
  const keywords = dedupeSeoKeywords([...bankKeywords, ...globalForbidden])
  const coreKeywords = keywords.filter((item) => item.type === 'core')
  const positiveKeywords = keywords.filter((item) => item.type !== 'forbidden')
  const forbiddenKeywords = keywords.filter((item) => item.type === 'forbidden')

  const matched = positiveKeywords.filter((item) => includesKeyword(content, item.keyword))
  const forbiddenMatched = forbiddenKeywords.filter((item) => includesKeyword(content, item.keyword))
  const firstCore = coreKeywords.find((item) => includesKeyword(normalizedTitle, item.keyword))
  const coreEarly = firstCore ? normalizedTitle.indexOf(firstCore.keyword.toLowerCase()) <= 25 : false
  const hasBank = bankKeywords.some((item) => item.type !== 'forbidden')

  let score = 45

  if (cleanTitle.length >= 35 && cleanTitle.length <= 115) score += 12
  else if (cleanTitle.length >= 25 && cleanTitle.length <= 130) score += 8
  else score -= 8

  if (cleanDescription.length >= 180) score += 10
  else if (cleanDescription.length >= 100) score += 6
  else score -= 8

  const normalizedDescription = cleanDescription.toLowerCase()
  const descriptionSections = [
    ['卖点', 'selling point', 'key feature'],
    ['规格', 'specification', 'details'],
    ['场景', 'usage', 'scenario', 'use case'],
    ['人群', 'applicable', 'suitable', 'users', 'audience'],
    ['包装', 'package', 'contents', 'included'],
    ['注意', 'precaution', 'notes', 'care'],
  ]
  const sectionHits = descriptionSections.filter((group) =>
    group.some((hint) => normalizedDescription.includes(hint.toLowerCase()))
  ).length
  score += Math.min(sectionHits * 3, 15)

  if (hasBank) {
    if (firstCore) score += 18
    else score -= 12
    if (coreEarly) score += 10
    score += Math.min(matched.length * 4, 20)
  } else {
    score += 8
  }

  if (forbiddenMatched.length > 0) score -= 35

  const suggestions = [
    hasBank && !firstCore ? '标题缺少当前类目核心词。' : '',
    firstCore && !coreEarly ? '核心词位置偏后，建议放到标题开头。' : '',
    hasBank && matched.length < 3 ? '可自然补充更多属性词、场景词或长尾词。' : '',
    !hasBank ? '当前类目/语言还没有运营词库，已按标题长度、描述结构和禁词风险给基础分。' : '',
    forbiddenMatched.length > 0 ? '发现禁用词，请删除或替换。' : '',
    cleanTitle.length < 25 ? '标题偏短，可以补充真实规格或场景词。' : '',
    cleanTitle.length > 130 ? '标题偏长，建议精简，避免堆词。' : '',
    cleanDescription.length < 120 ? '描述偏短，建议补齐卖点、规格、场景、人群、包装和注意事项。' : '',
  ].filter(Boolean)

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    matched_keywords: matched.map((item) => item.keyword),
    forbidden_keywords: forbiddenMatched.map((item) => item.keyword),
    suggestions,
  }
}
