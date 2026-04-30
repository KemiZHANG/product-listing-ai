import { normalizeEmail } from './access-control'

export { normalizeEmail }

export const ADMIN_EMAILS = ['links358p@gmail.com']

export function isAdminEmail(email: string | null | undefined) {
  return ADMIN_EMAILS.includes(normalizeEmail(email))
}
