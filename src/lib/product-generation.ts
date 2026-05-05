import { DEFAULT_PROMPT_ROLES, PRODUCT_LANGUAGES, normalizeProductImageRole } from './types'

export type ProductPromptInput = {
  sku: string
  sourceTitle: string
  sourceDescription: string
  sellingPoints?: string | null
  categoryName?: string | null
  attributes?: Record<string, string>
  languageLabel: string
  copyIndex: number
  promptRole?: string | null
  ruleText?: string | null
  seoKeywordText?: string | null
}

const PLATFORM_RED_LINES = [
  '禁止医疗、治疗、治愈、预防疾病、药用级、抗过敏、抗菌、保证美白、保证瘦身、永久有效等医疗或夸大表达。',
  '禁止 No.1、best ever、cheapest、100% original、官方认证、平台认证、虚假证书、虚假成分或无法验证的功效。',
  '禁止站外导流、联系方式、网址、二维码、社媒账号、竞品平台名称或竞品品牌蹭词。',
  '不得改变商品事实：品牌、包装、logo、颜色、规格、数量、材质、适用对象、可见文字必须以原始资料和参考图为准。',
]

const COPY_VARIATIONS = [
  '偏电商搜索友好，标题结构清晰，描述更强调核心卖点和规格。',
  '偏生活使用场景，描述更强调使用感、场景和适用人群。',
  '偏详情页信息表达，描述更强调材质、容量、包装和注意事项。',
  '偏礼品/套装/陈列氛围，语言更适合人工上架时直接参考。',
  '偏简洁高转化表达，避免长句，卖点顺序与其他副本不同。',
  '偏专业稳妥表达，合规优先，弱化任何可能夸大的效果词。',
]

const COMPLIANCE_REWRITE_GUIDANCE = [
  '你不是翻译器，也不是照抄器。你需要在不改变商品事实的前提下，把原始标题/描述改写成更适合 Shopee 上架的安全电商表达。',
  '必须保留：真实品牌名、真实产品系列/型号、真实规格、真实容量/数量、真实材质、真实颜色、包装内真实可见信息。',
  '可以改写：形容词、卖点排序、使用场景、人群表达、标题结构、描述段落表达、过度承诺、医疗/治疗暗示、绝对化安全词。',
  '如果原始内容里有风险表达，不要因为原文写了就照抄；请主动替换成更中性的电商表达。',
  '不要把成分自动推导成功效。例如看到 Benzoyl Peroxide、Salicylic Acid、Collagen、Vitamin C，只能作为“成分/配方信息”保守呈现，不能写治疗、治愈、预防疾病或保证效果。',
  '敏感皮肤/功效改写示例：',
  '- treat/cure/heal/prevent/remove acne -> helps cleanse skin and support a fresh, balanced feel',
  '- acne-prone skin -> blemish-prone or oily skin',
  '- active ingredient -> featured ingredient 或 listed ingredient',
  '- clearer complexion / clear-looking skin -> fresh-looking complexion / refreshed skin feel',
  '- safe for everyone / including babies -> suitable for daily use when used as directed',
  '- chemical-free / without harmful chemicals -> fragrance-free 或 made for daily use as directed（仅在原资料支持时保留 fragrance-free）',
  '- consult a healthcare professional -> follow the product label before use',
  '- guaranteed / No.1 / cheapest / clinically proven / medical grade -> 删除或替换成克制、可验证的描述',
  '标题允许优化，但不要改掉真实品牌和产品系列。可以把风险人群词换成更安全的场景词或属性词。',
]

const IMAGE_ROLE_GUIDANCE: Record<string, string> = {
  main: '主图：干净白底或浅色背景的商品展示图。主体居中、边缘清晰、包装完整，不添加夸张装饰。',
  scene: '场景图：生活使用场景。用少量真实道具和环境表达使用方式，商品仍然是画面核心，不制造虚假效果对比。',
  detail: '详情图：卖点/规格信息图。用 3-4 个短卖点模块表达真实可验证的信息，文字少而准确。',
}

export function getLanguageLabel(code: string) {
  return PRODUCT_LANGUAGES.find((language) => language.code === code)?.label || code
}

