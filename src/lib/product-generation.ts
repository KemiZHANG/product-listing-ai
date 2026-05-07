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
  'Do not use medical, treatment, cure, prevention, drug-grade, antibacterial, whitening guarantee, slimming guarantee, or permanent-effect claims.',
  'Do not use absolute claims such as No.1, best ever, cheapest, 100% original, official certified, platform certified, or unverifiable certificates.',
  'Do not add off-platform contact details, URLs, QR codes, social handles, competitor platform names, or competitor brand bait keywords.',
  'Do not change product facts such as brand, product line, packaging, logo, color, size, quantity, material, target user, or visible packaging text.',
]

const COPY_VARIATIONS = [
  'Search-friendly ecommerce phrasing with a clean, high-conversion structure.',
  'More lifestyle-oriented phrasing with stronger scenario language.',
  'More detail-page phrasing with emphasis on specs, packaging, and practical use.',
  'More shelf-ready phrasing for manual listing operations.',
  'More concise, direct wording with less repetition.',
  'More conservative, compliance-first wording with softened claims.',
]

const COMPLIANCE_REWRITE_GUIDANCE = [
  'You are not a translator and not a copier. Rewrite the source title and description into a safer, more sellable ecommerce listing while preserving product facts.',
  'Must preserve: real brand, real product line, real size/volume/quantity/material/color, and any clearly visible packaging information.',
  'May rewrite: adjectives, keyword order, scenario language, user-group wording, tone, and risky claims.',
  'If the source contains risky wording, do not copy it blindly. Replace it with safer ecommerce phrasing.',
  'Do not turn ingredients into guaranteed effects. Ingredients may be presented only as formula or composition information unless the source clearly supports more.',
  'Example rewrites: acne-prone skin -> blemish-prone skin; active ingredient -> featured ingredient; clearer complexion -> refreshed skin feel; safe for everyone -> suitable for daily use as directed.',
  'Remove or soften: guaranteed, clinically proven, medical grade, cure, heal, prevent, anti-bacterial, doctor recommended, miracle, no side effects, and similar risky claims.',
]

const IMAGE_ROLE_GUIDANCE: Record<string, string> = {
  main: 'Main image: a clean product-focused ecommerce hero shot on a plain or softly lit neutral background. Keep the product centered, sharp, and packaging-complete.',
  scene: 'Scene image: a realistic lifestyle usage scene. Use a believable environment and a small number of props, but keep the product as the visual focus.',
  detail: 'Detail image: a product detail infographic or specification panel. Show only verifiable selling points, specs, packaging content, or usage information.',
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

  return lines.length ? lines.join('\n') : 'None'
}

function formatSharedContext(input: ProductPromptInput) {
  return [
    `SKU: ${input.sku}`,
    `Category: ${input.categoryName || 'Not specified'}`,
    `Source title: ${input.sourceTitle || 'Not provided'}`,
    `Source description: ${input.sourceDescription || 'Not provided'}`,
    `Selling point notes: ${input.sellingPoints || 'No extra notes. Use only facts supported by the title, description, attributes, and reference images.'}`,
    `Custom attributes:\n${formatAttributes(input.attributes)}`,
  ].join('\n')
}

export function buildProductImagePrompt(template: string, input: ProductPromptInput) {
  const normalizedRole = normalizeProductImageRole(input.promptRole)
  const roleGuidance = IMAGE_ROLE_GUIDANCE[normalizedRole || ''] || template.trim()

  return [
    template.trim(),
    '',
    '[Image objective]',
    roleGuidance,
    '',
    '[Product context]',
    formatSharedContext(input),
    '',
    '[SEO keyword hints]',
    input.seoKeywordText || 'No keyword library is configured. Use only truthful keywords supported by the source product information.',
    '',
    '[Copy variation requirements]',
    `Current copy: ${input.languageLabel}${input.copyIndex}`,
    `Variation direction: ${getCopyVariation(input.copyIndex)}`,
    `If text appears inside the image, it must be in ${input.languageLabel}. Keep copy short, readable, and shelf-ready.`,
    'Different copies may vary in composition, prop choice, scene setup, and information emphasis, but must not change the product itself.',
    '',
    '[Reference image rules]',
    'The uploaded reference images are the only product truth source. Keep packaging, logo, color, visible text, structure, and proportions consistent with them.',
    'Do not invent bundle items, badges, gifts, certifications, before/after effects, fake ingredients, or fake usage results.',
    '',
    '[Compliance rules]',
    input.ruleText || PLATFORM_RED_LINES.join('\n'),
  ].join('\n')
}

