import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'
import { cancelGeminiBatch, decodeBatchMeta } from '@/lib/gemini-batch'
import { parseStoredGeminiSettings, readBuiltinGeminiApiKey } from '@/lib/gemini-settings'
import { cancelOpenAIBatch, decodeOpenAIBatchMeta, isValidOpenAIApiKey, readOpenAIImageApiKey } from '@/lib/openai-image'

async function getGeminiApiKey(supabase: ReturnType<typeof getRequestSupabase>, userId: string) {
  const { data: settings } = await supabase
    .from('system_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!settings) return null

  if (settings.use_builtin_key && settings.builtin_key_password_verified) {
    return readBuiltinGeminiApiKey()
  }

  return parseStoredGeminiSettings(settings.gemini_api_key_encrypted).apiKey || null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Fetch snapshots
  const { data: snapshots } = await supabase
    .from('job_snapshots')
    .select('*')
    .eq('job_id', id)

  // Fetch items
  const { data: items } = await supabase
    .from('job_items')
    .select('*')
    .eq('job_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    ...job,
    snapshots: snapshots || [],
    items: items || [],
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Verify ownership
  const { data: job } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    return NextResponse.json({ error: 'Job is already finished' }, { status: 400 })
  }

  const batchMeta = decodeBatchMeta(job.error_message)
  if (batchMeta) {
    const apiKey = await getGeminiApiKey(supabase, user.id)
    if (apiKey) {
      await cancelGeminiBatch(apiKey, batchMeta.batchName).catch(() => null)
    }
  }

  const openAiBatchMeta = decodeOpenAIBatchMeta(job.error_message)
  if (openAiBatchMeta) {
    const apiKey = readOpenAIImageApiKey()
    if (apiKey && isValidOpenAIApiKey(apiKey)) {
      await cancelOpenAIBatch(apiKey, openAiBatchMeta.batchId).catch(() => null)
    }
  }

  // Cancel pending items
  await supabase
    .from('job_items')
    .update({ status: 'cancelled' })
    .eq('job_id', id)
    .eq('status', 'pending')

  // Update job status
  const { data, error } = await supabase
    .from('jobs')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
