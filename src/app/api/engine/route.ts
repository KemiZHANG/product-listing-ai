import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'
import {
  createGeminiBatch,
  decodeBatchMeta,
  downloadGeminiFile,
  encodeBatchMeta,
  getBatchErrorMessage,
  getBatchResultFile,
  getBatchState,
  getGeminiBatch,
  uploadBatchInputFile,
} from '@/lib/gemini-batch'
import { GenerationMode, ImageProvider, isValidGeminiApiKey, parseStoredGeminiSettings, readBuiltinGeminiApiKey } from '@/lib/gemini-settings'
import { isBuiltinKeyEmailAuthorized } from '@/lib/builtin-key-access'
import { isAdminEmail } from '@/lib/admin'
import {
  createOpenAIBatch,
  decodeOpenAIBatchMeta,
  downloadOpenAIFileContent,
  editOpenAIImageDirect,
  encodeOpenAIBatchMeta,
  extractOpenAIImageBase64,
  getOpenAIBatch,
  getOpenAIImageModel,
  isValidOpenAIApiKey,
  readOpenAIImageApiKey,
  uploadOpenAIBatchInputFile,
  uploadOpenAIVisionFile,
} from '@/lib/openai-image'

export const maxDuration = 300

type RequestSupabase = ReturnType<typeof getRequestSupabase>

type JobRecord = {
  id: string
  user_id: string
  status: string
  total_items: number
  error_message: string | null
}

type JobItemRecord = {
  id: string
  job_id: string
  snapshot_id: string
  image_display_name: string
  image_storage_path: string
  prompt_number: number
  prompt_text: string
  status: string
}

