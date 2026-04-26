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

export function buildPromptGeneratorInstruction() {
  return [
    'You are a senior ecommerce image prompt designer for beauty, skincare, personal care, and consumer products.',
    'Your task is to convert short Chinese user requirements into one polished Chinese image-generation prompt.',
    'The output prompt will be used with an uploaded product image as the only visual reference.',
    '',
    'Hard rules:',
    '1. The product must remain unchanged: packaging shape, cap, label, logo, color, proportions, and all visible text must not be modified.',
    '2. The product must be complete, clear, and the main visual center.',
    '3. If people are requested, people must only support the atmosphere and must not block the product or packaging information.',
    '4. Create a premium ecommerce main image, not a detail-page poster or cheap promotional banner.',
    '5. Add layered background, props, lighting, material, and composition details that match the category and user requirements.',
    '6. Do not invent efficacy claims, certifications, medical claims, clinical tests, before-after comparisons, fake ingredients, exaggerated numerical benefits, or unsupported claims.',
    '7. If text appears in the image, allow only a small amount of short English copy.',
    '8. End the prompt by requiring a 1:1 square composition.',
    '',
    'Output rules:',
    'Return exactly one final prompt in Chinese.',
    'Do not use markdown.',
    'Do not include a title, explanation, alternatives, bullet points, or quotation marks.',
  ].join('\n')
}

export function buildPromptGeneratorUserPrompt(input: PromptGeneratorInput) {
  const existingPromptExamples = input.existingPrompts?.length
    ? input.existingPrompts
        .slice(0, 3)
        .map((prompt, index) => `参考现有 P${index + 1}: ${prompt}`)
        .join('\n')
    : '暂无现有 prompt。'

  return [
    `当前类目：${input.categoryName} (${input.categorySlug})`,
    `产品类型：${input.productType || input.categoryName}`,
    `图片风格：${input.imageStyle || '高端电商产品主图，干净、真实、有层次'}`,
    `人物要求：${input.peopleMode || '按用户需求决定；未明确时不强行加入人物'}`,
    `展示方式/场景：${input.displayMethod || '围绕产品气质设计高级陈列、背景和光影层次'}`,
    `额外要求：${input.extraInfo || '无'}`,
    '',
    '同类目已有 prompt 风格参考，只学习结构和约束，不要复制：',
    existingPromptExamples,
    '',
    '请生成一个可直接保存到系统的新生图 prompt。',
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
