'use client'

import { supabase } from './supabase'

type TableChangeSubscription = {
  table: string
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE'
  filter?: string
}

type SubscriptionOptions = {
  debounceMs?: number
}

export function subscribeToTableChanges(
  channelName: string,
  subscriptions: TableChangeSubscription[],
  onChange: () => void,
  options: SubscriptionOptions = {}
) {
  const debounceMs = options.debounceMs ?? 350
  let timeoutId: number | null = null

  const triggerChange = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }

    timeoutId = window.setTimeout(() => {
      timeoutId = null
      onChange()
    }, debounceMs)
  }

  let channel = supabase.channel(channelName)

  for (const subscription of subscriptions) {
    channel = channel.on(
      'postgres_changes',
      {
        event: subscription.event || '*',
        schema: 'public',
        table: subscription.table,
        ...(subscription.filter ? { filter: subscription.filter } : {}),
      },
      triggerChange
    )
  }

  channel.subscribe()

  return () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }
    void supabase.removeChannel(channel)
  }
}
