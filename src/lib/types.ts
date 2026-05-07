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
  prompt_count?: number
  image_count?: number
  last_job_status?: string | null
}

export interface CategoryPrompt {
  id: string
  category_id: string
  prompt_number: number
  prompt_role?: string
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

export interface ProductAttributeColumn {
  id: string
  user_id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ProductImage {
  id: string
  product_id: string
  original_filename: string
  display_name: string
  storage_path: string
  sort_order: number
  created_at: string
}

export type ProductStatus = 'draft' | 'ready' | 'queued' | 'generating' | 'completed' | 'failed' | 'needs_review'

export interface Product {
  id: string
  user_id: string
  category_id: string | null
  sku: string
  source_title: string
  source_description: string
  selling_points: string
  copy_count: number
  languages: string[]
  attributes: Record<string, string>
  status: ProductStatus
  error_message: string | null
  created_at: string
  updated_at: string
  categories?: Pick<Category, 'id' | 'name_zh' | 'slug' | 'icon'> | null
  images?: ProductImage[]
  copy_count_generated?: number
}

export const COPY_PLAN_ATTRIBUTE_KEY = '__language_copy_counts'
export const COPY_IMAGE_PLAN_ATTRIBUTE_KEY = '__language_copy_plan_v2'

export type ProductImageRole = 'main' | 'scene' | 'detail'

export const PRODUCT_IMAGE_ROLE_OPTIONS: Array<{ value: ProductImageRole; label: string; description: string }> = [
  { value: 'main', label: '主图', description: '干净的商品展示图' },
  { value: 'scene', label: '场景图', description: '生活或使用场景图' },
  { value: 'detail', label: '详情图', description: '卖点或规格说明图' },
]

export const DEFAULT_PRODUCT_IMAGE_ROLES: ProductImageRole[] = PRODUCT_IMAGE_ROLE_OPTIONS.map((role) => role.value)

export function normalizeProductImageRole(role: string | null | undefined): ProductImageRole | null {
  const key = String(role || '').trim().toLowerCase()
  if (key === 'main' || key === 'main_1' || key === 'main_2') return 'main'
  if (key === 'scene' || key === 'model_scene_1' || key === 'model_scene_2') return 'scene'
  if (key === 'detail' || key === 'detail_1' || key === 'detail_2') return 'detail'
  return null
}

export function getProductImageRoleLabel(role: string | null | undefined) {
  const normalized = normalizeProductImageRole(role)
  return PRODUCT_IMAGE_ROLE_OPTIONS.find((item) => item.value === normalized)?.label || '自定义图'
}

export interface RuleTemplate {
  id: string
  user_id: string
  name: string
  scope: 'general' | 'title_description' | 'image' | 'platform'
  content: string
  active: boolean
  created_at: string
  updated_at: string
}

export interface ProductCopyImage {
  id: string
  copy_id: string
  prompt_number: number
  prompt_role: string
  prompt_text: string
  output_storage_path: string | null
  output_filename: string | null
  pending_storage_path?: string | null
  pending_filename?: string | null
  pending_regeneration_note?: string | null
  previous_storage_path?: string | null
  previous_filename?: string | null
  status: 'queued' | 'generating' | 'completed' | 'failed' | 'needs_review'
  error_message: string | null
  created_at: string
  updated_at: string
}

export type ListingStatus = 'not_listed' | 'listed' | 'needs_edit' | 'paused' | 'done'
export type QualityStatus = 'pass' | 'warning' | 'fail'

export interface ProductCopy {
  id: string
  product_id: string
  user_id: string
  sku: string
  copy_index: number
  language_code: string
  language_label: string
  generated_title: string
  generated_description: string
  staff_note?: string | null
  listing_status?: ListingStatus
  store_name?: string | null
  listed_at?: string | null
  operator_note?: string | null
  operator_email?: string | null
  seo_score?: number | null
  quality_status?: QualityStatus | null
  quality_report?: Record<string, unknown> | null
  status: 'queued' | 'generating' | 'completed' | 'failed' | 'needs_review'
  error_message: string | null
  created_at: string
  updated_at: string
  products?: Product | null
  product_copy_images?: ProductCopyImage[]
}

export const PRODUCT_LANGUAGES = [
  { code: 'en', label: '英语' },
  { code: 'ms', label: '马来语' },
  { code: 'fil', label: '菲律宾语' },
  { code: 'id', label: '印尼语' },
  { code: 'th', label: '泰语' },
  { code: 'vi', label: '越南语' },
]

export const DEFAULT_PROMPT_ROLES = PRODUCT_IMAGE_ROLE_OPTIONS.map(({ value, label }) => ({ value, label }))

export const LEGACY_PROMPT_ROLES = [
  { value: 'main_1', label: '主图 1' },
  { value: 'main_2', label: '主图 2' },
  { value: 'model_scene_1', label: '场景图 1' },
  { value: 'model_scene_2', label: '场景图 2' },
  { value: 'detail_1', label: '详情图 1' },
  { value: 'detail_2', label: '详情图 2' },
]

export const CATEGORY_ICONS = [
  '🧴', '🪥', '🧼', '💄', '🧽', '🛁', '🧴', '📦',
  '🥤', '🍽️', '🧃', '✈️', '🍵', '🔟', '🧷', '📱',
  '☀️', '🎵', '✨', '🌔', '🪒', '🥚', '📘',
]
