/**
 * Import preset categories and prompts via API routes (for deployed apps).
 *
 * Usage:
 *   npx tsx scripts/import-categories-api.ts <email> <password> [base_url]
 *
 * base_url defaults to http://localhost:3000
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Note: This script reads prompts.csv from the same local directory as the
 * direct-import script. If running on a different machine, copy the CSV
 * directory or adjust CSV_BASE_DIR.
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
  const email = process.argv[2]
  const password = process.argv[3]
  const baseUrl = (process.argv[4] || 'http://localhost:3000').replace(/\/$/, '')

  if (!email || !password) {
    console.error(
      'Usage: npx tsx scripts/import-categories-api.ts <email> <password> [base_url]'
    )
    process.exit(1)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      'Missing env vars. Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.'
    )
    process.exit(1)
  }

  // 1. Sign in via Supabase to get a session / access token
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (authError || !authData.session) {
    console.error('Login failed:', authError?.message ?? 'No session returned')
    process.exit(1)
  }

  const accessToken = authData.session.access_token
  const userId = authData.user.id
  console.log(`Logged in as ${email} (${userId})\n`)

  // Helper: authenticated fetch
  async function apiFetch<T = unknown>(
    path: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>
  ): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`${method} ${path} -> ${res.status}: ${text}`)
    }

    return res.json() as Promise<T>
  }

  // 2. Fetch existing categories to skip duplicates
  interface CategorySummary {
    id: string
    slug: string
    name_zh: string
  }

  const existingCategories = await apiFetch<CategorySummary[]>('/api/categories', 'GET')
  const existingSlugs = new Set(existingCategories.map((c) => c.slug))

  console.log(`Found ${existingCategories.length} existing categories\n`)

  let importedCategories = 0
  let skippedCategories = 0
  let importedPrompts = 0

  for (const cat of PRESET_CATEGORIES) {
    if (existingSlugs.has(cat.slug)) {
      console.log(`  [SKIP] Category "${cat.name_zh}" (${cat.slug}) already exists`)
      skippedCategories++
      continue
    }

    // 3. Create category
    let categoryId: string
    try {
      const created = await apiFetch<CategorySummary>('/api/categories', 'POST', {
        name_zh: cat.name_zh,
        slug: cat.slug,
        icon: cat.icon,
      })
      categoryId = created.id
      console.log(`  [OK] Category "${cat.name_zh}" (${cat.slug}) created`)
      importedCategories++
    } catch (err: any) {
      if (err.message?.includes('409') || err.message?.includes('Slug already exists')) {
        console.log(`  [SKIP] Category "${cat.name_zh}" (${cat.slug}) already exists (409)`)
        skippedCategories++
        continue
      }
      console.error(`  [ERROR] Failed to create category "${cat.name_zh}": ${err.message}`)
      continue
    }

    // 4. Read prompts CSV
    const csvPath = path.join(CSV_BASE_DIR, cat.name_zh, 'prompts.csv')
    if (!fs.existsSync(csvPath)) {
      console.warn(`  [WARN] No prompts.csv found at ${csvPath}, skipping prompts`)
      continue
    }

    const prompts = parsePromptsCsv(csvPath)

    // 5. Insert prompts via API
    for (const p of prompts) {
      const promptNumber = promptIdToNumber(p.prompt_id)
      try {
        await apiFetch('/api/prompts', 'POST', {
          category_id: categoryId,
          prompt_number: promptNumber,
          prompt_text: p.prompt_text,
        })
        console.log(`    [OK] Prompt ${p.prompt_id} (number ${promptNumber}) inserted`)
        importedPrompts++
      } catch (err: any) {
        console.error(`    [ERROR] Failed to insert prompt ${p.prompt_id}: ${err.message}`)
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
