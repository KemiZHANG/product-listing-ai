import { NextRequest, NextResponse } from 'next/server'
import { isResumeEdition } from '@/lib/app-edition'
import { APP_AUTH_ERROR, isAppEmailAuthorized } from '@/lib/app-auth'
import { normalizeEmail } from '@/lib/admin'
import { logServerEvent } from '@/lib/observability'
import { ensurePresetCategoriesForUser } from '@/lib/preset-seed'
import { getServerSupabase } from '@/lib/supabase'
import { getWorkspaceKeyForEmail } from '@/lib/workspace'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()
    const normalizedEmail = normalizeEmail(email)
    const edition = isResumeEdition() ? 'resume' : 'company'

    if (!normalizedEmail || !password) {
      logServerEvent('warn', 'auth.register_invalid_input', { edition })
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    if (String(password).length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
    }

    if (!isResumeEdition() && !await isAppEmailAuthorized(normalizedEmail)) {
      logServerEvent('warn', 'auth.register_blocked', {
        edition,
        email: normalizedEmail,
      })
      return NextResponse.json({ error: APP_AUTH_ERROR }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    })

    if (error) {
      logServerEvent('warn', 'auth.register_failed', {
        edition,
        email: normalizedEmail,
        reason: error.message,
      })

      const message = error.message.toLowerCase()
      if (message.includes('already') || message.includes('registered') || message.includes('exists')) {
        return NextResponse.json({ error: 'This email is already registered. Please sign in instead.' }, { status: 409 })
      }

      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (data.user) {
      logServerEvent('info', 'auth.register_succeeded', {
        edition,
        email: normalizedEmail,
        userId: data.user.id,
      })

      await ensurePresetCategoriesForUser(
        supabase,
        data.user.id,
        await getWorkspaceKeyForEmail(data.user.email)
      )
    }

    return NextResponse.json({ user: data.user }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed. Please try again.'
    logServerEvent('error', 'auth.register_exception', { message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
