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
import { GenerationMode, isValidGeminiApiKey, parseStoredGeminiSettings, readBuiltinGeminiApiKey } from '@/lib/gemini-settings'
import { isBuiltinKeyEmailAuthorized } from '@/lib/builtin-key-access'
import { isAdminEmail } from '@/lib/admin'

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

  if (!settings) {
    return {
      apiKey: emailAuthorized ? readBuiltinGeminiApiKey() : null,
      generationMode: 'batch',
    }
  }
  const stored = parseStoredGeminiSettings(settings.gemini_api_key_encrypted)
  const generationMode: GenerationMode = isAdminEmail(userEmail) && stored.generationMode === 'direct'
    ? 'direct'
    : 'batch'

  if (
    (settings.use_builtin_key && (settings.builtin_key_password_verified || emailAuthorized)) ||
    (emailAuthorized && !stored.apiKey)
  ) {
    return { apiKey: readBuiltinGeminiApiKey(), generationMode }
  }

  return { apiKey: stored.apiKey || null, generationMode }
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
