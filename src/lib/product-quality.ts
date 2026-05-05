import { scoreSeoContent, type SeoKeywordBank, type SeoScoreResult } from './seo-keywords'
import { sanitizeListingText } from './listing-text'

export type QualityIssueSeverity = 'warning' | 'fail'
export type ProductQualityStatus = 'pass' | 'warning' | 'fail'

export type ProductQualityIssue = {
  code: string
  label: string
  message: string
  severity: QualityIssueSeverity
}

export type ProductQualityReport = {
  status: ProductQualityStatus
  score: number
  seo: SeoScoreResult
  issues: ProductQualityIssue[]
  checked_at: string
}

const MEDICAL_CLAIM_PATTERNS = [
  /cure|treat|heals?|medical grade|clinically proven|anti[- ]?bacterial|anti[- ]?allergy|therapeutic/i,
  /治疗|治愈|药用|医用级|临床证明|抗菌|抗过敏|祛病|预防疾病/,
  /menyembuhkan|pengobatan|rawatan|sembuh|chữa trị|điều trị/i,
]

const REGULATED_SKINCARE_PATTERNS = [
  /active ingredient|key active|treatment|therapeutic/i,
  /acne|eczema|psoriasis|rosacea|fungal|dermatitis/i,
  /healthcare professional|doctor|physician/i,
  /活性成分|治疗|药用|痤疮|湿疹|银屑病|皮炎|医生|医师/,
]

const OFF_PLATFORM_PATTERNS = [
  /whats\s?app|telegram|line id|facebook|instagram|http:\/\/|https:\/\//i,
  /微信|手机号|电话|网址|二维码|站外|私信/,
]

function includesAnyPattern(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

function issue(
  code: string,
  label: string,
  message: string,
  severity: QualityIssueSeverity = 'warning'
): ProductQualityIssue {
  return { code, label, message, severity }
}

export function analyzeProductCopyQuality(input: {
  title: string
  description: string
  seoBank?: SeoKeywordBank | null
  completedImageCount: number
  totalImageCount: number
  shopeeCategory?: string | null
}) {
  const title = sanitizeListingText(input.title)
  const description = sanitizeListingText(input.description)
  const combined = `${title}\n${description}`
  const seo = scoreSeoContent(title, description, input.seoBank)
  const issues: ProductQualityIssue[] = []

  if (title.trim().length < 25) {
    issues.push(issue('title_short', '标题偏短', '标题偏短，建议补充真实规格、属性或使用场景。'))
  }

  if (title.trim().length > 130) {
    issues.push(issue('title_long', '标题偏长', '标题过长，可能影响员工上架和搜索可读性。'))
  }

  if (seo.suggestions.some((item) => item.includes('核心词'))) {
    issues.push(issue('missing_core_keyword', '缺少核心词', '标题没有命中当前类目的核心关键词。'))
  }

  if (seo.forbidden_keywords.length > 0) {
    issues.push(issue('forbidden_keyword', '命中禁词', `发现禁用词：${seo.forbidden_keywords.join(', ')}`, 'fail'))
  }

  if (includesAnyPattern(combined, MEDICAL_CLAIM_PATTERNS)) {
    issues.push(issue(
      'medical_claim',
      '疑似医疗宣称',
      '标题或描述包含医疗、治疗、药用级或保证效果类风险表达。',
      'fail'
    ))
  }

  if (includesAnyPattern(combined, REGULATED_SKINCARE_PATTERNS)) {
    issues.push(issue(
      'regulated_skincare_terms',
      '敏感功效/成分词',
      '标题或描述包含 acne、active ingredient、治疗、医生建议等敏感词，建议确认平台类目限制，并优先使用更中性的护理表达。'
    ))
  }

  if (includesAnyPattern(combined, OFF_PLATFORM_PATTERNS)) {
    issues.push(issue(
      'off_platform',
      '疑似站外导流',
      '标题或描述包含站外链接、联系方式或社媒导流风险。',
      'fail'
    ))
  }

  if (description.trim().length < 120) {
    issues.push(issue(
      'description_short',
      '描述偏短',
      '描述偏短，建议补齐卖点、规格、场景、人群、包装和注意事项。'
    ))
  }

  const normalizedDescription = description.toLowerCase()
  const structureGroups = [
    ['卖点', 'selling point', 'key feature', 'keunggulan', 'điểm nổi bật'],
    ['规格', 'specification', 'details', 'spesifikasi', 'thông số'],
    ['场景', 'usage', 'scenario', 'use case', 'kegunaan', 'sử dụng'],
    ['人群', 'applicable', 'suitable', 'users', 'audience', 'sesuai', 'phù hợp'],
    ['包装', 'package', 'contents', 'included', 'pembungkusan', 'đóng gói'],
    ['注意', 'precaution', 'notes', 'care', 'perhatian', 'lưu ý'],
  ]
  const sectionHits = structureGroups.filter((group) =>
    group.some((hint) => normalizedDescription.includes(hint.toLowerCase()))
  ).length
  if (sectionHits < 4) {
    issues.push(issue(
      'description_structure',
      '描述结构不完整',
      '描述可能缺少固定结构：核心卖点、规格参数、使用场景、适用人群、包装内容、注意事项。'
    ))
  }

  if (input.totalImageCount > 0 && input.completedImageCount < input.totalImageCount) {
    issues.push(issue(
      'image_incomplete',
      '图片未完成',
      `图片完成 ${input.completedImageCount}/${input.totalImageCount}，请重试失败图片或确认待审核新图。`
    ))
  }

  if (!input.shopeeCategory) {
    issues.push(issue(
      'missing_shopee_category',
      '缺少 Shopee 类目',
      '商品未标注 Shopee 叶类目，员工上架时容易选错类目。'
    ))
  }

  const hasFail = issues.some((item) => item.severity === 'fail')
  const status: ProductQualityStatus = hasFail ? 'fail' : issues.length > 0 || seo.score < 70 ? 'warning' : 'pass'
  const penalty = issues.reduce((sum, item) => sum + (item.severity === 'fail' ? 18 : 5), 0)

  return {
    status,
    score: Math.max(0, Math.min(100, Math.round((seo.score + 100 - penalty) / 2))),
    seo,
    issues,
    checked_at: new Date().toISOString(),
  } satisfies ProductQualityReport
}
