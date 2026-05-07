import type { User } from '@supabase/supabase-js'
import { getServerSupabase } from './supabase'

function profileDisplayName(user: User) {
  const raw = user.user_metadata?.display_name
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (user.email) return user.email.split('@')[0]
  return 'user'
}

export async function ensureProfileForUser(user: User) {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read profile: ${error.message}`)
  }

  if (data?.id) return

  const { error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      email: user.email || null,
      display_name: profileDisplayName(user),
    })

  if (insertError) {
    throw new Error(`Failed to create profile: ${insertError.message}`)
  }
}
