#!/usr/bin/env node

const fs = await import('node:fs/promises')
const path = await import('node:path')
const process = await import('node:process')
const { createClient } = await import('@supabase/supabase-js')

const LEGACY_ROLE_ALIASES = new Map([
  ['main', 'main'],
  ['main_1', 'main'],
  ['main_2', 'main'],
  ['scene', 'scene'],
  ['model_scene_1', 'scene'],
  ['model_scene_2', 'scene'],
  ['detail', 'detail'],
  ['detail_1', 'detail'],
  ['detail_2', 'detail'],
])

const ROLE_ORDER = ['main', 'scene', 'detail']
const CANONICAL_PROMPT_NUMBER = {
  main: 1,
  scene: 2,
  detail: 3,
}

function parseArgs(argv) {
  const args = {
    execute: false,
    mode: 'tasks-only',
    workspace: 'all',
    envFile: '.env.local',
    backupDir: path.resolve('artifacts', 'legacy-cleanups'),
  }

  for (const item of argv) {
    if (item === '--execute') {
      args.execute = true
      continue
    }
    if (item.startsWith('--mode=')) {
      args.mode = item.split('=', 2)[1]
      continue
    }
    if (item.startsWith('--workspace=')) {
      args.workspace = item.split('=', 2)[1]
      continue
    }
    if (item.startsWith('--env-file=')) {
      args.envFile = item.split('=', 2)[1]
      continue
    }
    if (item.startsWith('--backup-dir=')) {
      args.backupDir = path.resolve(item.split('=', 2)[1])
    }
  }

  if (!['tasks-only', 'tasks-and-prompts'].includes(args.mode)) {
    throw new Error(`Unsupported mode: ${args.mode}`)
  }

  if (!['all', 'internal', 'external'].includes(args.workspace)) {
    throw new Error(`Unsupported workspace filter: ${args.workspace}`)
  }

  return args
}

async function loadEnvFile(envFile) {
  const absolutePath = path.resolve(envFile)
  const text = await fs.readFile(absolutePath, 'utf8')
  const env = {}

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue
    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }

  return env
}

function normalizeRole(promptRole, promptNumber) {
  const normalized = LEGACY_ROLE_ALIASES.get(String(promptRole || '').trim().toLowerCase())
  if (normalized) return normalized

  if (promptNumber === 1 || promptNumber === 2) return 'main'
  if (promptNumber === 3 || promptNumber === 4) return 'scene'
  if (promptNumber === 5 || promptNumber === 6) return 'detail'
  return null
}

function workspaceAllowed(workspaceFilter, workspaceKey) {
  return workspaceFilter === 'all' || workspaceFilter === workspaceKey
}

function statusWeight(status) {
  if (status === 'completed') return 50
  if (status === 'needs_review') return 45
  if (status === 'generating') return 35
  if (status === 'queued') return 30
  if (status === 'failed') return 10
  return 20
}

function rankImageRow(row) {
  return (
    (row.pending_storage_path ? 100 : 0) +
    statusWeight(row.status) +
    (row.output_storage_path ? 10 : 0) +
    (row.prompt_number <= 3 ? 5 : 0)
  )
}

function compareByRankDesc(left, right) {
  const rankDiff = rankImageRow(right) - rankImageRow(left)
  if (rankDiff !== 0) return rankDiff

  const updatedAtDiff = new Date(right.updated_at || 0).getTime() - new Date(left.updated_at || 0).getTime()
  if (updatedAtDiff !== 0) return updatedAtDiff

  return left.prompt_number - right.prompt_number
}

async function ensureBackupDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

async function writeBackup(dirPath, filename, payload) {
  await ensureBackupDir(dirPath)
  const filePath = path.join(dirPath, filename)
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
  return filePath
}

