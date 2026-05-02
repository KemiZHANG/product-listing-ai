import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

export async function GET(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('workspace_key', workspaceKey)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(jobs || [])
}

export async function POST(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { category_ids } = body

  if (!category_ids || !Array.isArray(category_ids) || category_ids.length === 0) {
    return NextResponse.json({ error: 'category_ids is required and must be a non-empty array' }, { status: 400 })
  }

  // Verify all categories belong to the current shared workspace.
  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('*')
    .eq('workspace_key', workspaceKey)
    .in('id', category_ids)

  if (catError || !categories || categories.length !== category_ids.length) {
    return NextResponse.json({ error: 'One or more categories not found' }, { status: 404 })
  }

  // Count total items (sum of images * prompts per category)
  let totalItems = 0
  const categoryData: Array<{
    category: typeof categories[0]
    prompts: Array<{ prompt_number: number; prompt_text: string }>
    images: Array<{ id: string; original_filename: string; display_name: string; storage_path: string }>
  }> = []

  for (const cat of categories) {
    const [promptRes, imageRes] = await Promise.all([
      supabase
        .from('category_prompts')
        .select('prompt_number, prompt_text')
        .eq('category_id', cat.id)
        .order('prompt_number', { ascending: true }),
      supabase
        .from('category_images')
        .select('id, original_filename, display_name, storage_path')
        .eq('category_id', cat.id),
    ])

    const prompts = promptRes.data || []
    const images = imageRes.data || []
    totalItems += prompts.length * images.length

    categoryData.push({ category: cat, prompts, images })
  }

  if (totalItems === 0) {
    return NextResponse.json({ error: 'No items to process. Ensure categories have both prompts and images.' }, { status: 400 })
  }

  // Create job record
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({
      user_id: user.id,
      workspace_key: workspaceKey,
      status: 'queued',
      total_items: totalItems,
      completed_items: 0,
      failed_items: 0,
    })
    .select()
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message || 'Failed to create job' }, { status: 500 })
  }

  // Create snapshots and items
  for (const { category, prompts, images } of categoryData) {
    // Create snapshot
    const { data: snapshot, error: snapError } = await supabase
      .from('job_snapshots')
      .insert({
        job_id: job.id,
        category_id: category.id,
        category_name_zh: category.name_zh,
        category_slug: category.slug,
        snapshot_prompts: prompts.map((p) => ({ number: p.prompt_number, text: p.prompt_text })),
        snapshot_images: images.map((img) => ({
          id: img.id,
          original_filename: img.original_filename,
          display_name: img.display_name,
          storage_path: img.storage_path,
        })),
      })
      .select()
      .single()

    if (snapError || !snapshot) continue

    // Create job items (each image x each prompt)
    const items = []
    for (const img of images) {
      for (const prompt of prompts) {
        items.push({
          job_id: job.id,
          snapshot_id: snapshot.id,
          image_display_name: img.display_name,
          image_storage_path: img.storage_path,
          prompt_number: prompt.prompt_number,
          prompt_text: prompt.prompt_text,
          status: 'pending' as const,
        })
      }
    }

    if (items.length > 0) {
      await supabase.from('job_items').insert(items)
    }
  }

  // Update status to running and trigger engine
  await supabase
    .from('jobs')
    .update({ status: 'running' })
    .eq('id', job.id)

  // Call engine asynchronously (fire and forget)
  const engineUrl = new URL('/api/engine', request.url)
  fetch(engineUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: request.headers.get('authorization') || '',
    },
    body: JSON.stringify({ job_id: job.id }),
  }).catch(() => {
    // Engine call failed silently - job items remain pending for retry
  })

  return NextResponse.json(job, { status: 201 })
}
