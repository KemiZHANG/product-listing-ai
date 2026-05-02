import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: productId } = await params
  const { data: product } = await supabase
    .from('products')
    .select('id, sku')
    .eq('id', productId)
    .eq('workspace_key', workspaceKey)
    .maybeSingle()

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  const formData = await request.formData()
  const files = formData.getAll('files').filter((item): item is File => item instanceof File)
  if (files.length === 0) {
    const file = formData.get('file')
    if (file instanceof File) files.push(file)
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'At least one file is required' }, { status: 400 })
  }

  const inserted = []
  for (const file of files) {
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filename = `${timestamp}_${safeName}`
    const storagePath = `${user.id}/products/${productId}/${filename}`
    const fileBuffer = new Uint8Array(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    const { data: maxSort } = await supabase
      .from('product_images')
      .select('sort_order')
      .eq('product_id', productId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data, error } = await supabase
      .from('product_images')
      .insert({
        product_id: productId,
        original_filename: file.name,
        display_name: file.name.replace(/\.[^/.]+$/, ''),
        storage_path: storagePath,
        sort_order: (maxSort?.sort_order ?? -1) + 1,
      })
      .select()
      .single()

    if (error) {
      await supabase.storage.from('images').remove([storagePath])
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    inserted.push(data)
  }

  return NextResponse.json(inserted, { status: 201 })
}
