'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'
import type { SystemSettings, Profile } from '@/lib/types'
import Navbar from '@/components/Navbar'

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  // API Key section
  const [keyMode, setKeyMode] = useState<'builtin' | 'own'>('own')
  const [generationMode, setGenerationMode] = useState<'batch' | 'direct'>('batch')
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [keyMessage, setKeyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/login')
      } else {
        setLoading(false)
      }
    })
  }, [router])

  // Fetch settings and profile
  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, userRes] = await Promise.all([
        apiFetch('/api/settings'),
        supabase.auth.getUser(),
      ])

      if (settingsRes.ok) {
        const data = await settingsRes.json()
        setSettings(data)
        setKeyMode(data.use_builtin_key ? 'builtin' : 'own')
        setGenerationMode(data.generation_mode === 'direct' ? 'direct' : 'batch')
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
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    if (!loading) {
      fetchData()
    }
  }, [loading, fetchData])

  // Verify built-in key password
  const handleVerifyBuiltin = async () => {
    if (!password.trim()) {
      setKeyMessage({ type: 'error', text: '请输入密码' })
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
      if (res.ok) {
        setKeyMessage({ type: 'success', text: '验证成功，已切换为内置 Key 模式' })
        setPassword('')
        await fetchData()
      } else {
        setKeyMessage({ type: 'error', text: data.error || '验证失败' })
      }
    } catch {
      setKeyMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setVerifying(false)
    }
  }

  const handleGenerationModeChange = async (mode: 'batch' | 'direct') => {
    setGenerationMode(mode)
    setKeyMessage(null)
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generation_mode: mode }),
      })
      const data = await res.json()
      if (res.ok) {
        setSettings(data)
        setKeyMessage({
          type: 'success',
          text: mode === 'batch'
            ? '已切换为 Batch 半价模式'
            : '已切换为普通即时模式',
        })
      } else {
        setKeyMessage({ type: 'error', text: data.error || '保存生成模式失败' })
      }
    } catch {
      setKeyMessage({ type: 'error', text: '网络错误，请重试' })
    }
  }

  // Save own API key
  const handleSaveApiKey = async () => {
    const trimmedKey = apiKey.trim()
    if (!trimmedKey) {
      setKeyMessage({ type: 'error', text: '请输入 API Key' })
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
      if (res.ok) {
        setKeyMessage({ type: 'success', text: 'API Key 已保存' })
        setApiKey('')
        await fetchData()
      } else {
        setKeyMessage({ type: 'error', text: data.error || '保存失败' })
      }
    } catch {
      setKeyMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setSaving(false)
    }
  }

  // Switch key mode
  const handleModeChange = async (mode: 'builtin' | 'own') => {
    setKeyMode(mode)
    setKeyMessage(null)
    setPassword('')
    setApiKey('')

    if (mode === 'own' && settings?.use_builtin_key) {
      // Switch away from builtin
      try {
        await apiFetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ use_builtin_key: false }),
        })
        await fetchData()
      } catch {
        // silent
      }
    }
  }

  const getKeyStatus = () => {
    if (!settings) return { text: '未设置', color: 'text-gray-500' }
    if (settings.use_builtin_key && settings.builtin_key_password_verified) {
      return { text: '已验证 (内置 Key)', color: 'text-green-600' }
    }
    if (settings.use_builtin_key && !settings.builtin_key_password_verified) {
      return { text: '内置 Key (待验证)', color: 'text-yellow-600' }
    }
    if (settings.gemini_api_key_encrypted && settings.gemini_api_key_valid === false) {
      return { text: 'Key 格式无效，请重新保存', color: 'text-red-600' }
    }
    if (settings.gemini_api_key_encrypted && settings.gemini_api_key_valid !== false) {
      return { text: '已设置 (自有 Key)', color: 'text-green-600' }
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-xl font-semibold text-gray-900">系统设置</h2>

        <div className="space-y-6">
          {/* Section 1: Gemini API Key */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-1 text-base font-semibold text-gray-900">Gemini API Key</h3>
            <p className="mb-4 text-sm text-gray-500">
              当前状态: <span className={`font-medium ${keyStatus.color}`}>{keyStatus.text}</span>
            </p>

            {/* Mode radio */}
            <div className="mb-4 flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="keyMode"
                  checked={keyMode === 'builtin'}
                  onChange={() => handleModeChange('builtin')}
                  className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">使用内置 Key (需密码)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
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

            {/* Message */}
            {keyMessage && (
              <div
                className={`mb-4 rounded-md p-3 text-sm ${
                  keyMessage.type === 'success'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                {keyMessage.text}
              </div>
            )}

            {/* Builtin mode: password input */}
            {keyMode === 'builtin' && (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">访问密码</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入内置 Key 访问密码"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleVerifyBuiltin}
                  disabled={verifying}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {verifying ? '验证中...' : '验证'}
                </button>
              </div>
            )}

            {/* Own mode: API key input */}
            {keyMode === 'own' && (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="输入你的 Gemini API Key"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleSaveApiKey}
                  disabled={saving}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            )}
          </div>

          {/* Section 2: Current Mode */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-gray-900">生成模式</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`cursor-pointer rounded-md border p-4 transition-colors ${
                generationMode === 'batch'
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
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
                  使用 Gemini Batch API，价格约为普通模式 50%，适合批量出图；完成时间通常更久，官方目标最长可到 24 小时。
                </p>
              </label>

              <label className={`cursor-pointer rounded-md border p-4 transition-colors ${
                generationMode === 'direct'
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="generationMode"
                    checked={generationMode === 'direct'}
                    onChange={() => handleGenerationModeChange('direct')}
                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-900">普通即时模式</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-500">
                  使用 Gemini 2.5 Flash Image 普通 API，适合少量图片或需要尽快看到结果的任务。
                </p>
              </label>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              当前模型：Nano Banana / Gemini 2.5 Flash Image
            </p>
          </div>

          {/* Section 3: Account Info */}
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
                  {profile?.created_at
                    ? new Date(profile.created_at).toLocaleString('zh-CN')
                    : '-'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </main>
    </div>
  )
}