async function fetchLegacyImageRows(supabase, workspaceFilter) {
  const { data, error } = await supabase
    .from('product_copy_images')
    .select(`
      id,
      copy_id,
      prompt_number,
      prompt_role,
      prompt_text,
      status,
      output_storage_path,
      pending_storage_path,
      previous_storage_path,
      created_at,
      updated_at,
      product_copies!inner(
        id,
        sku,
        workspace_key
      )
    `)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load product_copy_images: ${error.message}`)
  }

  return (data || [])
    .map((row) => ({
      ...row,
      workspace_key: row.product_copies?.workspace_key || 'external',
      sku: row.product_copies?.sku || '',
      canonical_role: normalizeRole(row.prompt_role, row.prompt_number),
    }))
    .filter((row) => row.canonical_role)
    .filter((row) => row.prompt_number > 3 || row.prompt_role !== row.canonical_role)
    .filter((row) => workspaceAllowed(workspaceFilter, row.workspace_key))
}

async function fetchLegacyPromptRows(supabase, workspaceFilter) {
  const { data, error } = await supabase
    .from('category_prompts')
    .select(`
      id,
      category_id,
      prompt_number,
      prompt_role,
      prompt_text,
      created_at,
      updated_at,
      categories!inner(
        id,
        name_zh,
        workspace_key
      )
    `)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load category_prompts: ${error.message}`)
  }

  return (data || [])
    .map((row) => ({
      ...row,
      category_name: row.categories?.name_zh || '',
      workspace_key: row.categories?.workspace_key || 'external',
      canonical_role: normalizeRole(row.prompt_role, row.prompt_number),
    }))
    .filter((row) => row.canonical_role)
    .filter((row) => row.prompt_number > 3 || row.prompt_role !== row.canonical_role)
    .filter((row) => workspaceAllowed(workspaceFilter, row.workspace_key))
}

function buildImageOperations(rows) {
  const grouped = new Map()

  for (const row of rows) {
    const groupKey = `${row.workspace_key}:${row.copy_id}:${row.canonical_role}`
    if (!grouped.has(groupKey)) grouped.set(groupKey, [])
    grouped.get(groupKey).push(row)
  }

  const operations = {
    update: [],
    delete: [],
  }

  for (const rowsForGroup of grouped.values()) {
    rowsForGroup.sort(compareByRankDesc)
    const keep = rowsForGroup[0]
    const canonicalRole = keep.canonical_role
    const canonicalNumber = CANONICAL_PROMPT_NUMBER[canonicalRole]

    if (keep.prompt_role !== canonicalRole || keep.prompt_number !== canonicalNumber) {
      operations.update.push({
        id: keep.id,
        workspace_key: keep.workspace_key,
        sku: keep.sku,
        from_prompt_number: keep.prompt_number,
        to_prompt_number: canonicalNumber,
        from_prompt_role: keep.prompt_role,
        to_prompt_role: canonicalRole,
      })
    }

    for (const duplicate of rowsForGroup.slice(1)) {
      operations.delete.push({
        id: duplicate.id,
        workspace_key: duplicate.workspace_key,
        sku: duplicate.sku,
        prompt_number: duplicate.prompt_number,
        prompt_role: duplicate.prompt_role,
        canonical_role: duplicate.canonical_role,
        status: duplicate.status,
      })
    }
  }

  return operations
}

