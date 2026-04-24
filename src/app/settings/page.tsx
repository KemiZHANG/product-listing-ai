'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { SystemSettings, Profile } from '@/lib/types'
import Navbar from '@/components/Navbar'

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  // API Key section
  const [keyMode, setKeyMode] = useState<'builtin' | 'own'>('own')
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
        fetch('/api/settings'),
        supabase.auth.getUser(),
      ])

      if (settingsRes.ok) {
        const data = await settingsRes.json()
        setSettings(data)
        setKeyMode(data.use_builtin_key ? 'builtin' : 'own')
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
      const res = await fetch('/api/settings/verify-builtin', {
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

  // Save own API key
  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      setKeyMessage({ type: 'error', text: '请输入 API Key' })
      return
    }
    setSaving(true)
    setKeyMessage(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gemini_api_key: apiKey,
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
        await fetch('/api/settings', {
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
    if (settings.gemini_api_key_encrypted) {
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
            <h3 className="mb-4 text-base font-semibold text-gray-900">当前模式</h3>
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
                <span className="text-sm font-medium text-blue-800">Direct API Mode (Gemini)</span>
              </div>
              <p className="mt-2 text-sm text-blue-700">
                当前使用 Gemini Direct API 模式进行图片生成。
              </p>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Workflow Mode (n8n) 将在未来版本支持
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
