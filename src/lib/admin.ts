import { normalizeEmail } from './access-control'

export { normalizeEmail }

// Primary admins can always access the company edition and manage email authorizations.
export const PRIMARY_ADMIN_EMAILS = ['links358p@gmail.com']

// Secondary admins are remembered here, but they still need an active authorization record.
export const SECONDARY_ADMIN_EMAILS = ['irenephang220@gmail.com']

export const ADMIN_EMAILS = PRIMARY_ADMIN_EMAILS

export function isAdminEmail(email: string | null | undefined) {
  return ADMIN_EMAILS.includes(normalizeEmail(email))
}

export function isPrimaryAdminEmail(email: string | null | undefined) {
  return PRIMARY_ADMIN_EMAILS.includes(normalizeEmail(email))
}

export function isSecondaryAdminEmail(email: string | null | undefined) {
  return SECONDARY_ADMIN_EMAILS.includes(normalizeEmail(email))
}
