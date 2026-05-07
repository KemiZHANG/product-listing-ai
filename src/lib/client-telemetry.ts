'use client'

type ClientEventName =
  | 'auth_login_failed'
  | 'auth_register_failed'
  | 'auth_access_denied_client'
  | 'api_server_error'
  | 'storage_signed_url_failed'

export async function postClientEvent(event: ClientEventName, payload: Record<string, unknown> = {}) {
  try {
    await fetch('/api/telemetry/client-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, payload }),
      keepalive: true,
    })
  } catch {
    // Telemetry should never block the user flow.
  }
}