export function getPromptRoleLabel(role: string, number: number) {
  const normalizedRole = normalizeProductImageRole(role)
  return DEFAULT_PROMPT_ROLES.find((item) => item.value === normalizedRole)?.label || `自定义图 ${number}`
}

function getCopyVariation(copyIndex: number) {
  return COPY_VARIATIONS[(Math.max(copyIndex, 1) - 1) % COPY_VARIATIONS.length]
}

function formatAttributes(attributes?: Record<string, string>) {
  const lines = Object.entries(attributes || {})
    .filter(([, value]) => String(value || '').trim())
    .map(([key, value]) => `${key}: ${value}`)

  return lines.length ? lines.join('\n') : '无'
}

function formatSharedContext(input: ProductPromptInput) {
  return [
    `SKU: ${input.sku}`,
    `商品类目: ${input.categoryName || '未指定'}`,
    `原始标题: ${input.sourceTitle || '未提供'}`,
    `原始描述: ${input.sourceDescription || '未提供'}`,
    `卖点补充: ${input.sellingPoints || '未填写，请只从原始标题、描述、属性、类目和参考图中提炼真实卖点。'}`,
    `自定义属性:\n${formatAttributes(input.attributes)}`,
  ].join('\n')
}

export function buildProductImagePrompt(template: string, input: ProductPromptInput) {
  const normalizedRole = normalizeProductImageRole(input.promptRole)
  const roleGuidance = IMAGE_ROLE_GUIDANCE[normalizedRole || ''] || template.trim()

  return [
    template.trim(),
    '',
    '【本张图片任务】',
    roleGuidance,
    '',
    '【商品上下文】',
    formatSharedContext(input),
    '',
    input.seoKeywordText || '【SEO 关键词库】未配置。图片文字只能从原始商品信息中提炼真实卖点。',
    '',
    '【副本差异化要求】',
    `当前副本: ${input.languageLabel}${input.copyIndex}`,
    `差异化方向: ${getCopyVariation(input.copyIndex)}`,
    `如果图片中需要文字，必须使用${input.languageLabel}；文字要短、准确、可读，不要生成大段小字。`,
    '不同图片之间可在构图、背景、道具、光线、局部文字和信息层级上做轻微差异，但不得改变商品本体、包装、标签、logo、颜色、比例和可见文字。',
    '',
    '【强制参考图规则】',
    '上传的原始参考图是唯一产品依据。必须保持产品外观、包装、logo、颜色、标签、材质和比例一致。',
    '不要生成不存在的套装、赠品、认证章、功效对比、前后对比、虚构成分、虚构尺寸或虚构使用效果。',
    '',
    '【通用合规规则】',
    input.ruleText || PLATFORM_RED_LINES.join('\n'),
  ].join('\n')
}

