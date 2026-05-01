import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getRequestSupabase } from '@/lib/supabase'
import { ensureDefaultRuleTemplates } from '@/lib/default-rules'
import { isSeoKeywordRule } from '@/lib/seo-keywords'

export async function GET(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await ensureDefaultRuleTemplates(supabase, user.id)
  } catch {
    // Rules are still editable if seeding fails; surface database errors from the main query below.
  }

  const { data, error } = await supabase
    .from('rule_templates')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json((data || []).filter((rule) => !isSeoKeywordRule(rule.name, rule.content)))
}

export async function POST(request: NextRequest) {
  const supabase = getRequestSupabase(request)
  const { user, error: authError } = await getAuthenticatedUser(request)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const name = String(body.name || '').trim()
  const content = String(body.content || '').trim()
  const scope = String(body.scope || 'general')

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('rule_templates')
    .insert({
      user_id: user.id,
      name,
      content,
      scope,
      active: body.active !== false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
