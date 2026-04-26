export const PROMPT_GENERATOR_MODEL = 'gemini-3-flash-preview'

export type PromptGeneratorInput = {
  categoryName: string
  categorySlug: string
  productType?: string
  imageStyle?: string
  peopleMode?: string
  displayMethod?: string
  extraInfo?: string
  existingPrompts?: string[]
}

const categoryGuidance: Record<string, string> = {
  'facial-cleanser': 'clean foam, fresh bathroom counter, water droplets, transparent tray, gentle clean skincare atmosphere',
  toner: 'clear watery texture, transparent glass, water reflection, light blue or clean white atmosphere',
  serum: 'premium skincare, glass dropper feeling, refined reflections, subtle liquid texture, precise luxury composition',
  'face-masks': 'hydrating skincare atmosphere, soft water glow, clean vanity scene, restrained botanical or glass elements',
  lips: 'fashion beauty, glossy texture, mirror reflection, elegant cosmetic counter, refined color harmony',
  'hair-styling': 'professional styling, structured light, sleek lines, salon-inspired product display',
  fragrance: 'luxury fragrance mood, glass reflection, soft shadows, elegant dressing table or editorial still life',
  children: 'gentle safe clean feeling, soft rounded props, warm light, restrained child-care atmosphere',
  sunscreen: 'fresh summer light, airy highlights, clean outdoor or vanity scene, blue-white transparent materials',
}

function getCategoryGuidance(categorySlug: string) {
  const normalized = categorySlug.toLowerCase()
  const direct = categoryGuidance[normalized]
  if (direct) return direct

  if (normalized.includes('cleanser')) return categoryGuidance['facial-cleanser']
  if (normalized.includes('toner')) return categoryGuidance.toner
  if (normalized.includes('serum')) return categoryGuidance.serum
  if (normalized.includes('mask')) return categoryGuidance['face-masks']
  if (normalized.includes('lip')) return categoryGuidance.lips
  if (normalized.includes('hair')) return categoryGuidance['hair-styling']
  if (normalized.includes('child')) return categoryGuidance.children
  if (normalized.includes('sun')) return categoryGuidance.sunscreen

  return 'premium ecommerce product photography, layered display props, clean background, refined light and material details'
}

export function buildPromptGeneratorInstruction() {
  return [
    'You are a senior ecommerce product image prompt architect.',
    'You specialize in prompt generation for beauty, skincare, personal care, fragrance, haircare, and consumer goods.',
    'Your job is not to create an artistic fantasy prompt. Your job is to produce a reliable product-image prompt for an uploaded product reference image.',
    '',
    'Use a modular prompt architecture inspired by professional text-to-image prompt generators:',
    'A. Product Fidelity module',
    'B. Category Context module',
    'C. Scene and Composition module',
    'D. Lighting and Material module',
    'E. People Policy module',
    'F. Ecommerce Compliance module',
    'G. Final Output Format module',
    '',
    'Product Fidelity module:',
    '- The uploaded product image is the only product reference.',
    '- Strictly preserve packaging shape, cap, opening structure, label layout, logo, colors, proportions, and all visible text.',
    '- Do not redesign the product, relabel it, change the text, change the logo, change the package material, or invent new SKU details.',
    '- The product must be complete, sharp, visually central, and more important than any person, prop, or background.',
    '',
    'Category Context module:',
    '- Use the current category and user input to choose reasonable props, textures, scene cues, and atmosphere.',
    '- Add category-appropriate details, but keep them restrained and premium.',
    '- Do not overcrowd the scene.',
    '',
    'Scene and Composition module:',
    '- Build a premium ecommerce hero image or product main image.',
    '- Avoid a plain single-color background unless the user explicitly asks for it.',
    '- Add layered spatial depth with display platforms, glass, acrylic, stone, fabric, mirror reflection, water glow, structured light, or other suitable materials.',
    '- Keep composition clean, readable, and attractive as a thumbnail.',
    '',
    'Lighting and Material module:',
    '- Include specific light direction, soft shadows, subtle reflections, material contrast, and clean airiness.',
    '- The image should feel realistic, refined, commercial, and high-end.',
    '',
    'People Policy module:',
    '- If the user requests no people, do not add people.',
    '- If people are requested, people may only support mood and usage context.',
    '- People must never block the product, cover key packaging information, or become the primary subject.',
    '- Skin and body details should be natural and realistic, not plastic or exaggerated.',
    '',
    'Ecommerce Compliance module:',
    '- Do not invent efficacy claims, medical claims, clinical tests, certifications, ingredient facts, before-after comparisons, exaggerated numerical benefits, or unsupported proof.',
    '- Do not add fake badges, awards, regulatory logos, medical wording, or dramatic treatment effects.',
    '- If image text is needed, allow only a small amount of short natural English copy.',
    '',
    'Final Output Format module:',
    '- Return exactly one finished Chinese prompt.',
    '- Do not output headings, bullets, JSON, markdown, explanation, alternatives, or quotation marks.',
    '- The prompt must be one coherent paragraph.',
    '- End with: 生成图片比例必须为1:1正方形构图。',
  ].join('\n')
}

export function buildPromptGeneratorUserPrompt(input: PromptGeneratorInput) {
  const existingPromptExamples = input.existingPrompts?.length
    ? input.existingPrompts
        .slice(0, 3)
        .map((prompt, index) => `参考现有 P${index + 1}: ${prompt}`)
        .join('\n\n')
    : '暂无现有 prompt。'

  return [
    '请根据下面的信息生成一个新的电商生图 prompt。',
    '',
    `当前类目：${input.categoryName} (${input.categorySlug})`,
    `类目视觉参考方向：${getCategoryGuidance(input.categorySlug)}`,
    `产品类型：${input.productType || input.categoryName}`,
    `图片风格：${input.imageStyle || '高端电商产品主图，干净、真实、有层次，适合美妆个护品牌'}`,
    `人物要求：${input.peopleMode || '未明确时不加入人物'}`,
    `展示方式/场景：${input.displayMethod || '围绕产品气质设计高级陈列、背景、道具、光影和材质层次'}`,
    `额外要求：${input.extraInfo || '无'}`,
    '',
    '同类目现有 prompt 风格参考，只学习结构、语气和约束，不要复制原文：',
    existingPromptExamples,
    '',
    '生成要求：',
    '1. 用中文输出一条完整 prompt。',
    '2. 明确写出“以我上传的产品素材图为唯一产品参考”。',
    '3. 先强调产品保真，再描述画面风格、背景、道具、光影、材质、人物规则和禁止内容。',
    '4. 不要生成多个版本。',
  ].join('\n')
}

export function cleanGeneratedPrompt(text: string) {
  return text
    .replace(/^```(?:\w+)?/i, '')
    .replace(/```$/i, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^最终提示词[:：]\s*/i, '')
    .trim()
}
