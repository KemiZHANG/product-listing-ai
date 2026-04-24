import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getServerSupabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServerSupabase()
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
  const supabase = getServerSupabase()
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