async function getGeminiSettings(
  supabase: RequestSupabase,
  userId: string,
  userEmail?: string | null
): Promise<{ apiKey: string | null; generationMode: GenerationMode }> {
  const { data: settings } = await supabase
    .from('system_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  const emailAuthorized = await isBuiltinKeyEmailAuthorized(userEmail)
  const admin = isAdminEmail(userEmail)

  if (!settings) {
    return {
      apiKey: (admin || emailAuthorized) ? readBuiltinGeminiApiKey() : null,
      generationMode: 'batch',
    }
  }
  const stored = parseStoredGeminiSettings(settings.gemini_api_key_encrypted)
  const generationMode: GenerationMode = emailAuthorized && !admin
    ? 'batch'
    : (stored.generationMode === 'direct' ? 'direct' : 'batch')

  if (
    admin ||
    (settings.use_builtin_key && (settings.builtin_key_password_verified || emailAuthorized)) ||
    (emailAuthorized && !admin)
  ) {
    return { apiKey: readBuiltinGeminiApiKey(), generationMode }
  }

  return { apiKey: stored.apiKey || null, generationMode }
}

async function getImageGenerationSettings(
  supabase: RequestSupabase,
  userId: string,
  userEmail?: string | null
): Promise<{ provider: ImageProvider; apiKey: string | null; generationMode: GenerationMode }> {
  const { data: settings } = await supabase
    .from('system_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  const stored = parseStoredGeminiSettings(settings?.gemini_api_key_encrypted)
  const admin = isAdminEmail(userEmail)
  const emailAuthorized = await isBuiltinKeyEmailAuthorized(userEmail)
  const passwordVerified = Boolean(settings?.use_builtin_key && settings?.builtin_key_password_verified)
  const provider: ImageProvider = emailAuthorized && !admin
    ? 'gemini'
    : (stored.imageProvider === 'openai' ? 'openai' : 'gemini')
  const generationMode: GenerationMode = emailAuthorized && !admin
    ? 'batch'
    : (stored.generationMode === 'direct' ? 'direct' : 'batch')

  if (provider === 'openai') {
    return {
      provider,
      apiKey: (admin || passwordVerified) ? readOpenAIImageApiKey() : (stored.openaiApiKey || null),
      generationMode,
    }
  }

  const gemini = await getGeminiSettings(supabase, userId, userEmail)
  return {
    provider,
    apiKey: gemini.apiKey,
    generationMode: gemini.generationMode,
  }
}

async function generateImageDirect(apiKey: string, promptText: string, imageBase64: string, mimeType: string): Promise<string | null> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Gemini Direct API error ${response.status}: ${await response.text()}`)
  }

  return extractGeneratedImageBase64(await response.json())
}

function getMimeType(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() || 'jpg'
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  }
  return mimeMap[ext] || 'image/jpeg'
}

function getSourceFilename(item: JobItemRecord) {
  const rawExt = item.image_storage_path.split('.').pop()?.toLowerCase()
  const ext = rawExt && rawExt.length <= 5 ? rawExt : 'jpg'
  const safeName = item.image_display_name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'source'
  return `${safeName}.${ext}`
}

function extractGeneratedImageBase64(response: unknown): string | null {
  const parts = (response as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inline_data?: { data?: string }
          inlineData?: { data?: string }
        }>
      }
    }>
  })?.candidates?.[0]?.content?.parts

  if (!parts) return null

  for (const part of parts) {
    const data = part.inline_data?.data || part.inlineData?.data
    if (data) return data
  }

  return null
}

function parseBatchResultLines(jsonl: string) {
  return jsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      key?: string
      response?: unknown
      error?: { message?: string } | string
    })
}

async function buildBatchInputJsonl(supabase: RequestSupabase, items: JobItemRecord[]) {
  const lines: string[] = []

  for (const item of items) {
    const { data: fileData, error } = await supabase.storage
      .from('images')
      .download(item.image_storage_path)

    if (error || !fileData) {
      throw new Error(`Failed to download source image ${item.image_display_name}: ${error?.message}`)
    }

    const imageBase64 = Buffer.from(await fileData.arrayBuffer()).toString('base64')
    lines.push(JSON.stringify({
      key: item.id,
      request: {
        contents: [
          {
            role: 'user',
            parts: [
              { text: item.prompt_text },
              {
                inline_data: {
                  mime_type: getMimeType(item.image_storage_path),
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['IMAGE'],
        },
      },
    }))
  }

  return `${lines.join('\n')}\n`
}

async function startBatchJob(supabase: RequestSupabase, apiKey: string, job: JobRecord) {
  const { data: items, error: itemsError } = await supabase
    .from('job_items')
    .select('*')
    .eq('job_id', job.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (itemsError || !items || items.length === 0) {
    await supabase
      .from('jobs')
      .update({
        status: 'failed',
        error_message: 'No pending items found',
      })
      .eq('id', job.id)
    return { error: 'No pending items found', status: 400 }
  }

  const jsonl = await buildBatchInputJsonl(supabase, items as JobItemRecord[])
  const inputFileName = await uploadBatchInputFile(apiKey, jsonl, `nano-banana-${job.id}`)
  const batchName = await createGeminiBatch(apiKey, inputFileName, `nano-banana-${job.id}`)

  const itemIds = items.map((item) => item.id)
  await supabase
    .from('job_items')
    .update({ status: 'running' })
    .in('id', itemIds)

  await supabase
    .from('jobs')
    .update({
      status: 'running',
      error_message: encodeBatchMeta({
        kind: 'gemini_batch',
        batchName,
        inputFileName,
        createdAt: new Date().toISOString(),
      }),
    })
    .eq('id', job.id)

  return {
    success: true,
    status: 'running',
    batch_name: batchName,
    total: items.length,
  }
}

async function markBatchTerminalFailure(
  supabase: RequestSupabase,
  jobId: string,
  status: 'failed' | 'cancelled',
  message: string
) {
  const itemStatus = status === 'cancelled' ? 'cancelled' : 'failed'

  await supabase
    .from('job_items')
    .update({
      status: itemStatus,
      error_message: message,
    })
    .eq('job_id', jobId)
    .in('status', ['pending', 'running'])

  const { count: failedCount } = await supabase
    .from('job_items')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .eq('status', itemStatus)

  await supabase
    .from('jobs')
    .update({
      status,
      failed_items: status === 'failed' ? failedCount || 0 : 0,
      error_message: message,
    })
    .eq('id', jobId)
}

async function processBatchResults(supabase: RequestSupabase, apiKey: string, job: JobRecord, resultFileName: string) {
  const resultJsonl = await downloadGeminiFile(apiKey, resultFileName)
  const resultLines = parseBatchResultLines(resultJsonl)
  let completedCount = 0
  let failedCount = 0

  for (const result of resultLines) {
    if (!result.key) continue

    const { data: item } = await supabase
      .from('job_items')
      .select('*')
      .eq('id', result.key)
      .eq('job_id', job.id)
      .maybeSingle()

    if (!item || item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled') {
      continue
    }

    const errorMessage = typeof result.error === 'string' ? result.error : result.error?.message
    const generatedBase64 = errorMessage ? null : extractGeneratedImageBase64(result.response)

    if (!generatedBase64) {
      await supabase
        .from('job_items')
        .update({
          status: 'failed',
          error_message: errorMessage || 'No image returned from Gemini Batch API',
        })
        .eq('id', item.id)
      failedCount++
      continue
    }

    const outputFilename = `${item.image_display_name}_prompt${item.prompt_number}_${Date.now()}.png`
    const outputStoragePath = `${job.user_id}/${outputFilename}`
    const outputBuffer = Buffer.from(generatedBase64, 'base64')

    const { error: uploadError } = await supabase.storage
      .from('outputs')
      .upload(outputStoragePath, outputBuffer, {
        contentType: 'image/png',
        upsert: false,
      })

    if (uploadError) {
      await supabase
        .from('job_items')
        .update({
          status: 'failed',
          error_message: `Failed to upload output: ${uploadError.message}`,
        })
        .eq('id', item.id)
      failedCount++
      continue
    }

    const { data: snapshot } = await supabase
      .from('job_snapshots')
      .select('category_id, category_slug')
      .eq('id', item.snapshot_id)
      .single()

    await supabase.from('outputs').insert({
      job_id: job.id,
      job_item_id: item.id,
      user_id: job.user_id,
      category_id: snapshot?.category_id || '',
      category_slug: snapshot?.category_slug || '',
      image_display_name: item.image_display_name,
      prompt_number: item.prompt_number,
      output_filename: outputFilename,
      storage_path: outputStoragePath,
      file_size_bytes: outputBuffer.length,
    })

    await supabase
      .from('job_items')
      .update({
        status: 'completed',
        output_storage_path: outputStoragePath,
        output_filename: outputFilename,
      })
      .eq('id', item.id)

    completedCount++
  }

  const [{ count: completedTotal }, { count: failedTotal }] = await Promise.all([
    supabase
      .from('job_items')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', job.id)
      .eq('status', 'completed'),
    supabase
      .from('job_items')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', job.id)
      .eq('status', 'failed'),
  ])

  const completedItems = completedTotal || completedCount
  const failedItems = failedTotal || failedCount
  const finalStatus = completedItems === job.total_items
    ? 'completed'
    : completedItems > 0
      ? 'partial_success'
      : 'failed'

  await supabase
    .from('jobs')
    .update({
      status: finalStatus,
      completed_items: completedItems,
      failed_items: failedItems,
      error_message: finalStatus === 'completed' ? null : 'Some batch items failed',
    })
    .eq('id', job.id)

  return {
    success: true,
    status: finalStatus,
    completed: completedItems,
    failed: failedItems,
    total: job.total_items,
  }
}

function parseOpenAIBatchResultLines(jsonl: string) {
  return jsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      custom_id?: string
      response?: {
        status_code?: number
        body?: unknown
      }
      error?: { message?: string } | string
    })
}

async function uploadJobOutput(
  supabase: RequestSupabase,
  job: JobRecord,
  item: JobItemRecord,
  generatedBase64: string
) {
  const outputFilename = `${item.image_display_name}_prompt${item.prompt_number}_${Date.now()}.png`
  const outputStoragePath = `${job.user_id}/${outputFilename}`
  const outputBuffer = Buffer.from(generatedBase64, 'base64')

  const { error: uploadError } = await supabase.storage
    .from('outputs')
    .upload(outputStoragePath, outputBuffer, {
      contentType: 'image/png',
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Failed to upload output: ${uploadError.message}`)
  }

  const { data: snapshot } = await supabase
    .from('job_snapshots')
    .select('category_id, category_slug')
    .eq('id', item.snapshot_id)
    .single()

  await supabase.from('outputs').insert({
    job_id: job.id,
    job_item_id: item.id,
    user_id: job.user_id,
    category_id: snapshot?.category_id || '',
    category_slug: snapshot?.category_slug || '',
    image_display_name: item.image_display_name,
    prompt_number: item.prompt_number,
    output_filename: outputFilename,
    storage_path: outputStoragePath,
    file_size_bytes: outputBuffer.length,
  })

  await supabase
    .from('job_items')
    .update({
      status: 'completed',
      output_storage_path: outputStoragePath,
      output_filename: outputFilename,
    })
    .eq('id', item.id)

  return outputStoragePath
}

