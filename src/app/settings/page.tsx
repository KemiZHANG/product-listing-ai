'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { Profile, SystemSettings } from '@/lib/types'
import { pickText, useUiLanguage } from '@/lib/ui-language'

type GenerationMode = 'batch' | 'direct'
type ImageProvider = 'gemini' | 'openai'

export default function SettingsPage() {
  const router = useRouter()
  const { language } = useUiLanguage()
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

  const text = {
    loading: pickText(language, { zh: '加载中...', en: 'Loading...' }),
    eyebrow: pickText(language, { zh: '系统控制', en: 'System controls' }),
    title: pickText(language, { zh: '系统设置', en: 'Settings' }),
    description: pickText(language, {
      zh: '配置生成模型、API 权限和账号状态。',
      en: 'Manage generation models, API access, and account status.',
    }),
    apiAccess: pickText(language, { zh: 'API 权限', en: 'API access' }),
    methodOne: pickText(language, { zh: '方式一：输入访问密码', en: 'Option 1: built-in access password' }),
    methodOneHint: pickText(language, {
      zh: '密码验证后，可使用内置 Gemini、内置 OpenAI、AI 生成 Prompt，以及普通即时 / Batch 两种模式。',
      en: 'After verification, built-in Gemini, built-in OpenAI, AI prompt generation, and both direct / batch modes are available.',
    }),
    accessPassword: pickText(language, { zh: '访问密码', en: 'Access password' }),
    accessPasswordPlaceholder: pickText(language, { zh: '请输入内置 API 访问密码', en: 'Enter the built-in API access password' }),
    verify: pickText(language, { zh: '验证', en: 'Verify' }),
    verifying: pickText(language, { zh: '验证中...', en: 'Verifying...' }),
    verified: pickText(language, { zh: '已验证，可使用内置所有 API。', en: 'Verified. Built-in APIs are available.' }),
    methodTwo: pickText(language, { zh: '方式二：使用自己的 API Key', en: 'Option 2: use your own API keys' }),
    methodTwoHint: pickText(language, {
      zh: '只填 Gemini：可用 Gemini 出图和 AI 生成 Prompt。只填 OpenAI：可用 GPT Image 2。两个都填：两个模型都可用。',
      en: 'Gemini only enables Gemini image generation and AI prompt generation. OpenAI only enables GPT Image 2. Add both to enable both.',
    }),
    saveApiKeys: pickText(language, { zh: '保存 API Key', en: 'Save API keys' }),
    saving: pickText(language, { zh: '保存中...', en: 'Saving...' }),
    imageModel: pickText(language, { zh: '图片模型', en: 'Image model' }),
    generationMode: pickText(language, { zh: '生成模式', en: 'Generation mode' }),
    batchMode: pickText(language, { zh: 'Batch 模式', en: 'Batch mode' }),
    directMode: pickText(language, { zh: '即时模式', en: 'Direct mode' }),
    batchHint: pickText(language, {
      zh: '成本更低，适合批量出图。',
      en: 'Lower cost and better for larger image batches.',
    }),
    directHint: pickText(language, {
      zh: '返回更快，适合少量即时任务。',
      en: 'Faster turnaround for smaller immediate jobs.',
    }),
    account: pickText(language, { zh: '账户信息', en: 'Account' }),
    email: pickText(language, { zh: '邮箱', en: 'Email' }),
    createdAt: pickText(language, { zh: '注册时间', en: 'Created at' }),
  }

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
      setKeyMessage({ type: 'error', text: pickText(language, { zh: '请输入访问密码。', en: 'Please enter the access password.' }) })
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
        setKeyMessage({ type: 'error', text: data.error || pickText(language, { zh: '验证失败', en: 'Verification failed' }) })
        return
      }

      setPassword('')
      setKeyMessage({ type: 'success', text: pickText(language, { zh: '验证成功，已启用内置 API 权限。', en: 'Verified. Built-in API access is enabled.' }) })
      await fetchData()
    } finally {
      setVerifying(false)
    }
  }

  const handleSaveApiKeys = async () => {
    const trimmedGemini = geminiApiKey.trim()
    const trimmedOpenAI = openaiApiKey.trim()
    if (!trimmedGemini && !trimmedOpenAI) {
      setKeyMessage({ type: 'error', text: pickText(language, { zh: '请至少输入一个 API Key。', en: 'Enter at least one API key.' }) })
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
        setKeyMessage({ type: 'error', text: data.error || pickText(language, { zh: '保存失败', en: 'Failed to save API keys' }) })
        return
      }

      setGeminiApiKey('')
      setOpenaiApiKey('')
      setKeyMessage({ type: 'success', text: pickText(language, { zh: 'API Key 已保存。', en: 'API keys saved.' }) })
      await fetchData()
    } finally {
      setSaving(false)
    }
  }

  const handleImageProviderChange = async (provider: ImageProvider) => {
    const staffLocked = Boolean(settings?.builtin_key_email_authorized && !settings?.is_admin)
    if (staffLocked) {
      setImageProvider('gemini')
      setKeyMessage({ type: 'error', text: pickText(language, { zh: '当前账号只开放 Gemini Batch 模式。', en: 'This account is limited to Gemini batch mode.' }) })
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
      setKeyMessage({ type: 'error', text: data.error || pickText(language, { zh: '保存模型失败', en: 'Failed to save image model' }) })
      await fetchData()
      return
    }

    setSettings(data)
    setImageProvider(data.image_provider === 'openai' ? 'openai' : 'gemini')
    setKeyMessage({ type: 'success', text: provider === 'openai' ? 'GPT Image 2 selected.' : 'Gemini selected.' })
  }

  const handleGenerationModeChange = async (mode: GenerationMode) => {
    const staffLocked = Boolean(settings?.builtin_key_email_authorized && !settings?.is_admin)
    if (staffLocked && mode === 'direct') {
      setGenerationMode('batch')
      setKeyMessage({ type: 'error', text: pickText(language, { zh: '当前账号只开放 Batch 模式。', en: 'This account is limited to batch mode.' }) })
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
      setKeyMessage({ type: 'error', text: data.error || pickText(language, { zh: '保存生成模式失败', en: 'Failed to save generation mode' }) })
      await fetchData()
      return
    }

    setSettings(data)
    setGenerationMode(data.generation_mode === 'direct' ? 'direct' : 'batch')
    setKeyMessage({ type: 'success', text: mode === 'batch' ? 'Batch mode selected.' : 'Direct mode selected.' })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-500">{text.loading}</div>
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
  const providerDisplayName = currentProvider === 'openai' ? 'OpenAI GPT Image 2' : 'Gemini 2.5 Flash Image'

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(250,204,21,0.14),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(37,99,235,0.12),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_46%,#eef2f7_100%)]">
      <Navbar />

      <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        <div className="mb-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{text.eyebrow}</p>
          <h2 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">{text.title}</h2>
          <p className="mt-3 text-base text-slate-600">{text.description}</p>
        </div>

        <div className="space-y-6">
          <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/88 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
            <h3 className="mb-3 text-base font-semibold text-gray-900">{text.apiAccess}</h3>

            {isAdmin && (
              <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                {pickText(language, {
                  zh: '管理员账号已自动获得全部内置 API 权限，可使用 Gemini、GPT Image 2、AI 生成 Prompt，以及 Direct / Batch 模式。',
                  en: 'Admin accounts automatically have full built-in API access, including Gemini, GPT Image 2, AI prompt generation, and both direct / batch modes.',
                })}
              </div>
            )}

            {staffLocked && (
              <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                {pickText(language, {
                  zh: '当前账号已获得授权，可直接使用 Gemini Batch 模式。',
                  en: 'This account is authorized to use Gemini batch mode directly.',
                })}
              </div>
            )}

            {!isAdmin && !staffLocked && (
              <div className="space-y-5">
                <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                  <h4 className="text-sm font-medium text-gray-900">{text.methodOne}</h4>
                  <p className="mt-1 text-xs leading-5 text-gray-500">{text.methodOneHint}</p>
                  <div className="mt-3 flex items-end gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-sm font-medium text-gray-700">{text.accessPassword}</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={text.accessPasswordPlaceholder}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      onClick={handleVerifyBuiltin}
                      disabled={verifying}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      {verifying ? text.verifying : text.verify}
                    </button>
                  </div>
                  {passwordVerified && (
                    <p className="mt-2 text-xs font-medium text-green-600">{text.verified}</p>
                  )}
                </div>

                <div className="rounded-md border border-gray-200 bg-white p-4">
                  <h4 className="text-sm font-medium text-gray-900">{text.methodTwo}</h4>
                  <p className="mt-1 text-xs leading-5 text-gray-500">{text.methodTwoHint}</p>
                  <div className="mt-3 grid gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Gemini API Key</label>
                      <input
                        type="password"
                        value={geminiApiKey}
                        onChange={(event) => setGeminiApiKey(event.target.value)}
                        placeholder={hasOwnGemini ? pickText(language, { zh: '已保存 Gemini Key，输入新 key 可覆盖', en: 'A Gemini key is already saved. Enter a new one to replace it.' }) : 'Enter Gemini API key'}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">OpenAI API Key</label>
                      <input
                        type="password"
                        value={openaiApiKey}
                        onChange={(event) => setOpenaiApiKey(event.target.value)}
                        placeholder={hasOwnOpenAI ? pickText(language, { zh: '已保存 OpenAI Key，输入新 key 可覆盖', en: 'An OpenAI key is already saved. Enter a new one to replace it.' }) : 'Enter OpenAI API key'}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      onClick={handleSaveApiKeys}
                      disabled={saving}
                      className="w-fit rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? text.saving : text.saveApiKeys}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {keyMessage && (
              <div className={`mt-4 rounded-md p-3 text-sm ${keyMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {keyMessage.text}
              </div>
            )}
          </div>

          {!staffLocked && (
            <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/88 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
              <h3 className="mb-4 text-base font-semibold text-gray-900">{text.imageModel}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={`cursor-pointer rounded-2xl border p-5 transition-all ${currentProvider === 'gemini' ? 'border-blue-300 bg-blue-50 shadow-sm ring-1 ring-blue-100' : 'border-gray-200 bg-white hover:-translate-y-0.5 hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    <input type="radio" name="imageProvider" checked={currentProvider === 'gemini'} onChange={() => handleImageProviderChange('gemini')} className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm font-medium text-gray-900">Gemini</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-gray-500">
                    {canUseGemini
                      ? pickText(language, { zh: '当前可用。', en: 'Available.' })
                      : pickText(language, { zh: '需要 Gemini API Key 或访问密码。', en: 'Requires a Gemini API key or the built-in access password.' })}
                  </p>
                </label>

                <label className={`cursor-pointer rounded-2xl border p-5 transition-all ${currentProvider === 'openai' ? 'border-blue-300 bg-blue-50 shadow-sm ring-1 ring-blue-100' : 'border-gray-200 bg-white hover:-translate-y-0.5 hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    <input type="radio" name="imageProvider" checked={currentProvider === 'openai'} onChange={() => handleImageProviderChange('openai')} className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm font-medium text-gray-900">OpenAI GPT Image 2</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-gray-500">
                    {canUseOpenAI
                      ? pickText(language, { zh: '当前可用。', en: 'Available.' })
                      : pickText(language, { zh: '需要 OpenAI API Key 或访问密码。', en: 'Requires an OpenAI API key or the built-in access password.' })}
                  </p>
                </label>
              </div>
            </div>
          )}

          <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/88 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
            <h3 className="mb-4 text-base font-semibold text-gray-900">{text.generationMode}</h3>
            <div className={`grid gap-3 ${staffLocked ? 'sm:grid-cols-1' : 'sm:grid-cols-2'}`}>
              <label className={`cursor-pointer rounded-2xl border p-5 transition-all ${currentMode === 'batch' ? 'border-blue-300 bg-blue-50 shadow-sm ring-1 ring-blue-100' : 'border-gray-200 bg-white hover:-translate-y-0.5 hover:bg-gray-50'}`}>
                <div className="flex items-center gap-2">
                  <input type="radio" name="generationMode" checked={currentMode === 'batch'} onChange={() => handleGenerationModeChange('batch')} disabled={staffLocked} className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm font-medium text-gray-900">{text.batchMode}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-500">{text.batchHint}</p>
              </label>

              {!staffLocked && (
                <label className={`cursor-pointer rounded-2xl border p-5 transition-all ${currentMode === 'direct' ? 'border-blue-300 bg-blue-50 shadow-sm ring-1 ring-blue-100' : 'border-gray-200 bg-white hover:-translate-y-0.5 hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    <input type="radio" name="generationMode" checked={currentMode === 'direct'} onChange={() => handleGenerationModeChange('direct')} className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm font-medium text-gray-900">{text.directMode}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-gray-500">{text.directHint}</p>
                </label>
              )}
            </div>
            <p className="mt-3 text-xs text-gray-400">{providerDisplayName}</p>
          </div>

          <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/88 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
            <h3 className="mb-4 text-base font-semibold text-gray-900">{text.account}</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs font-medium text-gray-500">{text.email}</dt>
                <dd className="mt-0.5 text-sm text-gray-900">{profile?.email ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">{text.createdAt}</dt>
                <dd className="mt-0.5 text-sm text-gray-900">
                  {profile?.created_at ? new Date(profile.created_at).toLocaleString(language === 'en' ? 'en-US' : 'zh-CN') : '-'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </main>
    </div>
  )
}
