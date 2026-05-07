import { NextRequest, NextResponse } from 'next/server'
import { getAuthorizedUser } from '@/lib/app-auth'
import { logServerEvent } from '@/lib/observability'
import { getServerSupabase } from '@/lib/supabase'

const ALLOWED_BUCKETS = new Set(['images', 'outputs'])

export async function POST(request: NextRequest) {
  const { user, error: authError } = await getAuthorizedUser(request)
  if (authError || !user) {
    logServerEvent('warn', 'storage.signed_url_denied', {
      reason: authError || 'Unauthorized',
      path: request.nextUrl.pathname,
    })
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const bucket = String(body.bucket || '').trim()
  const paths: string[] = Array.isArray(body.paths)
    ? Array.from(new Set(body.paths.map((path: unknown) => String(path || '').trim()).filter(Boolean)))
    : []

  if (!ALLOWED_BUCKETS.has(bucket)) {
    logServerEvent('warn', 'storage.signed_url_invalid_bucket', {
      bucket,
      userId: user.id,
    })
    return NextResponse.json({ error: 'Unsupported storage bucket' }, { status: 400 })
  }

  if (paths.length === 0) {
    return NextResponse.json({ urls: {} })
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, 60 * 60)

  if (error) {
    logServerEvent('error', 'storage.signed_url_failed', {
      bucket,
      pathCount: paths.length,
      userId: user.id,
      message: error.message,
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const urls = Object.fromEntries((data || []).map((item) => [item.path, item.signedUrl || '']))

  return NextResponse.json({ urls })
}
