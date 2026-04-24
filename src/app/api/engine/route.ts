import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const maxDuration = 300

async function getGeminiApiKey(supabase: ReturnType<typeof getServerSupabase>, userId: string): Promise<string | null> {
  const { data: settings } = await supabase
    .from('system_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!settings) return null

  if (settings.use_builtin_key && settings.builtin_key_password_verified) {
    const encoded = process.env.BUILTIN_GEMINI_API_KEY
    if (!encoded) return null
    // Decode: base64 of reversed key -> reverse decoded string to get real key
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
    const realKey = decoded.split('').reverse().join('')
    return realKey
  }

  return settings.gemini_api_key_encrypted || null
}

async function generateImage(apiKey: string, promptText: string, imageBase64: string, mimeType: string): Promise<string | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64,
              },
            },
          ],
          role: 'user',
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()

  // Extract image from response
  const parts = data?.candidates?.[0]?.content?.parts
  if (!parts) return null

  for (const part of parts) {
    if (part.inline_data?.data) {
      return part.inline_data.data
    }
  }

  return null
}

export async function POST(request: NextRequest) {
  const supabase = getServerSupabase()

  const body = await request.json()
  const { job_id } = body

  if (!job_id) {
    return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
  }

  // Fetch the job
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', job_id)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    return NextResponse.json({ error: `Job is already ${job.status}` }, { status: 400 })
  }

  // Get API key
  const apiKey = await getGeminiApiKey(supabase, job.user_id)
  if (!apiKey) {
    await supabase
      .from('jobs')
      .update({
        status: 'failed',
        error_message: 'No Gemini API key configured. Please set your API key in settings or enable the built-in key.',
      })
      .eq('id', job_id)
    return NextResponse.json({ error: 'No Gemini API key configured' }, { status: 400 })
  }

  // Fetch pending items
  const { data: items, error: itemsError } = await supabase
    .from('job_items')
    .select('*')
    .eq('job_id', job_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (itemsError || !items || items.length === 0) {
    return NextResponse.json({ error: 'No pending items found' }, { status: 400 })
  }

  // Mark items as running
  const itemIds = items.map((i) => i.id)
  await supabase
    .from('job_items')
    .update({ status: 'running' })
    .in('id', itemIds)

  let completedCount = 0
  let failedCount = 0

  // Process each item
  for (const item of items) {
    // Check if job was cancelled mid-processing
    const { data: currentJob } = await supabase
      .from('jobs')
      .select('status')
      .eq('id', job_id)
      .single()

    if (currentJob?.status === 'cancelled') {
      // Cancel remaining running items
      await supabase
        .from('job_items')
        .update({ status: 'cancelled' })
        .eq('job_id', job_id)
        .eq('status', 'running')
      break
    }

    try {
      // Download the source image from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('images')
        .download(item.image_storage_path)

      if (downloadError || !fileData) {
        throw new Error(`Failed to download source image: ${downloadError?.message}`)
      }

      // Convert to base64
      const arrayBuffer = await fileData.arrayBuffer()
      const imageBase64 = Buffer.from(arrayBuffer).toString('base64')

      // Determine mime type
      const ext = item.image_storage_path.split('.').pop()?.toLowerCase() || 'jpg'
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
      }
      const mimeType = mimeMap[ext] || 'image/jpeg'

      // Call Gemini API
      const generatedBase64 = await generateImage(apiKey, item.prompt_text, imageBase64, mimeType)

      if (!generatedBase64) {
        throw new Error('No image returned from Gemini API')
      }

      // Generate output filename
      const outputFilename = `${item.image_display_name}_prompt${item.prompt_number}_${Date.now()}.png`
      const outputStoragePath = `outputs/${job.user_id}/${outputFilename}`

      // Upload generated image to storage
      const outputBuffer = Buffer.from(generatedBase64, 'base64')
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(outputStoragePath, outputBuffer, {
          contentType: 'image/png',
          upsert: false,
        })

      if (uploadError) {
        throw new Error(`Failed to upload output: ${uploadError.message}`)
      }

      // Get category info from snapshot
      const { data: snapshot } = await supabase
        .from('job_snapshots')
        .select('category_id, category_slug')
        .eq('id', item.snapshot_id)
        .single()

      // Create output record
      await supabase.from('outputs').insert({
        job_id: job_id,
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

      // Update item as completed
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
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'

      await supabase
        .from('job_items')
        .update({
          status: 'failed',
          error_message: errorMessage,
        })
        .eq('id', item.id)

      failedCount++
    }
  }

  // Update job with final counts
  const totalProcessed = completedCount + failedCount
  const allItems = items.length
  const cancelledCount = allItems - totalProcessed

  let jobStatus: string
  if (completedCount === allItems) {
    jobStatus = 'completed'
  } else if (failedCount === allItems) {
    jobStatus = 'failed'
  } else if (completedCount > 0) {
    jobStatus = 'partial_success'
  } else if (cancelledCount > 0) {
    jobStatus = 'cancelled'
  } else {
    jobStatus = 'failed'
  }

  await supabase
    .from('jobs')
    .update({
      status: jobStatus,
      completed_items: completedCount,
      failed_items: failedCount,
    })
    .eq('id', job_id)

  return NextResponse.json({
    success: true,
    job_id,
    status: jobStatus,
    completed: completedCount,
    failed: failedCount,
    total: allItems,
  })
}
