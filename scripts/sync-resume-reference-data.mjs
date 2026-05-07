import { createClient } from '@supabase/supabase-js'

function readEnv(name, fallback = '') {
  return String(process.env[name] || fallback).trim()
}

function normalizeSupabaseUrl(value, envName) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${envName}`)
  }
  if (value.startsWith('https://')) return value
  return `https://${value}.supabase.co`
}

function chunk(array, size) {
  const result = []
  for (let index = 0; index < array.length; index += size) {
    result.push(array.slice(index, index + size))
  }
  return result
}

async function listAuthUsers(baseUrl, serviceRoleKey) {
  const response = await fetch(`${baseUrl}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to list auth users: ${response.status} ${await response.text()}`)
  }

  const payload = await response.json()
  return Array.isArray(payload?.users) ? payload.users : []
}

function pickResumeOwner(users, preferredEmail) {
  const normalizedPreferred = preferredEmail.trim().toLowerCase()
  if (normalizedPreferred) {
    const exact = users.find((user) => String(user.email || '').trim().toLowerCase() === normalizedPreferred)
    if (exact) return exact
  }

  const nonTest = users.find((user) => !String(user.email || '').includes('codex-test-'))
  return nonTest || users[0] || null
}

async function fetchWorkspaceRows(client, table, workspaceKey) {
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq('workspace_key', workspaceKey)

  if (error) {
    throw new Error(`Failed to fetch ${table}: ${error.message}`)
  }

  return data || []
}

async function fetchCategoryChildren(client, categoryIds, table) {
  if (categoryIds.length === 0) return []

  const chunks = chunk(categoryIds, 100)
  const rows = []
  for (const ids of chunks) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .in('category_id', ids)

    if (error) {
      throw new Error(`Failed to fetch ${table}: ${error.message}`)
    }

    rows.push(...(data || []))
  }

  return rows
}

async function upsertRows(client, table, rows, onConflict = 'id') {
  if (rows.length === 0) return 0

  for (const batch of chunk(rows, 200)) {
    const { error } = await client
      .from(table)
      .upsert(batch, { onConflict })

    if (error) {
      throw new Error(`Failed to upsert ${table}: ${error.message}`)
    }
  }

  return rows.length
}

async function ensureProfile(client, user) {
  const { data, error } = await client
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to query profiles: ${error.message}`)
  }

  if (data?.id) return

  const email = String(user.email || '').trim() || null
  const displayName = email ? email.split('@')[0] : 'resume-owner'
  const { error: insertError } = await client
    .from('profiles')
    .insert({
      id: user.id,
      email,
      display_name: displayName,
    })

  if (insertError) {
    throw new Error(`Failed to create profile for ${email || user.id}: ${insertError.message}`)
  }
}

async function copyStorageObjects(sourceClient, targetClient, paths, bucket) {
  let copied = 0

  for (const path of paths) {
    const { data: sourceFile, error: downloadError } = await sourceClient.storage.from(bucket).download(path)
    if (downloadError) {
      throw new Error(`Failed to download ${bucket}/${path}: ${downloadError.message}`)
    }

    const buffer = Buffer.from(await sourceFile.arrayBuffer())
    const { error: uploadError } = await targetClient.storage.from(bucket).upload(path, buffer, {
      upsert: true,
      contentType: sourceFile.type || undefined,
    })

    if (uploadError) {
      throw new Error(`Failed to upload ${bucket}/${path}: ${uploadError.message}`)
    }

    copied += 1
  }

  return copied
}

async function main() {
  const workspaceKey = readEnv('SYNC_WORKSPACE_KEY', 'external')
  const companyUrl = normalizeSupabaseUrl(readEnv('COMPANY_SUPABASE_URL'), 'COMPANY_SUPABASE_URL')
  const resumeUrl = normalizeSupabaseUrl(readEnv('RESUME_SUPABASE_URL'), 'RESUME_SUPABASE_URL')
  const companyServiceRoleKey = readEnv('COMPANY_SUPABASE_SERVICE_ROLE_KEY')
  const resumeServiceRoleKey = readEnv('RESUME_SUPABASE_SERVICE_ROLE_KEY') || readEnv('SUPABASE_ACCESS_TOKEN')
  const preferredResumeOwnerEmail = readEnv('RESUME_OWNER_EMAIL', 'links358p@gmail.com')

  if (!companyServiceRoleKey) {
    throw new Error('Missing required environment variable: COMPANY_SUPABASE_SERVICE_ROLE_KEY')
  }
  if (!resumeServiceRoleKey) {
    throw new Error('Missing required environment variable: RESUME_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ACCESS_TOKEN')
  }

  const company = createClient(companyUrl, companyServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const resume = createClient(resumeUrl, resumeServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const resumeUsers = await listAuthUsers(resumeUrl, resumeServiceRoleKey)
  const resumeOwner = pickResumeOwner(resumeUsers, preferredResumeOwnerEmail)
  if (!resumeOwner?.id) {
    throw new Error('Could not find a resume owner user to own synced reference data')
  }

  await ensureProfile(resume, resumeOwner)

  const categories = await fetchWorkspaceRows(company, 'categories', workspaceKey)
  const categoryIds = categories.map((category) => category.id)
  const [categoryPrompts, categoryImages, ruleTemplates] = await Promise.all([
    fetchCategoryChildren(company, categoryIds, 'category_prompts'),
    fetchCategoryChildren(company, categoryIds, 'category_images'),
    fetchWorkspaceRows(company, 'rule_templates', workspaceKey),
  ])

  const normalizedCategories = categories.map((row) => ({
    ...row,
    user_id: resumeOwner.id,
  }))
  const normalizedRuleTemplates = ruleTemplates.map((row) => ({
    ...row,
    user_id: resumeOwner.id,
  }))

  const imagePaths = Array.from(new Set(categoryImages.map((row) => row.storage_path).filter(Boolean)))

  const copiedImages = await copyStorageObjects(company, resume, imagePaths, 'images')
  const upsertedCategories = await upsertRows(resume, 'categories', normalizedCategories)
  const upsertedPrompts = await upsertRows(resume, 'category_prompts', categoryPrompts)
  const upsertedImages = await upsertRows(resume, 'category_images', categoryImages)
  const upsertedRules = await upsertRows(resume, 'rule_templates', normalizedRuleTemplates, 'workspace_key,name')

  console.log(JSON.stringify({
    workspaceKey,
    resumeOwnerEmail: resumeOwner.email,
    categories: upsertedCategories,
    categoryPrompts: upsertedPrompts,
    categoryImages: upsertedImages,
    copiedStorageImages: copiedImages,
    ruleTemplates: upsertedRules,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
