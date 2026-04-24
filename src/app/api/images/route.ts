import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const supabase = getServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const category_id = formData.get('category_id') as string | null
  const display_name = formData.get('display_name') as string | null

  if (!file || !category_id) {
    return NextResponse.json({ error: 'file and category_id are required' }, { status: 400 })
  }

  // Verify the category belongs to the user
  const { data: category } = await supabase
    .from('categories')
    .select('id')
    .eq('id', category_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  // Generate a unique filename
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filename = `${timestamp}_${safeName}`
  const storagePath = `${user.id}/${category_id}/${filename}`

  // Upload to Supabase Storage
  const arrayBuffer = await file.arrayBuffer()
  const fileBuffer = new Uint8Array(arrayBuffer)

  const { error: uploadError } = await supabase.storage
    .from('images')
    .upload(storagePath, fileBuffer, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
  }

  // Insert record into category_images
  const { data, error } = await supabase
    .from('category_images')
    .insert({
      category_id,
      original_filename: file.name,
      display_name: display_name || file.name.replace(/\.[^/.]+$/, ''),
      storage_path: storagePath,
    })
    .select()
    .single()

  if (error) {
    // Clean up uploaded file if DB insert fails
    await supabase.storage.from('images').remove([storagePath])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
