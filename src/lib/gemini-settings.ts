export type GenerationMode = 'direct' | 'batch'

const SETTINGS_PREFIX = '__GEMINI_SETTINGS__'

type StoredGeminiSettings = {
  apiKey?: string | null
  generationMode?: GenerationMode
}

export function parseStoredGeminiSettings(value: string | null | undefined): StoredGeminiSettings {
  if (!value) return {}
  if (!value.startsWith(SETTINGS_PREFIX)) {
    return { apiKey: value, generationMode: 'batch' }
  }

  try {
    const parsed = JSON.parse(value.slice(SETTINGS_PREFIX.length)) as StoredGeminiSettings
    return {
      apiKey: parsed.apiKey || null,
      generationMode: parsed.generationMode === 'direct' ? 'direct' : 'batch',
    }
  } catch {
    return { apiKey: value, generationMode: 'batch' }
  }
}

export function encodeStoredGeminiSettings(settings: StoredGeminiSettings) {
  return `${SETTINGS_PREFIX}${JSON.stringify({
    apiKey: settings.apiKey || null,
    generationMode: settings.generationMode === 'direct' ? 'direct' : 'batch',
  })}`
}

export function isValidGeminiApiKey(apiKey: string | null | undefined) {
  return typeof apiKey === 'string' && apiKey.startsWith('AIza') && apiKey.length >= 30
}

export function cleanEnvSecret(value: string | null | undefined) {
  if (!value) return null
  let cleaned = value.trim().replace(/\\n/g, '').replace(/\r?\n/g, '')
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim()
  }
  return cleaned || null
}

export function readBuiltinGeminiApiKey() {
  const configured = cleanEnvSecret(process.env.BUILTIN_GEMINI_API_KEY)
  if (!configured) return null

  if (isValidGeminiApiKey(configured)) {
    return configured
  }

  try {
    const decoded = Buffer.from(configured, 'base64').toString('utf-8')
    const reversed = decoded.split('').reverse().join('')
    return isValidGeminiApiKey(reversed) ? reversed : null
  } catch {
    return null
  }
}
