/**
 * Import preset categories and prompts from local CSV files into Supabase.
 *
 * Usage:
 *   npx tsx scripts/import-categories.ts <user_id>
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CSV_BASE_DIR = 'C:/Users/张祎鸣/.n8n-files/jimeng_batch1/快销商品头图'

const PRESET_CATEGORIES = [
  { name_zh: '卸妆棉', slug: 'make-up-remover-wipes', icon: '🧼' },
  { name_zh: '儿童', slug: 'children', icon: '👶' },
  { name_zh: '防晒霜_止汗', slug: 'sunscreen-antiperspirant', icon: '☀️' },
  { name_zh: '面膜', slug: 'face-masks', icon: '🧖' },
  { name_zh: '唇部', slug: 'lips', icon: '💄' },
  { name_zh: '头发塑形', slug: 'hair-styling', icon: '🪮' },
  { name_zh: '护发素', slug: 'hair-conditioner', icon: '🧴' },
  { name_zh: '沐浴露', slug: 'body-shower', icon: '🫧' },
  { name_zh: '洗发水', slug: 'shampoo', icon: '🧴' },
  { name_zh: '洗面奶', slug: 'facial-cleanser', icon: '🧽' },
  { name_zh: '祛痘_祛斑_祛疤', slug: 'acne-spot-scar', icon: '✨' },
  { name_zh: '爽肤水', slug: 'toner', icon: '💧' },
  { name_zh: '头发护理_油_精华', slug: 'hair-treatment-oil', icon: '🌿' },
  { name_zh: '头皮精华', slug: 'scalp-essence', icon: '🧪' },
  { name_zh: '眼霜', slug: 'eye-cream', icon: '👁️' },
  { name_zh: '男性洗发水', slug: 'men-shampoo', icon: '🪒' },
  { name_zh: '男性洗面奶', slug: 'men-facial-cleanser', icon: '🪒' },
  { name_zh: '纸巾', slug: 'tissue', icon: '🧻' },
  { name_zh: '妆前乳', slug: 'primer', icon: '💅' },
  { name_zh: '身体乳_手霜', slug: 'body-lotion-hand-cream', icon: '🧴' },
  { name_zh: '面部精华', slug: 'facial-essence', icon: '🧪' },
  { name_zh: '面霜', slug: 'face-cream', icon: '🪞' },
  { name_zh: '口腔', slug: 'oral-care', icon: '🪥' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a simple CSV file with columns: "prompt_id","prompt_text"
 * Returns an array of { prompt_id, prompt_text }.
 */
function parsePromptsCsv(filePath: string): { prompt_id: string; prompt_text: string }[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== '')

  // Skip header row
  const rows = lines.slice(1)
  const results: { prompt_id: string; prompt_text: string }[] = []

  for (const row of rows) {
    // Match: "P01","some text with possible commas inside"
    const match = row.match(/^"([^"]+)","(.+)"$/s)
    if (match) {
      results.push({ prompt_id: match[1], prompt_text: match[2] })
    }
  }

  return results
}

/** Convert P01 -> 1, P02 -> 2, etc. */
function promptIdToNumber(promptId: string): number {
  return parseInt(promptId.replace(/^P/, ''), 10)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const userId = process.argv[2]
  if (!userId) {
    console.error('Usage: npx tsx scripts/import-categories.ts <user_id>')
    process.exit(1)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.error(
      'Missing env vars. Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
    )
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`Importing categories for user: ${userId}\n`)

  let importedCategories = 0
  let skippedCategories = 0
  let importedPrompts = 0

  for (const cat of PRESET_CATEGORIES) {
    // 1. Check if category already exists for this user
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', userId)
      .eq('slug', cat.slug)
      .maybeSingle()

    if (existing) {
      console.log(`  [SKIP] Category "${cat.name_zh}" (${cat.slug}) already exists`)
      skippedCategories++
      continue
    }

    // 2. Get next sort_order
    const { data: maxSort } = await supabase
      .from('categories')
      .select('sort_order')
      .eq('user_id', userId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextSortOrder = (maxSort?.sort_order ?? -1) + 1

    // 3. Insert category
    const { data: category, error: catError } = await supabase
      .from('categories')
      .insert({
        user_id: userId,
        name_zh: cat.name_zh,
        slug: cat.slug,
        icon: cat.icon,
        sort_order: nextSortOrder,
        is_preset: true,
      })
      .select()
      .single()

    if (catError) {
      console.error(`  [ERROR] Failed to insert category "${cat.name_zh}": ${catError.message}`)
      continue
    }

    console.log(`  [OK] Category "${cat.name_zh}" (${cat.slug}) created`)
    importedCategories++

    // 4. Read prompts CSV
    const csvPath = path.join(CSV_BASE_DIR, cat.name_zh, 'prompts.csv')
    if (!fs.existsSync(csvPath)) {
      console.warn(`  [WARN] No prompts.csv found at ${csvPath}, skipping prompts`)
      continue
    }

    const prompts = parsePromptsCsv(csvPath)

    // 5. Insert prompts
    for (const p of prompts) {
      const promptNumber = promptIdToNumber(p.prompt_id)
      const { error: promptError } = await supabase.from('category_prompts').insert({
        category_id: category.id,
        prompt_number: promptNumber,
        prompt_text: p.prompt_text,
      })

      if (promptError) {
        console.error(
          `    [ERROR] Failed to insert prompt ${p.prompt_id}: ${promptError.message}`
        )
      } else {
        console.log(`    [OK] Prompt ${p.prompt_id} (number ${promptNumber}) inserted`)
        importedPrompts++
      }
    }
  }

  console.log('\n--- Summary ---')
  console.log(`Categories imported: ${importedCategories}`)
  console.log(`Categories skipped:  ${skippedCategories}`)
  console.log(`Prompts imported:   ${importedPrompts}`)
  console.log('Done.')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
