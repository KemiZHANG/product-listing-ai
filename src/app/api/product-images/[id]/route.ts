import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'

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
  const { data: image } = await supabase
    .from('product_images')
    .select('id, storage_path, products!inner(user_id)')
    .eq('id', id)
    .eq('products.user_id', user.id)
    .maybeSingle()

  if (!image) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('product_images')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.storage.from('images').remove([image.storage_path])
  return NextResponse.json({ success: true })
}
