export const ALLOWED_APP_EMAILS = ['links358p@gmail.com']

export function normalizeEmail(email: string | null | undefined) {
  return (email || '').trim().toLowerCase()
}

export function isAllowedAppEmail(email: string | null | undefined) {
  return ALLOWED_APP_EMAILS.includes(normalizeEmail(email))
}

