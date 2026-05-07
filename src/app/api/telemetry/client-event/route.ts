import { NextRequest, NextResponse } from 'next/server'
import { logServerEvent } from '@/lib/observability'

const ALLOWED_EVENTS = new Set([
  'auth_login_failed',
  'auth_register_failed',
  'auth_access_denied_client',
])

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const event = typeof body?.event === 'string' ? body.event.trim() : ''

  if (!ALLOWED_EVENTS.has(event)) {
    return NextResponse.json({ error: 'Unsupported event' }, { status: 400 })
  }

  const payload = body?.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
    ? body.payload as Record<string, unknown>
    : {}

  logServerEvent('warn', `client.${event}`, {
    ...payload,
    path: request.nextUrl.pathname,
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json({ ok: true })
}