export function buildTitleDescriptionPrompt(input: ProductPromptInput) {
  return [
    '你是 Shopee 电商商品标题和商品描述编辑。请基于原始商品信息生成一个可上架的新标题和新描述。',
    '必须只输出 JSON，不要 Markdown，不要解释。',
    '',
    '【目标】',
    `语言: ${input.languageLabel}`,
    `副本: ${input.languageLabel}${input.copyIndex}`,
    `差异化方向: ${getCopyVariation(input.copyIndex)}`,
    '不同副本之间要有表达差异，但不能改变商品事实，不能新增原资料没有的功效、成分、规格、认证或适用范围。',
    '',
    '【商品信息】',
    formatSharedContext(input),
    '',
    '【标题规则】',
    '1. 标题必须自然包含核心词，核心词尽量靠前，但不能堆词。',
    '2. 推荐结构：品牌/产品系列 + 核心词 + 真实关键属性/规格 + 安全使用场景。',
    '3. 不要使用表情符号、hashtag、HTML、站外联系方式、竞品平台名、极限词、医疗词或虚假认证。',
    '4. 标题尽量控制在 25-120 个字符之间，清晰、可读、适合人工上架。',
    '5. 如果原始标题含有治疗、疾病人群或强功效词，请保留真实产品名/品牌，但把风险描述改成更中性的电商关键词。',
    '',
    input.seoKeywordText || '【SEO 关键词库】未配置。请优先从原始标题、描述、属性和类目中提炼真实关键词，不要编造搜索词。',
    '',
    '【强制合规改写策略】',
    COMPLIANCE_REWRITE_GUIDANCE.join('\n'),
    '',
    '【描述固定结构】',
    '请按以下 6 个段落输出，每个段落标题也使用目标语言：',
    '重要：description 必须是纯文本。禁止输出 HTML 标签、XML 标签、Markdown 标题符号、代码块或富文本标签；不要出现 <h3>、</h3>、<ul>、<li>、**、### 这类符号。',
    '段落标题直接写文字，例如英文写 “Core Selling Points”，中文写 “核心卖点”。每段之间用换行分隔；列表请用普通短横线 "- "，不要用 HTML。',
    '1. 核心卖点：真实、克制地说明产品主要价值。',
    '2. 规格参数：写尺寸、容量、数量、材质、颜色等原资料可确认的信息；不知道就写“请以实物/包装标示为准”的目标语言表达。',
    '3. 使用场景：说明日常、旅行、家庭、办公、礼品等合理场景。',
    '4. 适用人群：只写合理人群，不要写疾病人群或医疗适用。',
    '5. 包装内容：根据原资料说明包装内容，不确定时用保守表达。',
    '6. 注意事项：提醒按包装说明使用、避免夸大承诺、如有不适停止使用等合规表达。',
    '',
    '【平台红线】',
    input.ruleText || PLATFORM_RED_LINES.join('\n'),
    '',
    '【输出格式】',
    'JSON 字符串里的 description 可以包含换行符，但内容只能是纯文本。',
    '{"title":"...","description":"..."}',
  ].join('\n')
}

export function defaultMainPrompt(categoryName: string, variant: 1 | 2) {
  if (variant === 1) {
    return `使用上传的原始参考图作为唯一产品依据，为 ${categoryName} 生成主图 1：干净白底或浅色背景商品展示图。保持产品包装、logo、颜色、标签、比例和可见文字完全一致；主体清晰居中，有自然阴影，画面适合 Shopee 商品首图。不要添加虚假认证、夸张功效文字、赠品、前后对比或站外信息。`
  }

  return `使用上传的原始参考图作为唯一产品依据，为 ${categoryName} 生成主图 2：更强电商视觉的商品展示图。可以使用浅色台面、柔和光影和高级质感背景突出包装与质感，但不得改变产品本体、包装、logo、颜色、比例和文字。画面干净、可直接上架，不要出现虚假效果、认证章或站外联系方式。`
}

export function defaultScenePrompt(categoryName: string, variant: 1 | 2) {
  if (variant === 1) {
    return `使用上传的原始参考图作为唯一产品依据，为 ${categoryName} 生成场景图 1：生活使用场景。商品保持真实不变，可加入合理环境和少量道具表达日常使用方式；不要夸大效果、不要医疗宣称、不要前后对比、不要改变包装或 logo。`
  }

  return `使用上传的原始参考图作为唯一产品依据，为 ${categoryName} 生成场景图 2：目标人群或使用环境图。可出现手部、桌面、浴室、梳妆台、厨房、客厅或旅行场景等合理元素，商品必须清晰可见且不变形，不添加虚构功效、虚假认证或站外信息。`
}

export function defaultDetailPrompt(categoryName: string, variant: 1 | 2) {
  if (variant === 1) {
    return `使用上传的原始参考图作为唯一产品依据，为 ${categoryName} 生成详情图 1：卖点信息图。保持产品包装、logo、颜色、标签、比例和可见文字不变；画面以产品为核心，加入 3-4 个真实、克制、可验证的短卖点模块，例如适用场景、使用感、规格/容量、材质/质地或包装内容。文字少而准确，禁止医疗、治疗、保证效果、虚假认证和站外信息。`
  }

  return `使用上传的原始参考图作为唯一产品依据，为 ${categoryName} 生成详情图 2：规格/材质/使用方式说明图。保持产品本体和包装信息不变；重点展示局部质感、包装细节、使用步骤、规格参数或包装内容。文字必须保守准确，不知道的信息不要编造。整体像电商平台可直接使用的详情图，信息层次明确，适合 1:1 正方形构图。`
}