async function runOpenAIDirectJob(supabase: RequestSupabase, apiKey: string, job: JobRecord) {
  const { data: items, error: itemsError } = await supabase
    .from('job_items')
    .select('*')
    .eq('job_id', job.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (itemsError || !items || items.length === 0) {
    return { error: 'No pending items found', status: 400 }
  }

  await supabase
    .from('job_items')
    .update({ status: 'running' })
    .in('id', items.map((item) => item.id))

  await supabase
    .from('jobs')
    .update({
      status: 'running',
      error_message: null,
    })
    .eq('id', job.id)

  let completedCount = 0
  let failedCount = 0

  for (const item of items as JobItemRecord[]) {
    const { data: currentJob } = await supabase
      .from('jobs')
      .select('status')
      .eq('id', job.id)
      .single()

    if (currentJob?.status === 'cancelled') {
      await supabase
        .from('job_items')
        .update({ status: 'cancelled' })
        .eq('job_id', job.id)
        .eq('status', 'running')
      break
    }

    try {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('images')
        .download(item.image_storage_path)

      if (downloadError || !fileData) {
        throw new Error(`Failed to download source image: ${downloadError?.message}`)
      }

      const imageBuffer = Buffer.from(await fileData.arrayBuffer())
      const generatedBase64 = await editOpenAIImageDirect(
        apiKey,
        item.prompt_text,
        imageBuffer,
        getMimeType(item.image_storage_path),
        getSourceFilename(item)
      )

      if (!generatedBase64) {
        throw new Error('No image returned from OpenAI GPT Image 2 API')
      }

      await uploadJobOutput(supabase, job, item, generatedBase64)
      completedCount++
    } catch (err) {
      await supabase
        .from('job_items')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : 'Unknown OpenAI direct error',
        })
        .eq('id', item.id)

      failedCount++
    }
  }

  const finalStatus = completedCount === items.length
    ? 'completed'
    : completedCount > 0
      ? 'partial_success'
      : 'failed'

  await supabase
    .from('jobs')
    .update({
      status: finalStatus,
      completed_items: completedCount,
      failed_items: failedCount,
      error_message: finalStatus === 'completed' ? null : 'Some OpenAI direct items failed',
    })
    .eq('id', job.id)

  return {
    success: true,
    status: finalStatus,
    completed: completedCount,
    failed: failedCount,
    total: items.length,
  }
}

