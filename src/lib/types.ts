export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  user_id: string
  name_zh: string
  slug: string
  icon: string
  sort_order: number
  is_preset: boolean
  created_at: string
  updated_at: string
  // joined data
  prompt_count?: number
  image_count?: number
  last_job_status?: string | null
}

export interface CategoryPrompt {
  id: string
  category_id: string
  prompt_number: number
  prompt_text: string
  created_at: string
  updated_at: string
}

export interface CategoryImage {
  id: string
  category_id: string
  original_filename: string
  display_name: string
  storage_path: string
  created_at: string
}

export type JobStatus = 'idle' | 'queued' | 'running' | 'partial_success' | 'completed' | 'failed' | 'cancelled'

export interface Job {
  id: string
  user_id: string
  status: JobStatus
  total_items: number
  completed_items: number
  failed_items: number
  error_message: string | null
  created_at: string
  updated_at: string
  // joined
  snapshots?: JobSnapshot[]
  items?: JobItem[]
}

export interface JobSnapshot {
  id: string
  job_id: string
  category_id: string
  category_name_zh: string
  category_slug: string
  snapshot_prompts: { number: number; text: string }[]
  snapshot_images: { id: string; original_filename: string; display_name: string; storage_path: string }[]
  created_at: string
}

export interface JobItem {
  id: string
  job_id: string
  snapshot_id: string
  image_display_name: string
  image_storage_path: string
  prompt_number: number
  prompt_text: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  error_message: string | null
  output_storage_path: string | null
  output_filename: string | null
  gemini_batch_request_key: string | null
  created_at: string
  updated_at: string
}

export interface Output {
  id: string
  job_id: string
  job_item_id: string
  user_id: string
  category_id: string
  category_slug: string
  image_display_name: string
  prompt_number: number
  output_filename: string
  storage_path: string
  file_size_bytes: number | null
  created_at: string
}

export interface SystemSettings {
  id: string
  user_id: string
  gemini_api_key_encrypted: string | null
  gemini_api_key_valid?: boolean
  openai_api_key_encrypted?: string | null
  openai_api_key_valid?: boolean
  builtin_key_email_authorized?: boolean
  builtin_key_authorization_note?: string | null
  is_admin?: boolean
  use_builtin_key: boolean
  builtin_key_password_verified: boolean
  generation_mode?: 'direct' | 'batch'
  image_provider?: 'gemini' | 'openai'
  created_at: string
  updated_at: string
}

export const CATEGORY_ICONS = [
  '🧴', '🧼', '🪥', '💄', '👁️', '👶', '🧖', '💅',
  '🧴', '🫧', '🧴', '🧽', '🪮', '🪒', '🧻', '🌸',
  '🌿', '💧', '✨', '🎀', '🪞', '🧪', '📦'
]
