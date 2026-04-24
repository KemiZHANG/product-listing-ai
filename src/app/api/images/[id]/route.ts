import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { display_name } = body

  if (!display_name) {
    return NextResponse.json({ error: 'display_name is required' }, { status: 400 })
  }

  // Verify ownership through category
  const { data: image } = await supabase
    .from('category_images')
    .select('*, categories!inner(user_id)')
    .eq('id', id)
    .maybeSingle()

  if (!image || (image.categories as unknown as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('category_images')
    .update({ display_name })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Verify ownership through category and get storage path
  const { data: image } = await supabase
    .from('category_images')
    .select('*, categories!inner(user_id)')
    .eq('id', id)
    .maybeSingle()

  if (!image || (image.categories as unknown as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 })
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('images')
    .remove([image.storage_path])

  if (storageError) {
    return NextResponse.json({ error: `Storage delete failed: ${storageError.message}` }, { status: 500 })
  }

  // Delete from database
  const { error } = await supabase
    .from('category_images')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
