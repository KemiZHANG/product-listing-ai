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

export const SEO_KEYWORD_RULE_PREFIX = 'SEO Keywords::'

export const SEO_KEYWORD_TYPES: Array<{ value: SeoKeywordType; label: string; hint: string }> = [
  { value: 'core', label: '核心词', hint: '必须靠前出现的商品主词' },
  { value: 'long_tail', label: '长尾词', hint: '更细分的搜索词或需求词' },
  { value: 'attribute', label: '属性词', hint: '材质、颜色、规格、功效边界内的特征' },
  { value: 'scene', label: '场景词', hint: '使用场景、季节、礼物、通勤等' },
  { value: 'audience', label: '人群词', hint: '适用对象、年龄段、性别或机型' },
  { value: 'forbidden', label: '禁用词', hint: '不得出现在标题和描述里的词' },
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
    keywords: normalizeSeoKeywords(bank.keywords),
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
    '【SEO关键词库】',
    ...lines,
    '',
    '使用要求：',
    '- 标题优先把最高优先级核心词放在前 20-25 个字符范围内。',
    '- 每个副本选择不同的长尾词、属性词、场景词组合，避免标题和描述重复。',
    '- 关键词必须自然融入，不要堆砌，不要牺牲可读性。',
    '- 禁用词不得出现在标题、描述或图片文字中。',
    '- 如果关键词与原始商品信息冲突，优先保持商品真实性，不要硬塞关键词。',
  ].join('\n')
}

export function scoreSeoContent(title: string, description: string, bank?: SeoKeywordBank | null) {
  const keywords = normalizeSeoKeywords(bank?.keywords)
  const content = `${title}\n${description}`.toLowerCase()
  const normalizedTitle = title.toLowerCase()
  const coreKeywords = keywords.filter((item) => item.type === 'core')
  const positiveKeywords = keywords.filter((item) => item.type !== 'forbidden')
  const forbiddenKeywords = keywords.filter((item) => item.type === 'forbidden')

  const matched = positiveKeywords.filter((item) => content.includes(item.keyword.toLowerCase()))
  const forbiddenMatched = forbiddenKeywords.filter((item) => content.includes(item.keyword.toLowerCase()))
  const firstCore = coreKeywords.find((item) => normalizedTitle.includes(item.keyword.toLowerCase()))
  const coreEarly = firstCore
    ? normalizedTitle.indexOf(firstCore.keyword.toLowerCase()) <= 25
    : false

  let score = 40
  if (firstCore) score += 20
  if (coreEarly) score += 15
  score += Math.min(matched.length * 4, 20)
  if (title.length >= 25 && title.length <= 120) score += 5
  if (forbiddenMatched.length > 0) score -= 35

  return {
    score: Math.max(0, Math.min(100, score)),
    matched_keywords: matched.map((item) => item.keyword),
    forbidden_keywords: forbiddenMatched.map((item) => item.keyword),
    suggestions: [
      !firstCore ? '标题缺少核心词。' : '',
      firstCore && !coreEarly ? '核心词位置偏后，建议放到标题开头。' : '',
      matched.length < 3 ? '可自然补充更多属性词、场景词或长尾词。' : '',
      forbiddenMatched.length > 0 ? '发现禁用词，请删除或替换。' : '',
    ].filter(Boolean),
  }
}
