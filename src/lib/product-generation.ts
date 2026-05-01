import { DEFAULT_PROMPT_ROLES, PRODUCT_LANGUAGES } from './types'

export type ProductPromptInput = {
  sku: string
  sourceTitle: string
  sourceDescription: string
  sellingPoints?: string | null
  categoryName?: string | null
  attributes?: Record<string, string>
  languageLabel: string
  copyIndex: number
  ruleText?: string | null
  seoKeywordText?: string | null
}

export function getLanguageLabel(code: string) {
  return PRODUCT_LANGUAGES.find((language) => language.code === code)?.label || code
}

export function getPromptRoleLabel(role: string, number: number) {
  return DEFAULT_PROMPT_ROLES.find((item) => item.value === role)?.label || `自定义图 ${number}`
}

function getCopyVariation(copyIndex: number) {
  const variations = [
    '更偏干净高级的电商陈列感，背景极简，突出商品本体和质感。',
    '更偏生活化使用场景，加入少量真实道具或环境元素，突出使用感。',
    '更偏细节卖点表达，突出材质、容量、包装、结构或核心功能点。',
    '更偏礼盒/套装/陈列氛围，构图更有层次，但不改变商品本体信息。',
    '更偏清爽明亮的社媒电商风格，视觉轻盈，适合多语言副本区分。',
    '更偏专业详情页风格，信息排版更理性，卖点顺序与其他副本不同。',
  ]
  return variations[(Math.max(copyIndex, 1) - 1) % variations.length]
}

export function buildProductImagePrompt(template: string, input: ProductPromptInput) {
  const attributes = Object.entries(input.attributes || {})
    .filter(([, value]) => String(value || '').trim())
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')

  return [
    template.trim(),
    '',
    '【商品上下文】',
    `SKU: ${input.sku}`,
    `商品类目: ${input.categoryName || '未指定'}`,
    `原始标题: ${input.sourceTitle || '未提供'}`,
    `原始描述: ${input.sourceDescription || '未提供'}`,
    input.sellingPoints ? `卖点补充: ${input.sellingPoints}` : '卖点补充: 未填写，请从商品图片、标题、描述和类目中提炼真实卖点。',
    attributes ? `自定义属性:\n${attributes}` : '自定义属性: 无',
    '',
    input.seoKeywordText || '【SEO关键词库】未配置。图片文字只能从原始商品信息中提炼真实卖点。',
    '',
    '【副本差异化要求】',
    `当前副本: ${input.languageLabel}${input.copyIndex}`,
    `本副本差异化方向: ${getCopyVariation(input.copyIndex)}`,
    `图片中的新增文字必须使用${input.languageLabel}。如果模型无法稳定写长文字，只放短词或短句，并优先保证商品真实、清晰、合规。`,
    '在构图、背景、道具、光线、局部文字、细节呈现上做轻微差异，不要与其他副本完全相同，但不得改变商品本体、包装、标签、logo、颜色、比例和可见文字。',
    '',
    '【通用合规规则】',
    input.ruleText || '避免夸大功效、医疗宣称、虚假认证、前后对比、站外联系方式、竞品平台内容和不实成分表述。',
  ].join('\n')
}

export function buildTitleDescriptionPrompt(input: ProductPromptInput) {
  const attributes = Object.entries(input.attributes || {})
    .filter(([, value]) => String(value || '').trim())
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')

  return [
    '你是电商平台商品标题和商品描述编辑。请基于原始商品信息，生成一个用于上架的新标题和新描述。',
    '',
    '【目标】',
    `语言: ${input.languageLabel}`,
    `副本: ${input.languageLabel}${input.copyIndex}`,
    `本副本差异化方向: ${getCopyVariation(input.copyIndex)}`,
    '保持原始含义，不要大幅改写成另一个商品。不同副本之间要有轻微表达差异，但不能新增虚假卖点。',
    '',
    '【商品信息】',
    `SKU: ${input.sku}`,
    `商品类目: ${input.categoryName || '未指定'}`,
    `原始标题: ${input.sourceTitle || '未提供'}`,
    `原始描述: ${input.sourceDescription || '未提供'}`,
    input.sellingPoints ? `卖点补充: ${input.sellingPoints}` : '卖点补充: 未填写',
    attributes ? `自定义属性:\n${attributes}` : '自定义属性: 无',
    '',
    '【标题规则】',
    '按“核心词 + 长尾词 + 属性词 + 场景词”组织。核心词靠前。不要关键词堆砌，不要表情符号，不要 hashtag，不要竞品品牌，不要极限词，不要医疗级/治疗/治愈/药用等表达。',
    '',
    input.seoKeywordText || '【SEO关键词库】未配置。请优先从原始标题、描述、属性和类目中提炼真实关键词，不要编造搜索词。',
    '',
    '【描述规则】',
    '按以下结构输出：核心卖点、规格参数、使用说明/适用人群、包裹内容、售后说明。分段清晰，避免站外联系方式、平台名导流、虚假宣传、乱码、HTML。',
    '',
    '【平台红线】',
    input.ruleText || '避免夸大功效、医疗宣称、虚假认证、前后对比、站外联系方式、竞品平台内容和不实成分表述。',
    '',
    '【输出格式】',
    '只输出 JSON，不要 Markdown，不要解释：',
    '{"title":"...","description":"..."}',
  ].join('\n')
}

export function defaultDetailPrompt(categoryName: string, variant: 1 | 2) {
  if (variant === 1) {
    return `以我上传的所有产品原图为唯一产品参考，严格保持产品外观、包装、标签、logo、颜色、比例和可见文字不变。生成一张${categoryName}商品详情图，画面以产品为核心，加入清晰的信息分区和少量短文字卖点，文字需根据商品标题、描述、类目和卖点自动提炼，不要编造功效或成分。详情图应包含2-4个真实、克制、可验证的卖点模块，例如适用场景、使用感、规格/容量、材质/质地或包装内容。版式要高级、干净、有电商详情页质感，留白清晰，适合1:1正方形图片。`
  }

  return `以我上传的所有产品原图为唯一产品参考，严格保持产品本体和包装信息不变。生成一张${categoryName}商品细节说明图，重点展示产品局部质感、包装细节、使用方式或场景辅助元素，并根据商品描述自动提炼短文字说明。文字必须少而准确，避免医疗、治疗、极限词、认证章、前后对比、站外联系信息和无依据成分功效。整体应像电商平台可直接使用的详情图，信息层次明确，视觉干净，1:1正方形构图。`
}
