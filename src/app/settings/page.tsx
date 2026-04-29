'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { Profile, SystemSettings } from '@/lib/types'

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [keyMode, setKeyMode] = useState<'builtin' | 'own'>('own')
  const [generationMode, setGenerationMode] = useState<'batch' | 'direct'>('batch')
  const [imageProvider, setImageProvider] = useState<'gemini' | 'openai'>('gemini')
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')
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
      setKeyMode(data.use_builtin_key || data.builtin_key_email_authorized ? 'builtin' : 'own')
      setGenerationMode(data.is_admin && data.generation_mode === 'direct' ? 'direct' : 'batch')
      setImageProvider(data.is_admin && data.image_provider === 'openai' ? 'openai' : 'gemini')
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
      setKeyMessage({ type: 'success', text: '验证成功，已切换为内置 Key 模式。' })
      await fetchData()
    } finally {
      setVerifying(false)
    }
  }

  const handleGenerationModeChange = async (mode: 'batch' | 'direct') => {
    if (mode === 'direct' && !settings?.is_admin) {
      setGenerationMode('batch')
      setKeyMessage({ type: 'error', text: '普通即时模式仅管理员可使用。普通用户请使用 Batch 半价模式。' })
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
      return
    }

    setSettings(data)
    setKeyMessage({
      type: 'success',
      text: mode === 'batch' ? '已切换为 Batch 半价模式。' : '已切换为普通即时模式。',
    })
  }

  const handleImageProviderChange = async (provider: 'gemini' | 'openai') => {
    if (provider === 'openai' && !settings?.is_admin) {
      setImageProvider('gemini')
      setKeyMessage({ type: 'error', text: 'GPT Image 2 仅管理员可使用。' })
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
      setImageProvider('gemini')
      setKeyMessage({ type: 'error', text: data.error || '保存模型选择失败' })
      return
    }

    setSettings(data)
    setImageProvider(data.image_provider === 'openai' ? 'openai' : 'gemini')
    setKeyMessage({
      type: 'success',
      text: provider === 'openai' ? '已切换为 GPT Image 2。' : '已切换为 Gemini / Nano Banana。',
    })
  }

  const handleSaveApiKey = async () => {
    const trimmedKey = apiKey.trim()
    if (!trimmedKey) {
      setKeyMessage({ type: 'error', text: '请输入 API Key。' })
      return
    }
    if (!trimmedKey.startsWith('AIza') || trimmedKey.length < 30) {
      setKeyMessage({ type: 'error', text: '这不像有效的 Gemini API Key。Google AI Studio 的 key 通常以 AIza 开头。' })
      return
    }

    setSaving(true)
    setKeyMessage(null)
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gemini_api_key: trimmedKey,
          use_builtin_key: false,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setKeyMessage({ type: 'error', text: data.error || '保存失败' })
        return
      }

      setApiKey('')
      setKeyMessage({ type: 'success', text: 'API Key 已保存。' })
      await fetchData()
    } finally {
      setSaving(false)
    }
  }

  const handleModeChange = async (mode: 'builtin' | 'own') => {
    setKeyMode(mode)
    setKeyMessage(null)
    setPassword('')
    setApiKey('')

    if (mode === 'own' && settings?.use_builtin_key) {
      await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_builtin_key: false }),
      })
      await fetchData()
      return
    }

    if (mode === 'builtin' && settings?.builtin_key_email_authorized) {
      await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_builtin_key: true }),
      })
      setKeyMessage({ type: 'success', text: '你的邮箱已授权，已切换为内置 Key 模式。' })
      await fetchData()
    }
  }

  const getKeyStatus = () => {
    if (!settings) return { text: '未设置', color: 'text-gray-500' }
    if (settings.builtin_key_email_authorized && settings.use_builtin_key) {
      return { text: '已授权（公司内置 Key）', color: 'text-green-600' }
    }
    if (settings.builtin_key_email_authorized) {
      return { text: '邮箱已授权，可使用内置 Key', color: 'text-green-600' }
    }
    if (settings.use_builtin_key && settings.builtin_key_password_verified) {
      return { text: '已验证（内置 Key）', color: 'text-green-600' }
    }
    if (settings.use_builtin_key && !settings.builtin_key_password_verified) {
      return { text: '内置 Key（待验证）', color: 'text-yellow-600' }
    }
    if (settings.gemini_api_key_encrypted && settings.gemini_api_key_valid === false) {
      return { text: 'Key 格式无效，请重新保存', color: 'text-red-600' }
    }
    if (settings.gemini_api_key_encrypted && settings.gemini_api_key_valid !== false) {
      return { text: '已设置（自有 Key）', color: 'text-green-600' }
    }
    return { text: '未设置', color: 'text-red-600' }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  const keyStatus = getKeyStatus()
  const isEmailAuthorized = Boolean(settings?.builtin_key_email_authorized)
  const isAdmin = Boolean(settings?.is_admin)
  const authorizedNonAdmin = isEmailAuthorized && !isAdmin
  const showDirectMode = isAdmin || !isEmailAuthorized
  const currentProvider = isAdmin && imageProvider === 'openai' ? 'openai' : 'gemini'
  const providerDisplayName = currentProvider === 'openai' ? 'OpenAI GPT Image 2' : 'Nano Banana / Gemini 2.5 Flash Image'

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-xl font-semibold text-gray-900">系统设置</h2>

        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-1 text-base font-semibold text-gray-900">Gemini API Key</h3>
            <p className="mb-4 text-sm text-gray-500">
              当前状态：<span className={`font-medium ${keyStatus.color}`}>{keyStatus.text}</span>
            </p>

            {isEmailAuthorized && (
              <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
                已获得公司授权，可直接使用内置 API。
                {settings?.builtin_key_authorization_note ? ` 备注：${settings.builtin_key_authorization_note}` : ''}
              </div>
            )}

            <div className="mb-4 flex flex-wrap gap-6">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="keyMode"
                  checked={keyMode === 'builtin'}
                  onChange={() => handleModeChange('builtin')}
                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  {isEmailAuthorized ? '使用内置 Key（邮箱已授权）' : '使用内置 Key（需密码）'}
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="keyMode"
                  checked={keyMode === 'own'}
                  onChange={() => handleModeChange('own')}
                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">使用自己的 Key</span>
              </label>
            </div>

            {keyMessage && (
              <div className={`mb-4 rounded-md p-3 text-sm ${
                keyMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {keyMessage.text}
              </div>
            )}

            {keyMode === 'builtin' && isEmailAuthorized && (
              <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                你的登录邮箱在授权名单中，不需要输入访问密码。后端运行任务时也会再次校验这个授权。
              </div>
            )}

            {keyMode === 'builtin' && !isEmailAuthorized && (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">访问密码</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="请输入内置 Key 访问密码"
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
            )}

            {keyMode === 'own' && (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="输入你的 Gemini API Key"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleSaveApiKey}
                  disabled={saving}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            )}
          </div>

          {isAdmin && (
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
                    使用当前的 Gemini 2.5 Flash Image 生成链路，保留现有授权和密码逻辑。
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
                    仅管理员可用，使用 Vercel 中的 OPENAI_API_KEY 和 OPENAI_IMAGE_MODEL。
                  </p>
                </label>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-gray-900">生成模式</h3>
            {authorizedNonAdmin && (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                你的邮箱已获得公司授权，可使用内置 API。为控制成本，授权邮箱默认只开放 Batch 半价模式。
              </div>
            )}
            {!isEmailAuthorized && !isAdmin && (
              <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                未授权邮箱需要先保存自己的 API Key，或输入内置 Key 访问密码后才能运行任务。普通即时模式仅管理员可用。
              </div>
            )}
            <div className={`grid gap-3 ${showDirectMode ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
              <label className={`cursor-pointer rounded-md border p-4 transition-colors ${
                generationMode === 'batch' ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="generationMode"
                    checked={generationMode === 'batch'}
                    onChange={() => handleGenerationModeChange('batch')}
                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-900">Batch 半价模式</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-500">
                  使用 {currentProvider === 'openai' ? 'OpenAI Batch API' : 'Gemini Batch API'}，价格约为普通模式 50%，适合批量出图；完成时间通常更久。
                </p>
              </label>

              {showDirectMode && (
              <label className={`rounded-md border p-4 transition-colors ${
                isAdmin
                  ? 'cursor-pointer'
                  : 'cursor-not-allowed opacity-60'
              } ${
                generationMode === 'direct' ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="generationMode"
                    checked={generationMode === 'direct'}
                    disabled={!isAdmin}
                    onChange={() => handleGenerationModeChange('direct')}
                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-900">普通即时模式</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-500">
                  使用 {currentProvider === 'openai' ? 'GPT Image 2 普通 API' : 'Gemini 2.5 Flash Image 普通 API'}，适合少量图片或需要更快看到结果的任务。
                </p>
                {!isAdmin && (
                  <p className="mt-2 text-xs font-medium text-amber-700">
                    仅管理员可启用。
                  </p>
                )}
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