async function buildOpenAIBatchInputJsonl(supabase: RequestSupabase, apiKey: string, items: JobItemRecord[]) {
  const fileIdsByPath = new Map<string, string>()
  const lines: string[] = []

  for (const item of items) {
    let fileId = fileIdsByPath.get(item.image_storage_path)

    if (!fileId) {
      const { data: fileData, error } = await supabase.storage
        .from('images')
        .download(item.image_storage_path)

      if (error || !fileData) {
        throw new Error(`Failed to download source image ${item.image_display_name}: ${error?.message}`)
      }

      const imageBuffer = Buffer.from(await fileData.arrayBuffer())
      fileId = await uploadOpenAIVisionFile(
        apiKey,
        imageBuffer,
        getMimeType(item.image_storage_path),
        getSourceFilename(item)
      )
      fileIdsByPath.set(item.image_storage_path, fileId)
    }

    lines.push(JSON.stringify({
      custom_id: item.id,
      method: 'POST',
      url: '/v1/images/edits',
      body: {
        model: getOpenAIImageModel(),
        prompt: item.prompt_text,
        images: [{ file_id: fileId }],
        n: 1,
        output_format: 'png',
      },
    }))
  }

  return `${lines.join('\n')}\n`
}

async function startOpenAIBatchJob(supabase: RequestSupabase, apiKey: string, job: JobRecord) {
  const { data: items, error: itemsError } = await supabase
    .from('job_items')
    .select('*')
    .eq('job_id', job.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (itemsError || !items || items.length === 0) {
    await supabase
      .from('jobs')
      .update({
        status: 'failed',
        error_message: 'No pending items found',
      })
      .eq('id', job.id)
    return { error: 'No pending items found', status: 400 }
  }

  const jsonl = await buildOpenAIBatchInputJsonl(supabase, apiKey, items as JobItemRecord[])
  const inputFileId = await uploadOpenAIBatchInputFile(apiKey, jsonl, `nano-banana-openai-${job.id}.jsonl`)
  const batchId = await createOpenAIBatch(apiKey, inputFileId, `nano-banana-openai-${job.id}`)

  const itemIds = items.map((item) => item.id)
  await supabase
    .from('job_items')
    .update({ status: 'running' })
    .in('id', itemIds)

  await supabase
    .from('jobs')
    .update({
      status: 'running',
      error_message: encodeOpenAIBatchMeta({
        kind: 'openai_batch',
        batchId,
        inputFileId,
        createdAt: new Date().toISOString(),
      }),
    })
    .eq('id', job.id)

  return {
    success: true,
    status: 'running',
    batch_name: batchId,
    total: items.length,
  }
}

async function processOpenAIBatchResults(supabase: RequestSupabase, apiKey: string, job: JobRecord, outputFileId: string) {
  const resultJsonl = await downloadOpenAIFileContent(apiKey, outputFileId)
  const resultLines = parseOpenAIBatchResultLines(resultJsonl)
  let completedCount = 0
  let failedCount = 0

  for (const result of resultLines) {
    if (!result.custom_id) continue

    const { data: item } = await supabase
      .from('job_items')
      .select('*')
      .eq('id', result.custom_id)
      .eq('job_id', job.id)
      .maybeSingle()

    if (!item || item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled') {
      continue
    }

    const errorMessage = typeof result.error === 'string'
      ? result.error
      : result.error?.message || (result.response?.status_code && result.response.status_code >= 400 ? JSON.stringify(result.response.body) : null)
    const generatedBase64 = errorMessage ? null : extractOpenAIImageBase64(result.response?.body)

    if (!generatedBase64) {
      await supabase
        .from('job_items')
        .update({
          status: 'failed',
          error_message: errorMessage || 'No image returned from OpenAI Batch API',
        })
        .eq('id', item.id)
      failedCount++
      continue
    }

    try {
      await uploadJobOutput(supabase, job, item as JobItemRecord, generatedBase64)
      completedCount++
    } catch (err) {
      await supabase
        .from('job_items')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : 'Failed to store OpenAI output',
        })
        .eq('id', item.id)
      failedCount++
    }
  }

  const [{ count: completedTotal }, { count: failedTotal }] = await Promise.all([
    supabase
      .from('job_items')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', job.id)
      .eq('status', 'completed'),
    supabase
      .from('job_items')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', job.id)
      .eq('status', 'failed'),
  ])

  const completedItems = completedTotal || completedCount
  const failedItems = failedTotal || failedCount
  const finalStatus = completedItems === job.total_items
    ? 'completed'
    : completedItems > 0
      ? 'partial_success'
      : 'failed'

  await supabase
    .from('jobs')
    .update({
      status: finalStatus,
      completed_items: completedItems,
      failed_items: failedItems,
      error_message: finalStatus === 'completed' ? null : 'Some OpenAI batch items failed',
    })
    .eq('id', job.id)

  return {
    success: true,
    status: finalStatus,
    completed: completedItems,
    failed: failedItems,
    total: job.total_items,
  }
}

