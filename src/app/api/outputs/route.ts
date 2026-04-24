import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const categorySlug = searchParams.get('category_slug')
  const date = searchParams.get('date')
  const promptNumber = searchParams.get('prompt_number')
  const search = searchParams.get('search')
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)
  const offset = (page - 1) * limit

  let query = supabase
    .from('outputs')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (categorySlug) {
    query = query.eq('category_slug', categorySlug)
  }

  if (date) {
    // Filter by date (YYYY-MM-DD) - match records created on that date
    const startOfDay = `${date}T00:00:00.000Z`
    const endOfDay = `${date}T23:59:59.999Z`
    query = query.gte('created_at', startOfDay).lte('created_at', endOfDay)
  }

  if (promptNumber) {
    query = query.eq('prompt_number', parseInt(promptNumber, 10))
  }

  if (search) {
    query = query.ilike('image_display_name', `%${search}%`)
  }

  query = query.range(offset, offset + limit - 1)

  const { data: outputs, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: outputs || [],
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  })
}
