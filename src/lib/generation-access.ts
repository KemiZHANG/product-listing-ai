import { isAdminEmail } from './admin'
import { isBuiltinKeyEmailAuthorized } from './builtin-key-access'
import { isValidGeminiApiKey, parseStoredGeminiSettings, readBuiltinGeminiApiKey } from './gemini-settings'
import { isValidOpenAIApiKey, readOpenAIImageApiKey } from './openai-image'

type SupabaseForGenerationAccess = {
  from: (table: 'system_settings') => {
    select: (columns: string) => {
      eq: (column: 'user_id', value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>
      }
    }
  }
}

export const AI_ACCESS_ERROR = 'AI generation requires an authorized company email, a verified built-in API password, or your own valid API key.'

export async function getGenerationAccess(
  supabaseClient: unknown,
  userId: string,
  userEmail?: string | null
) {
  const supabase = supabaseClient as SupabaseForGenerationAccess
  const { data: settings } = await supabase
    .from('system_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  const stored = parseStoredGeminiSettings(settings?.gemini_api_key_encrypted as string | null | undefined)
  const admin = isAdminEmail(userEmail)
  const emailAuthorized = await isBuiltinKeyEmailAuthorized(userEmail)
  const passwordVerified = Boolean(settings?.use_builtin_key && settings?.builtin_key_password_verified)
  const hasOwnGeminiKey = isValidGeminiApiKey(stored.apiKey)
  const hasOwnOpenAIKey = isValidOpenAIApiKey(stored.openaiApiKey)
  const hasBuiltinGeminiKey = isValidGeminiApiKey(readBuiltinGeminiApiKey())
  const hasBuiltinOpenAIKey = isValidOpenAIApiKey(readOpenAIImageApiKey())
  const canUseBuiltin = admin || emailAuthorized || passwordVerified

  return {
    allowed: hasOwnGeminiKey || hasOwnOpenAIKey || (canUseBuiltin && (hasBuiltinGeminiKey || hasBuiltinOpenAIKey)),
    admin,
    emailAuthorized,
    passwordVerified,
    hasOwnGeminiKey,
    hasOwnOpenAIKey,
  }
}