export function buildTitleDescriptionPrompt(input: ProductPromptInput) {
  return [
    'You are a Shopee ecommerce listing editor.',
    'Rewrite the product into a safer, cleaner, more sellable listing without changing product facts.',
    'Output JSON only. Do not output Markdown, HTML, XML, or explanations.',
    '',
    '[Target]',
    `Language: ${input.languageLabel}`,
    `Copy: ${input.languageLabel}${input.copyIndex}`,
    `Variation direction: ${getCopyVariation(input.copyIndex)}`,
    '',
    '[Product context]',
    formatSharedContext(input),
    '',
    '[Title rules]',
    '1. Keep the real brand and real product line/name.',
    '2. Include the core keyword naturally, but do not stuff keywords.',
    '3. Title should be clear, ecommerce-friendly, and within about 25-120 characters when possible.',
    '4. Do not use HTML, emojis, hashtags, off-platform details, extreme claims, fake certifications, or medical/treatment wording.',
    '5. If the source title contains risky words, preserve product identity but rewrite the risky part into safer ecommerce language.',
    '',
    '[Description rules]',
    '1. Description must be plain text only.',
    '2. No HTML tags such as <h3>, <ul>, <li>. No Markdown headings. No code blocks.',
    '3. Use exactly these six section headings in the target language, separated by blank lines:',
    '   Core Selling Points',
    '   Specifications',
    '   Usage Scenarios',
    '   Applicable Users',
    '   Package Contents',
    '   Precautions',
    '4. Under each section, write concise plain text. Bullet points may use "- " only.',
    '5. If a fact is unknown, use a conservative phrase such as "please refer to the actual packaging" instead of inventing data.',
    '6. Avoid medical, therapeutic, disease, doctor-endorsed, or guaranteed-result statements.',
    '',
    '[Compliance rewrite guidance]',
    COMPLIANCE_REWRITE_GUIDANCE.join('\n'),
    '',
    '[Platform red lines]',
    input.ruleText || PLATFORM_RED_LINES.join('\n'),
    '',
    '[SEO guidance]',
    input.seoKeywordText || 'No keyword library is configured. Use only real keywords supported by the source product information and category.',
    '',
    '[Output format]',
    '{"title":"...","description":"..."}',
  ].join('\n')
}

export function defaultMainPrompt(categoryName: string, _variant: 1 | 2) {
  void _variant
  return `Use the uploaded original reference images as the only product truth source. Generate one premium ecommerce main image for ${categoryName}. The image should be a clean white, light, or softly neutral product-display image suitable for a Shopee main listing image. Keep the product packaging, logo, colors, labels, proportions, visible text, cap, bottle/jar/tube shape, and all product identity details exactly consistent with the reference product. The product should be sharp, centered, complete, well lit, and visually trustworthy, with natural shadow and a polished commercial finish. You may improve lighting, clarity, composition, and background cleanliness, but do not change the actual product, packaging structure, brand mark, label layout, size impression, or printed information. Do not add fake certification badges, exaggerated effect text, medical or treatment claims, before-and-after comparisons, extra bundle items, free gifts, QR codes, watermarks, platform logos, social handles, or off-platform contact information. Keep the final image clean, compliant, high quality, and ready for marketplace upload in a 1:1 square composition.`
}

export function defaultScenePrompt(categoryName: string, _variant: 1 | 2) {
  void _variant
  return `Use the uploaded original reference images as the only product truth source. Generate one realistic lifestyle scene image for ${categoryName}. The product must remain visually accurate, packaging-complete, clearly readable, and more important than any person, prop, or background element. Place it in a believable daily-use environment that fits the category, such as a vanity table, bathroom counter, desk, travel setup, soft fabric surface, clean shelf, or other natural usage context. You may add a small number of gentle props, hands, soft lighting, water droplets, towels, plants, mirrors, or surface textures when appropriate, but the product must stay the focal point and must not be blocked, distorted, cropped awkwardly, or visually replaced. Keep the logo, label, color, shape, packaging text, proportions, and product identity consistent with the uploaded reference images. Do not create fake product effects, medical or treatment claims, before-and-after comparisons, exaggerated transformation scenes, unrealistic glowing results, additional products that look like bundle items, fake certifications, platform logos, QR codes, social handles, or off-platform information. The final image should feel natural, premium, clean, and marketplace-safe in a 1:1 square composition.`
}

export function defaultDetailPrompt(categoryName: string, _variant: 1 | 2) {
  void _variant
  return `Use the uploaded original reference images as the only product truth source. Generate one ecommerce detail or infographic image for ${categoryName}. Keep the product packaging, logo, colors, label layout, visible text, size impression, proportions, and product identity consistent with the reference images. The composition should focus on the product and present a small number of clear, conservative, verifiable information modules, such as usage scenario, texture or material feel, packaging contents, specification, volume, size, suitable daily-use context, or practical selling points that are supported by the product information. On-image text must be short, clean, readable, and compliant; use only cautious marketplace-safe phrasing and avoid unsupported claims. Do not invent ingredients, certifications, awards, test results, medical effects, treatment benefits, guaranteed results, before-and-after comparisons, clinical proof, or specifications not visible or provided. Do not add QR codes, social handles, platform logos, off-platform contact information, fake badges, or excessive decorative text. The layout should look like a high-quality marketplace detail image with clear hierarchy, generous spacing, polished lighting, and a clean 1:1 square composition.`
}
