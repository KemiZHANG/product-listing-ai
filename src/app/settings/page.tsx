'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { Profile, SystemSettings } from '@/lib/types'

type GenerationMode = 'batch' | 'direct'
type ImageProvider = 'gemini' | 'openai'

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [generationMode, setGenerationMode] = useState<GenerationMode>('batch')
  const [imageProvider, setImageProvider] = useState<ImageProvider>('gemini')
  const [password, setPassword] = useState('')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [keyMessage, setKeyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchData = useCallback(async () => {
    const [settingsRes, userRes] = await Promise.all([
      apiFetch('/api/settings'),
      supabase.auth.getUser(),
    ])

    if (settingsRes.ok) {
      const data = await settingsRes.json()
      setSettings(data)
      setGenerationMode(data.generation_mode === 'direct' ? 'direct' : 'batch')
      setImageProvider(data.image_provider === 'openai' ? 'openai' : 'gemini')
    }

    if (userRes.data.user) {
      setProfile({
        id: userRes.data.user.id,
        email: userRes.data.user.email ?? null,
        display_name: userRes.data.user.user_metadata?.display_name ?? null,
        created_at: userRes.data.user.created_at,
        updated_at: userRes.data.user.updated_at ?? userRes.data.user.created_at,
      })
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace('/login')
        return
      }
      await fetchData()
      setLoading(false)
    })
  }, [fetchData, router])

  const handleVerifyBuiltin = async () => {
    if (!password.trim()) {
      setKeyMessage({ type: 'error', text: '请输入访问密码。' })
      return
    }

    setVerifying(true)
    setKeyMessage(null)
    try {
      const res = await apiFetch('/api/settings/verify-builtin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setKeyMessage({ type: 'error', text: data.error || '验证失败' })
        return
      }

      setPassword('')
      setKeyMessage({ type: 'success', text: '验证成功，已启用内置 Gemini 和 OpenAI API 权限。' })
      await fetchData()
    } finally {
      setVerifying(false)
    }
  }

  const handleSaveApiKeys = async () => {
    const trimmedGemini = geminiApiKey.trim()
    const trimmedOpenAI = openaiApiKey.trim()
    if (!trimmedGemini && !trimmedOpenAI) {
      setKeyMessage({ type: 'error', text: '请至少输入一个 API Key。' })
      return
    }

    setSaving(true)
    setKeyMessage(null)
    try {
      const body: Record<string, string | boolean> = { use_builtin_key: false }
      if (trimmedGemini) body.gemini_api_key = trimmedGemini
      if (trimmedOpenAI) body.openai_api_key = trimmedOpenAI

      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setKeyMessage({ type: 'error', text: data.error || '保存失败' })
        return
      }

      setGeminiApiKey('')
      setOpenaiApiKey('')
      setKeyMessage({ type: 'success', text: 'API Key 已保存。保存 Gemini 后可使用 Nano Banana 和 AI 生成 Prompt；保存 OpenAI 后可使用 GPT Image 2。' })
      await fetchData()
    } finally {
      setSaving(false)
    }
  }

  const handleImageProviderChange = async (provider: ImageProvider) => {
    const staffLocked = Boolean(settings?.builtin_key_email_authorized && !settings?.is_admin)
    if (staffLocked) {
      setImageProvider('gemini')
      setKeyMessage({ type: 'error', text: '公司授权邮箱仅开放 Nano Banana Batch 模式。' })
      return
    }

    setImageProvider(provider)
    setKeyMessage(null)
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_provider: provider }),
    })
    const data = await res.json()

    if (!res.ok) {
      setKeyMessage({ type: 'error', text: data.error || '保存模型选择失败' })
      await fetchData()
      return
    }

    setSettings(data)
    setImageProvider(data.image_provider === 'openai' ? 'openai' : 'gemini')
    setKeyMessage({ type: 'success', text: provider === 'openai' ? '已切换为 GPT Image 2。' : '已切换为 Nano Banana。' })
  }

  const handleGenerationModeChange = async (mode: GenerationMode) => {
    const staffLocked = Boolean(settings?.builtin_key_email_authorized && !settings?.is_admin)
    if (staffLocked && mode === 'direct') {
      setGenerationMode('batch')
      setKeyMessage({ type: 'error', text: '公司授权邮箱仅开放 Batch 半价模式。' })
      return
    }

    setGenerationMode(mode)
    setKeyMessage(null)
    const res = await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generation_mode: mode }),
    })
    const data = await res.json()

    if (!res.ok) {
      setKeyMessage({ type: 'error', text: data.error || '保存生成模式失败' })
      await fetchData()
      return
    }

    setSettings(data)
    setGenerationMode(data.generation_mode === 'direct' ? 'direct' : 'batch')
    setKeyMessage({ type: 'success', text: mode === 'batch' ? '已切换为 Batch 半价模式。' : '已切换为普通即时模式。' })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  const isEmailAuthorized = Boolean(settings?.builtin_key_email_authorized)
  const isAdmin = Boolean(settings?.is_admin)
  const staffLocked = isEmailAuthorized && !isAdmin
  const passwordVerified = Boolean(settings?.use_builtin_key && settings?.builtin_key_password_verified)
  const hasOwnGemini = Boolean(settings?.gemini_api_key_encrypted && settings.gemini_api_key_valid !== false)
  const hasOwnOpenAI = Boolean(settings?.openai_api_key_encrypted && settings.openai_api_key_valid !== false)
  const canUseBuiltInAll = isAdmin || passwordVerified
  const canUseGemini = canUseBuiltInAll || staffLocked || hasOwnGemini
  const canUseOpenAI = canUseBuiltInAll || hasOwnOpenAI
  const currentProvider = staffLocked ? 'gemini' : imageProvider
  const currentMode = staffLocked ? 'batch' : generationMode
  const providerDisplayName = currentProvider === 'openai' ? 'OpenAI GPT Image 2' : 'Nano Banana / Gemini 2.5 Flash Image'

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-xl font-semibold text-gray-900">系统设置</h2>

        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-3 text-base font-semibold text-gray-900">API 权限</h3>

            {isAdmin && (
              <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                管理员账号已自动获得全部内置 API 权限，可使用 Nano Banana、GPT Image 2、AI 生成 Prompt、普通即时模式和 Batch 模式。
              </div>
            )}

            {staffLocked && (
              <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                你的邮箱已获得公司授权，可直接使用 Nano Banana Batch。为控制成本，公司授权员工账号不显示 GPT Image 2 和普通即时模式。
                {settings?.builtin_key_authorization_note ? ` 备注：${settings.builtin_key_authorization_note}` : ''}
              </div>
            )}

            {!isAdmin && !staffLocked && (
              <div className="space-y-5">
                <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                  <h4 className="text-sm font-medium text-gray-900">方式一：输入访问密码</h4>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    密码验证后，可使用内置 Gemini、内置 OpenAI、AI 生成 Prompt，以及普通即时 / Batch 两种模式。
                  </p>
                  <div className="mt-3 flex items-end gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-sm font-medium text-gray-700">访问密码</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="请输入内置 API 访问密码"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      onClick={handleVerifyBuiltin}
                      disabled={verifying}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      {verifying ? '验证中...' : '验证'}
                    </button>
                  </div>
                  {passwordVerified && (
                    <p className="mt-2 text-xs font-medium text-green-600">已验证，可使用内置所有 API。</p>
                  )}
                </div>

                <div className="rounded-md border border-gray-200 bg-white p-4">
                  <h4 className="text-sm font-medium text-gray-900">方式二：使用自己的 API Key</h4>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    只填 Gemini：可用 Nano Banana 和 AI 生成 Prompt。只填 OpenAI：可用 GPT Image 2。两个都填：两个模型都可用。
                  </p>
                  <div className="mt-3 grid gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Gemini API Key</label>
                      <input
                        type="password"
                        value={geminiApiKey}
                        onChange={(event) => setGeminiApiKey(event.target.value)}
                        placeholder={hasOwnGemini ? '已保存 Gemini Key，输入新 key 可覆盖' : '输入 Gemini API Key，通常以 AIza 开头'}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">OpenAI API Key</label>
                      <input
                        type="password"
                        value={openaiApiKey}
                        onChange={(event) => setOpenaiApiKey(event.target.value)}
                        placeholder={hasOwnOpenAI ? '已保存 OpenAI Key，输入新 key 可覆盖' : '输入 OpenAI API Key，通常以 sk- 开头'}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      onClick={handleSaveApiKeys}
                      disabled={saving}
                      className="w-fit rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? '保存中...' : '保存 API Key'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {keyMessage && (
              <div className={`mt-4 rounded-md p-3 text-sm ${
                keyMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {keyMessage.text}
              </div>
            )}
          </div>

          {!staffLocked && (
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-base font-semibold text-gray-900">图片模型</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={`cursor-pointer rounded-md border p-4 transition-colors ${
                  currentProvider === 'gemini' ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="imageProvider"
                      checked={currentProvider === 'gemini'}
                      onChange={() => handleImageProviderChange('gemini')}
                      className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-900">Gemini / Nano Banana</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-gray-500">
                    {canUseGemini ? '当前可用。' : '需要保存 Gemini API Key，或输入访问密码。'} 支持产品图生成和 AI Prompt 生成器。
                  </p>
                </label>

                <label className={`cursor-pointer rounded-md border p-4 transition-colors ${
                  currentProvider === 'openai' ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="imageProvider"
                      checked={currentProvider === 'openai'}
                      onChange={() => handleImageProviderChange('openai')}
                      className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-900">OpenAI GPT Image 2</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-gray-500">
                    {canUseOpenAI ? '当前可用。' : '需要保存 OpenAI API Key，或输入访问密码。'} 支持普通模式和 Batch 模式。
                  </p>
                </label>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-gray-900">生成模式</h3>

            {staffLocked && (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                公司授权员工账号固定使用 Nano Banana Batch 半价模式。
              </div>
            )}

            <div className={`grid gap-3 ${staffLocked ? 'sm:grid-cols-1' : 'sm:grid-cols-2'}`}>
              <label className={`cursor-pointer rounded-md border p-4 transition-colors ${
                currentMode === 'batch' ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="generationMode"
                    checked={currentMode === 'batch'}
                    onChange={() => handleGenerationModeChange('batch')}
                    disabled={staffLocked}
                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-900">Batch 半价模式</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-500">
                  使用 {currentProvider === 'openai' ? 'OpenAI Batch API' : 'Gemini Batch API'}，价格约为普通模式 50%，适合批量出图；完成时间通常更久。
                </p>
              </label>

              {!staffLocked && (
                <label className={`cursor-pointer rounded-md border p-4 transition-colors ${
                  currentMode === 'direct' ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="generationMode"
                      checked={currentMode === 'direct'}
                      onChange={() => handleGenerationModeChange('direct')}
                      className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-900">普通即时模式</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-gray-500">
                    使用 {currentProvider === 'openai' ? 'GPT Image 2 普通 API' : 'Gemini 2.5 Flash Image 普通 API'}，适合少量图片或需要更快看到结果的任务。
                  </p>
                </label>
              )}
            </div>
            <p className="mt-3 text-xs text-gray-400">当前模型：{providerDisplayName}</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-gray-900">账户信息</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs font-medium text-gray-500">邮箱</dt>
                <dd className="mt-0.5 text-sm text-gray-900">{profile?.email ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">注册时间</dt>
                <dd className="mt-0.5 text-sm text-gray-900">
                  {profile?.created_at ? new Date(profile.created_at).toLocaleString('zh-CN') : '-'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </main>
    </div>
  )
}