async function runOrPollOpenAIJob(supabase: RequestSupabase, apiKey: string, job: JobRecord, generationMode: GenerationMode) {
  const meta = decodeOpenAIBatchMeta(job.error_message)
  if (!meta && generationMode === 'direct') {
    return runOpenAIDirectJob(supabase, apiKey, job)
  }

  if (!meta) {
    return startOpenAIBatchJob(supabase, apiKey, job)
  }

  const batch = await getOpenAIBatch(apiKey, meta.batchId)

  if (batch.status === 'completed') {
    if (!batch.output_file_id) {
      await markBatchTerminalFailure(supabase, job.id, 'failed', 'OpenAI batch completed but no output file was returned')
      return { error: 'OpenAI batch completed but no output file was returned', status: 500 }
    }
    return processOpenAIBatchResults(supabase, apiKey, job, batch.output_file_id)
  }

  if (['failed', 'expired', 'cancelled'].includes(batch.status)) {
    const message = `OpenAI batch ended with ${batch.status}${batch.errors ? `: ${JSON.stringify(batch.errors)}` : ''}`
    await markBatchTerminalFailure(supabase, job.id, batch.status === 'cancelled' ? 'cancelled' : 'failed', message)
    return { error: message, status: batch.status === 'cancelled' ? 200 : 500 }
  }

  return {
    success: true,
    status: 'running',
    batch_state: batch.status,
    batch_name: meta.batchId,
  }
}

