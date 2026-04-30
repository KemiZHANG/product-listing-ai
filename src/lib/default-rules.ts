import type { SupabaseClient } from '@supabase/supabase-js'

type RuleScope = 'general' | 'title_description' | 'image' | 'platform'

export const SHOPEE_PDF_RULE_TEMPLATES: Array<{
  name: string
  scope: RuleScope
  content: string
}> = [
  {
    name: 'Shopee PDF 总规则：禁止内容与平台红线',
    scope: 'platform',
    content: `Source: Shopee上品规则--商品标题&内容&图片.pdf.

Strictly avoid prohibited content in product titles, descriptions, images, and videos.

Do not include:
- Off-platform contact information or links, including WhatsApp, WeChat, Line, Facebook numbers, external website URLs, "chat privately for cheaper", or "add me to buy cheaper".
- Competitor platform names, content, logos, or traffic diversion, including Lazada, TikTok, Amazon, Taobao, and similar marketplace references.
- Profanity, insulting language, garbled text, HTML, program code, or irrelevant symbols.
- Misleading prices or purchase instructions, such as "buy 5 pieces = 1 set" when the price/unit does not match, or RM 1 bait-price/free-gift claims.
- False authenticity claims such as "100% original", "factory original", "high imitation authentic", or other unsupported origin/brand claims.
- Exaggerated, absolute, medical, disease, or drug-like claims.

Keep every generated title, description, and image faithful to the source product. If a claim is not directly supported by the source information, do not invent it.`,
  },
  {
    name: 'Shopee 标题规则：公式、字符与搜索权重',
    scope: 'title_description',
    content: `Generate Shopee-safe product titles using one of these structures:
- Core keyword + long-tail keyword + attribute words + usage scene.
- Product name/model + specification/size + applicable scene/user/model.

Important title guidance:
- Put the core product keyword at the beginning because the first 20-25 full-width characters have the strongest search/display weight.
- Use only truly relevant keywords; do not keyword-stuff.
- If the product is not an authorized famous brand product, do not add famous brand names to the title.
- If the product is brand-sensitive or a no-brand/generic item, prefer: product name/model + specification/size + applicable scene/user. Avoid adding brand names.
- Compatibility wording must be complete, e.g. "适用 iPhone 7 手机壳" rather than only "iPhone 7".
- Keep the title readable, natural, and close to the original product meaning.

Never use emojis, hashtags, extreme words, competitor brands, misleading brand names, unsupported "original/authentic" claims, medical-grade terms, treatment terms, or disease-prevention terms.`,
  },
  {
    name: 'Shopee 标题红线：禁词与错误写法',
    scope: 'title_description',
    content: `Avoid these title violations:
- Keyword stuffing: listing unrelated or competing brands/categories such as "Nike Adidas Puma New Balance", "iPhone Samsung Huawei Apple", or multiple unrelated clothing terms.
- Extreme/superlative claims: 全网最低价, 史上最便宜, 第一, 最好, 极品, 100% Original, best ever, cheapest, No.1.
- Medical/drug claims: 医疗级, 药用, 治疗, 治愈, 消除疾病, 预防疾病, medical grade, treatment, cure.
- Emojis and hashtags in titles.
- Negative competitor insertion: "not Asus Samsung", "不是某品牌".
- Selling brand A while adding brand B to gain traffic.
- Incomplete compatibility statements.

When rewriting titles for different copies/languages, preserve the original product meaning but vary word order and phrasing enough to avoid duplicate listings.`,
  },
  {
    name: 'Shopee 描述规则：推荐结构',
    scope: 'title_description',
    content: `Write descriptions in a clear buyer-friendly structure:
1. Key selling points first.
2. Specifications: size, material, weight, color, capacity, model, or other attributes from the product data.
3. Usage instructions and applicable users/scenes.
4. Package contents.
5. After-sales note, written neutrally and without off-platform contact.

The description should be easy to scan with short paragraphs or bullets. It should generally contain at least 50 Chinese characters or 50 words where possible.

Do not over-expand beyond the source data. If optional information is missing, omit it rather than inventing fake specifications.`,
  },
  {
    name: 'Shopee 描述红线：导流、夸大、定价、代码',
    scope: 'title_description',
    content: `Avoid these description violations:
- Any off-platform traffic diversion: WhatsApp, WeChat, Line, Facebook, external links, private contact instructions, "message me for cheaper".
- Exaggerated or false claims: ordinary masks as medical-grade protection, false waterproof ratings, fake brand/origin claims, unsupported "original/authentic".
- Food, cosmetics, personal care, or health products must not claim treatment, prevention, disease removal, drug effects, or medical effects.
- Misleading price/unit text: do not ask buyers to buy a certain quantity to represent one set if the listed unit/price does not match.
- No garbled text, HTML, code snippets, profanity, insulting language, or competitor platform content/logos.

For each generated copy, keep the meaning true to the original product while changing wording naturally for the requested language.`,
  },
  {
    name: 'Shopee 个护/美妆成分规则：INCI 与医疗宣称',
    scope: 'platform',
    content: `For personal care, beauty, skincare, hair care, cosmetics, and similar categories:
- Ingredients must use INCI international names when mentioned, e.g. Ascorbic Acid, Tocopherol, Salicylic Acid.
- Do not use informal/local/common ingredient names when strict ingredient compliance is needed.
- Do not bind ingredients to medical efficacy, e.g. do not say Salicylic Acid treats acne, Niacinamide removes spots, hormones are anti-allergy.
- Safer wording examples: "helps cleanse pores", "helps improve uneven-looking tone", "supports a cleaner skin feel".
- If a full ingredients list is required, mention that ingredients should follow the product packaging and do not fabricate a full ingredient list.
- Ingredient information can support texture/basic product function, but must not prove treatment efficacy.
- Avoid claims like whitening, freckle removal, anti-allergy, antibacterial, hair growth, disease prevention, disease treatment, drug-like efficacy, medical-grade effects.
- Site differences may be stricter: Taiwan can be strict on whitening/special certifications; Indonesia/Thailand may have alcohol/Halal-related requirements. When unsure, use conservative neutral wording.`,
  },
  {
    name: 'Shopee 图片规则：数量、尺寸、内容一致性',
    scope: 'image',
    content: `Generate Shopee-safe ecommerce images:
- Shopee can upload up to 9 product images; at least 3 non-duplicate images are recommended/required for stronger listing quality.
- Recommended image size: square 1024 x 1024.
- Each image should be under platform size limits, preferably under 2MB after export/compression.
- Recommended listing mix: scene/lifestyle images, detail images, and selling-point images.
- Images must match the title and description.
- Do not duplicate the same image, including only zooming, cropping, or changing background color.
- Do not copy or imitate other sellers' images.
- Do not include off-platform contact information, QR codes, social handles, website URLs, competitor marketplace names/logos, or misleading badges.

For the 6-image workflow: create 2 hero/main images, 2 model or usage-scene images, and 2 product detail/selling-point images. Each copy/language should have subtle visual differences.`,
  },
  {
    name: '商品详情图文字规则：多语言卖点图',
    scope: 'image',
    content: `For product detail images with text:
- Use the requested copy language for all text inside the image.
- Extract short selling points from product title, description, category, attributes, and optional selling points.
- Keep text concise: 1 headline plus 2-4 short callouts is better than long paragraphs.
- Do not include unsupported claims, medical claims, absolute claims, competitor names, prices, phone numbers, URLs, QR codes, or platform logos.
- If the source data does not support a benefit, do not invent it. Use neutral feature wording instead.
- Keep the layout clean and ecommerce-focused: product close-up, texture/material/feature callouts, simple icons or labels only when they do not create compliance risk.`,
  },
]

export async function ensureDefaultRuleTemplates(
  supabase: SupabaseClient,
  userId: string
) {
  const rows = SHOPEE_PDF_RULE_TEMPLATES.map((rule) => ({
    user_id: userId,
    name: rule.name,
    scope: rule.scope,
    content: rule.content,
    active: true,
  }))

  await supabase
    .from('rule_templates')
    .upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true })

  await supabase
    .from('rule_templates')
    .update({
      scope: 'platform',
      content: SHOPEE_PDF_RULE_TEMPLATES[0].content,
      active: true,
    })
    .eq('user_id', userId)
    .eq('name', 'Shopee title, description, and image rules')
}
