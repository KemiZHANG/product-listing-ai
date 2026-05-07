import { NextRequest, NextResponse } from 'next/server'
import { getAuthorizedUser } from '@/lib/app-auth'

const COOKIE_NAME = 'plai-auth'
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24,
}

export async function POST(request: NextRequest) {
  const { user, error } = await getAuthorizedUser(request)
  if (error || !user) {
    const response = NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 })
    response.cookies.set(COOKIE_NAME, '', { ...COOKIE_OPTIONS, maxAge: 0 })
    return response
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, '1', COOKIE_OPTIONS)
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, '', { ...COOKIE_OPTIONS, maxAge: 0 })
  return response
}
