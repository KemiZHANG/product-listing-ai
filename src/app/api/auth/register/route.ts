import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { ensurePresetCategoriesForUser } from '@/lib/preset-seed'
import { isAllowedAppEmail } from '@/lib/access-control'

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: '请输入邮箱和密码' }, { status: 400 })
  }

  if (!isAllowedAppEmail(email)) {
    return NextResponse.json({ error: '当前网站还在内测优化中，暂时只允许指定账号登录。' }, { status: 403 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: '密码至少需要 6 位' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('already') || message.includes('registered') || message.includes('exists')) {
      return NextResponse.json({ error: '这个邮箱已经注册过，请切换到登录。' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (data.user) {
    await ensurePresetCategoriesForUser(supabase, data.user.id)
  }

  return NextResponse.json({ user: data.user }, { status: 201 })
}