async function runDirectJob(supabase: RequestSupabase, apiKey: string, job: JobRecord) {
  const { data: items, error: itemsError } = await supabase
    .from('job_items')
    .select('*')
    .eq('job_id', job.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (itemsError || !items || items.length === 0) {
    return { error: 'No pending items found', status: 400 }
  }

  await supabase
    .from('job_items')
    .update({ status: 'running' })
    .in('id', items.map((item) => item.id))

  await supabase
    .from('jobs')
    .update({
      status: 'running',
      error_message: null,
    })
    .eq('id', job.id)

  let completedCount = 0
  let failedCount = 0

  for (const item of items as JobItemRecord[]) {
    const { data: currentJob } = await supabase
      .from('jobs')
      .select('status')
      .eq('id', job.id)
      .single()

    if (currentJob?.status === 'cancelled') {
      await supabase
        .from('job_items')
        .update({ status: 'cancelled' })
        .eq('job_id', job.id)
        .eq('status', 'running')
      break
    }

    try {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('images')
        .download(item.image_storage_path)

      if (downloadError || !fileData) {
        throw new Error(`Failed to download source image: ${downloadError?.message}`)
      }

      const imageBase64 = Buffer.from(await fileData.arrayBuffer()).toString('base64')
      const generatedBase64 = await generateImageDirect(
        apiKey,
        item.prompt_text,
        imageBase64,
        getMimeType(item.image_storage_path)
      )

      if (!generatedBase64) {
        throw new Error('No image returned from Gemini Direct API')
      }

      const outputFilename = `${item.image_display_name}_prompt${item.prompt_number}_${Date.now()}.png`
      const outputStoragePath = `${job.user_id}/${outputFilename}`
      const outputBuffer = Buffer.from(generatedBase64, 'base64')

      const { error: uploadError } = await supabase.storage
        .from('outputs')
        .upload(outputStoragePath, outputBuffer, {
          contentType: 'image/png',
          upsert: false,
        })

      if (uploadError) {
        throw new Error(`Failed to upload output: ${uploadError.message}`)
      }

      const { data: snapshot } = await supabase
        .from('job_snapshots')
        .select('category_id, category_slug')
        .eq('id', item.snapshot_id)
        .single()

      await supabase.from('outputs').insert({
        job_id: job.id,
        job_item_id: item.id,
        user_id: job.user_id,
        category_id: snapshot?.category_id || '',
        category_slug: snapshot?.category_slug || '',
        image_display_name: item.image_display_name,
        prompt_number: item.prompt_number,
        output_filename: outputFilename,
        storage_path: outputStoragePath,
        file_size_bytes: outputBuffer.length,
      })

      await supabase
        .from('job_items')
        .update({
          status: 'completed',
          output_storage_path: outputStoragePath,
          output_filename: outputFilename,
        })
        .eq('id', item.id)

      completedCount++
    } catch (err) {
      await supabase
        .from('job_items')
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : 'Unknown error',
        })
        .eq('id', item.id)

      failedCount++
    }
  }

  const finalStatus = completedCount === items.length
    ? 'completed'
    : completedCount > 0
      ? 'partial_success'
      : 'failed'

  await supabase
    .from('jobs')
    .update({
      status: finalStatus,
      completed_items: completedCount,
      failed_items: failedCount,
      error_message: finalStatus === 'completed' ? null : 'Some direct items failed',
    })
    .eq('id', job.id)

  return {
    success: true,
    status: finalStatus,
    completed: completedCount,
    failed: failedCount,
    total: items.length,
  }
}