function buildPromptOperations(rows) {
  const grouped = new Map()

  for (const row of rows) {
    const groupKey = `${row.workspace_key}:${row.category_id}:${row.canonical_role}`
    if (!grouped.has(groupKey)) grouped.set(groupKey, [])
    grouped.get(groupKey).push(row)
  }

  const operations = {
    update: [],
    delete: [],
  }

  for (const rowsForGroup of grouped.values()) {
    rowsForGroup.sort((left, right) => {
      const updatedAtDiff = new Date(right.updated_at || 0).getTime() - new Date(left.updated_at || 0).getTime()
      if (updatedAtDiff !== 0) return updatedAtDiff
      return left.prompt_number - right.prompt_number
    })

    const keep = rowsForGroup[0]
    const canonicalRole = keep.canonical_role
    const canonicalNumber = CANONICAL_PROMPT_NUMBER[canonicalRole]

    if (keep.prompt_role !== canonicalRole || keep.prompt_number !== canonicalNumber) {
      operations.update.push({
        id: keep.id,
        workspace_key: keep.workspace_key,
        category_name: keep.category_name,
        from_prompt_number: keep.prompt_number,
        to_prompt_number: canonicalNumber,
        from_prompt_role: keep.prompt_role,
        to_prompt_role: canonicalRole,
      })
    }

    for (const duplicate of rowsForGroup.slice(1)) {
      operations.delete.push({
        id: duplicate.id,
        workspace_key: duplicate.workspace_key,
        category_name: duplicate.category_name,
        prompt_number: duplicate.prompt_number,
        prompt_role: duplicate.prompt_role,
        canonical_role: duplicate.canonical_role,
      })
    }
  }

  return operations
}

async function applyImageOperations(supabase, operations) {
  for (const item of operations.update) {
    const { error } = await supabase
      .from('product_copy_images')
      .update({
        prompt_number: item.to_prompt_number,
        prompt_role: item.to_prompt_role,
      })
      .eq('id', item.id)

    if (error) throw new Error(`Failed to update product_copy_images ${item.id}: ${error.message}`)
  }

  if (operations.delete.length > 0) {
    const ids = operations.delete.map((item) => item.id)
    const { error } = await supabase
      .from('product_copy_images')
      .delete()
      .in('id', ids)

    if (error) throw new Error(`Failed to delete legacy product_copy_images: ${error.message}`)
  }
}

async function applyPromptOperations(supabase, operations) {
  for (const item of operations.update) {
    const { error } = await supabase
      .from('category_prompts')
      .update({
        prompt_number: item.to_prompt_number,
        prompt_role: item.to_prompt_role,
      })
      .eq('id', item.id)

    if (error) throw new Error(`Failed to update category_prompts ${item.id}: ${error.message}`)
  }

  if (operations.delete.length > 0) {
    const ids = operations.delete.map((item) => item.id)
    const { error } = await supabase
      .from('category_prompts')
      .delete()
      .in('id', ids)

    if (error) throw new Error(`Failed to delete legacy category_prompts: ${error.message}`)
  }
}

function summarizeOperations(imageOperations, promptOperations) {
  return {
    image_updates: imageOperations.update.length,
    image_deletes: imageOperations.delete.length,
    prompt_updates: promptOperations.update.length,
    prompt_deletes: promptOperations.delete.length,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const env = await loadEnvFile(args.envFile)
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in the selected env file.')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const imageRows = await fetchLegacyImageRows(supabase, args.workspace)
  const promptRows = args.mode === 'tasks-and-prompts'
    ? await fetchLegacyPromptRows(supabase, args.workspace)
    : []

  const imageOperations = buildImageOperations(imageRows)
  const promptOperations = buildPromptOperations(promptRows)

  const backupPayload = {
    generated_at: new Date().toISOString(),
    execute: args.execute,
    mode: args.mode,
    workspace: args.workspace,
    env_file: path.resolve(args.envFile),
    before: {
      product_copy_images: imageRows,
      category_prompts: promptRows,
    },
    planned_operations: {
      product_copy_images: imageOperations,
      category_prompts: promptOperations,
    },
    summary: summarizeOperations(imageOperations, promptOperations),
  }

  const backupPath = await writeBackup(args.backupDir, `legacy-six-image-cleanup-${timestamp}.json`, backupPayload)

  if (args.execute) {
    await applyImageOperations(supabase, imageOperations)
    if (args.mode === 'tasks-and-prompts') {
      await applyPromptOperations(supabase, promptOperations)
    }
  }

  console.log(JSON.stringify({
    dry_run: !args.execute,
    mode: args.mode,
    workspace: args.workspace,
    backup: backupPath,
    summary: backupPayload.summary,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
