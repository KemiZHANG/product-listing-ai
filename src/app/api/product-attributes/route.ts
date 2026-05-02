import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

export async function GET(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('product_attribute_columns')
    .select('*')
    .eq('workspace_key', workspaceKey)
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}

export async function POST(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const name = String(body.name || '').trim()
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data: maxSort } = await supabase
    .from('product_attribute_columns')
    .select('sort_order')
    .eq('workspace_key', workspaceKey)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('product_attribute_columns')
    .insert({
      user_id: user.id,
      workspace_key: workspaceKey,
      name,
      sort_order: (maxSort?.sort_order ?? -1) + 1,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