async function runOrPollBatchJob(supabase: RequestSupabase, job: JobRecord, userEmail?: string | null) {
  const { apiKey, generationMode } = await getGeminiSettings(supabase, job.user_id, userEmail)
  if (!apiKey) {
    await supabase
      .from('jobs')
      .update({
        status: 'failed',
        error_message: 'No Gemini API key configured. Please set your API key in settings or enable the built-in key.',
      })
      .eq('id', job.id)
    return { error: 'No Gemini API key configured', status: 400 }
  }

  const meta = decodeBatchMeta(job.error_message)
  if (!meta && generationMode === 'direct') {
    return runDirectJob(supabase, apiKey, job)
  }

  if (!meta) {
    return startBatchJob(supabase, apiKey, job)
  }

  const batch = await getGeminiBatch(apiKey, meta.batchName)
  const state = getBatchState(batch)

  if (state === 'JOB_STATE_SUCCEEDED' || state === 'BATCH_STATE_SUCCEEDED') {
    const resultFileName = getBatchResultFile(batch)
    if (!resultFileName) {
      await markBatchTerminalFailure(supabase, job.id, 'failed', 'Gemini batch succeeded but no result file was returned')
      return { error: 'Gemini batch succeeded but no result file was returned', status: 500 }
    }
    return processBatchResults(supabase, apiKey, job, resultFileName)
  }

  if (
    state === 'JOB_STATE_FAILED' ||
    state === 'JOB_STATE_EXPIRED' ||
    state === 'BATCH_STATE_FAILED' ||
    state === 'BATCH_STATE_EXPIRED'
  ) {
    const message = getBatchErrorMessage(batch) || `Gemini batch ended with ${state}`
    await markBatchTerminalFailure(supabase, job.id, 'failed', message)
    return { error: message, status: 500 }
  }

  if (state === 'JOB_STATE_CANCELLED' || state === 'BATCH_STATE_CANCELLED') {
    await markBatchTerminalFailure(supabase, job.id, 'cancelled', 'Gemini batch was cancelled')
    return { success: true, status: 'cancelled' }
  }

  return {
    success: true,
    status: 'running',
    batch_state: state,
    batch_name: meta.batchName,
  }
}

