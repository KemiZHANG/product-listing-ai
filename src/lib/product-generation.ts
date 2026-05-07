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
  return `Use the uploaded reference images as the only product truth source. Generate one main ecommerce image for ${categoryName}: a clean product-focused hero image on a simple bright or neutral background. Keep the packaging, logo, visible text, proportions, and colors consistent with the reference product. Do not add fake certifications, exaggerated claims, extra bundle items, or off-platform information.`
}

export function defaultScenePrompt(categoryName: string, _variant: 1 | 2) {
  void _variant
  return `Use the uploaded reference images as the only product truth source. Generate one realistic lifestyle scene image for ${categoryName}. The product must stay visually accurate, remain the focal point, and appear in a believable usage environment. Do not invent fake product effects, before/after comparisons, medical claims, or packaging changes.`
}

export function defaultDetailPrompt(categoryName: string, _variant: 1 | 2) {
  void _variant
  return `Use the uploaded reference images as the only product truth source. Generate one detail or infographic image for ${categoryName}. Keep the product visually accurate and present only verifiable selling points, specifications, packaging content, material, volume, or usage information. Keep on-image text short, clear, and compliant. Do not invent claims, certifications, or unsupported specifications.`
}
