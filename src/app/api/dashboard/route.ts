import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaceContext, getWorkspaceSupabase } from '@/lib/workspace'

type StatusRow = {
  id: string
  sku?: string
  status?: string
  listing_status?: string
  error_message?: string | null
  created_at: string
  language_label?: string
  copy_index?: number
  products?: { source_title?: string | null } | null
}

type ImageRow = {
  id: string
  copy_id: string
  prompt_number: number
  prompt_role: string
  status: string
  error_message: string | null
  updated_at: string
  product_copies?: { id: string; sku: string; workspace_key: string } | null
}

function todayRange() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

function countBy<T>(rows: T[], predicate: (row: T) => boolean) {
  return rows.reduce((sum, row) => sum + (predicate(row) ? 1 : 0), 0)
}

export async function GET(request: NextRequest) {
  const supabase = getWorkspaceSupabase()
  const { user, workspaceKey, error: authError } = await getWorkspaceContext(request)
  if (authError || !user || !workspaceKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { start, end } = todayRange()

  const [productsRes, copiesRes, imagesRes] = await Promise.all([
    supabase
      .from('products')
      .select('id,sku,status,error_message,created_at,source_title')
      .eq('workspace_key', workspaceKey)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('product_copies')
      .select('id,sku,status,listing_status,error_message,created_at,language_label,copy_index,products(source_title)')
      .eq('workspace_key', workspaceKey)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('product_copy_images')
      .select('id,copy_id,prompt_number,prompt_role,status,error_message,updated_at,product_copies!inner(id,sku,workspace_key)')
      .eq('product_copies.workspace_key', workspaceKey)
      .order('updated_at', { ascending: false })
      .limit(300),
  ])

  if (productsRes.error) return NextResponse.json({ error: productsRes.error.message }, { status: 500 })
  if (copiesRes.error) return NextResponse.json({ error: copiesRes.error.message }, { status: 500 })
  if (imagesRes.error) return NextResponse.json({ error: imagesRes.error.message }, { status: 500 })

  const products = (productsRes.data || []) as StatusRow[]
  const copies = (copiesRes.data || []) as StatusRow[]
  const images = (imagesRes.data || []) as unknown as ImageRow[]

  const todayProducts = products.filter((row) => row.created_at >= start && row.created_at < end)
  const todayCopies = copies.filter((row) => row.created_at >= start && row.created_at < end)

  const activeCopies = copies.filter((row) => ['queued', 'generating'].includes(row.status || ''))
  const failedCopies = copies.filter((row) => row.status === 'failed')
  const failedImages = images.filter((row) => row.status === 'failed')

  return NextResponse.json({
    stats: {
      today_products: todayProducts.length,
      today_copy_success: countBy(todayCopies, (row) => row.status === 'completed'),
      today_copy_failed: countBy(todayCopies, (row) => row.status === 'failed'),
      image_failed: failedImages.length,
      not_listed: countBy(copies, (row) => (row.listing_status || 'not_listed') === 'not_listed'),
      listed: countBy(copies, (row) => row.listing_status === 'listed'),
    },
    progress: {
      products: {
        queued: countBy(products, (row) => row.status === 'queued'),
        generating: countBy(products, (row) => row.status === 'generating'),
        completed: countBy(products, (row) => row.status === 'completed'),
        failed: countBy(products, (row) => row.status === 'failed'),
      },
      copies: {
        queued: countBy(copies, (row) => row.status === 'queued'),
        generating: countBy(copies, (row) => row.status === 'generating'),
        completed: countBy(copies, (row) => row.status === 'completed'),
        failed: countBy(copies, (row) => row.status === 'failed'),
      },
      images: {
        queued: countBy(images, (row) => row.status === 'queued'),
        generating: countBy(images, (row) => row.status === 'generating'),
        completed: countBy(images, (row) => row.status === 'completed'),
        failed: failedImages.length,
        needs_review: countBy(images, (row) => row.status === 'needs_review'),
      },
    },
    active_copies: activeCopies.slice(0, 12),
    failed_copies: failedCopies.slice(0, 12),
    failed_images: failedImages.slice(0, 16),
  })
}