export async function POST(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { job_id } = body

  if (!job_id) {
    return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
  }

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', job_id)
    .eq('user_id', user.id)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    return NextResponse.json({ error: `Job is already ${job.status}` }, { status: 400 })
  }

  try {
    const geminiMeta = decodeBatchMeta(job.error_message)
    if (geminiMeta) {
      const { apiKey } = await getGeminiSettings(supabase, job.user_id, user.email)
      if (!apiKey || !isValidGeminiApiKey(apiKey)) {
        await supabase
          .from('jobs')
          .update({
            status: 'failed',
            error_message: 'Gemini API Key 无效。请在 Settings 中保存 Google AI Studio 的有效 API Key，通常以 AIza 开头。',
          })
          .eq('id', job.id)
        return NextResponse.json({
          error: 'Gemini API Key 无效。请在 Settings 中保存 Google AI Studio 的有效 API Key，通常以 AIza 开头。',
        }, { status: 400 })
      }

      const result = await runOrPollBatchJob(supabase, job as JobRecord, user.email)
      const status = 'status' in result && typeof result.status === 'number' ? result.status : 200
      return NextResponse.json(result, { status })
    }

    const openAiMeta = decodeOpenAIBatchMeta(job.error_message)
    if (openAiMeta) {
      const openAiApiKey = readOpenAIImageApiKey()
      if (!openAiApiKey || !isValidOpenAIApiKey(openAiApiKey)) {
        await supabase
          .from('jobs')
          .update({
            status: 'failed',
            error_message: 'OpenAI API Key 未配置或无效。请在 Vercel 设置 OPENAI_API_KEY。',
          })
          .eq('id', job.id)
        return NextResponse.json({
          error: 'OpenAI API Key 未配置或无效。请在 Vercel 设置 OPENAI_API_KEY。',
        }, { status: 400 })
      }

      const result = await runOrPollOpenAIJob(supabase, openAiApiKey, job as JobRecord, 'batch')
      const status = 'status' in result && typeof result.status === 'number' ? result.status : 200
      return NextResponse.json(result, { status })
    }

    const generationSettings = await getImageGenerationSettings(supabase, job.user_id, user.email)
    if (generationSettings.provider === 'openai') {
      if (!generationSettings.apiKey || !isValidOpenAIApiKey(generationSettings.apiKey)) {
        await supabase
          .from('jobs')
          .update({
            status: 'failed',
            error_message: 'OpenAI API Key 未配置或无效。请在 Vercel 设置 OPENAI_API_KEY。',
          })
          .eq('id', job.id)
        return NextResponse.json({
          error: 'OpenAI API Key 未配置或无效。请在 Vercel 设置 OPENAI_API_KEY。',
        }, { status: 400 })
      }

      const result = await runOrPollOpenAIJob(
        supabase,
        generationSettings.apiKey,
        job as JobRecord,
        generationSettings.generationMode
      )
      const status = 'status' in result && typeof result.status === 'number' ? result.status : 200
      return NextResponse.json(result, { status })
    }

    const { apiKey } = generationSettings
    if (!apiKey || !isValidGeminiApiKey(apiKey)) {
      await supabase
        .from('jobs')
        .update({
          status: 'failed',
          error_message: 'Gemini API Key 无效。请在 Settings 中保存 Google AI Studio 的有效 API Key，通常以 AIza 开头。',
        })
        .eq('id', job.id)
      return NextResponse.json({
        error: 'Gemini API Key 无效。请在 Settings 中保存 Google AI Studio 的有效 API Key，通常以 AIza 开头。',
      }, { status: 400 })
    }

    const result = await runOrPollBatchJob(supabase, job as JobRecord, user.email)
    const status = 'status' in result && typeof result.status === 'number' ? result.status : 200
    return NextResponse.json(result, { status })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown batch engine error'
    await supabase
      .from('jobs')
      .update({
        status: 'failed',
        error_message: errorMessage,
      })
      .eq('id', job.id)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
