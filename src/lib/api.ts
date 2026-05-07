import { supabase } from './supabase'
import { signOutAndRedirectToLogin } from './client-auth'

const RETRYABLE_METHODS = new Set(['GET', 'HEAD'])
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])
const MAX_RETRY_ATTEMPTS = 2

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shouldRetry(method: string, response: Response) {
  return RETRYABLE_METHODS.has(method) && RETRYABLE_STATUS_CODES.has(response.status)
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(init.headers)
  const method = (init.method || 'GET').toUpperCase()

  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  let lastError: unknown = null
  let response: Response | null = null

  for (let attempt = 0; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      response = await fetch(input, {
        cache: 'no-store',
        ...init,
        headers,
      })

      if (!shouldRetry(method, response) || attempt === MAX_RETRY_ATTEMPTS) {
        break
      }
    } catch (error) {
      lastError = error
      if (!RETRYABLE_METHODS.has(method) || attempt === MAX_RETRY_ATTEMPTS) {
        throw error
      }
    }

    await sleep(250 * (attempt + 1))
  }

  if (!response) {
    throw lastError instanceof Error ? lastError : new Error('Request failed')
  }

  if (typeof window !== 'undefined' && response.status === 401) {
    void signOutAndRedirectToLogin()
  }

  return response
}
