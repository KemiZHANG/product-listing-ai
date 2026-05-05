export type AppEdition = 'company' | 'resume'

export function getAppEdition(): AppEdition {
  const value = String(process.env.APP_EDITION || process.env.NEXT_PUBLIC_APP_EDITION || '')
    .trim()
    .toLowerCase()

  return value === 'resume' ? 'resume' : 'company'
}

export function isResumeEdition() {
  return getAppEdition() === 'resume'
}

export function isCompanyEdition() {
  return getAppEdition() === 'company'
}
