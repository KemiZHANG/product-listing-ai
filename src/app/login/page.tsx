'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BrandMark from '@/components/BrandMark'
import LanguageToggle from '@/components/LanguageToggle'
import { getClientBrandConfig } from '@/lib/brand'
import { fetchAccessStatus, persistAuthorizedSession, readJsonSafely } from '@/lib/client-auth'
import { postClientEvent } from '@/lib/client-telemetry'
import { pickText, useUiLanguage } from '@/lib/ui-language'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'register'

export default function LoginPage() {
  const router = useRouter()
  const brand = getClientBrandConfig()
  const { edition, language } = useUiLanguage()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const formatAuthError = (message: string) => {
    const lower = message.toLowerCase()
    if (lower.includes('invalid login credentials')) {
      return pickText(language, {
        zh: '邮箱或密码不正确。',
        en: 'Email or password is incorrect.',
      })
    }
    if (lower.includes('email not confirmed')) {
      return pickText(language, {
        zh: '这个邮箱还没有完成确认。',
        en: 'This email is not confirmed yet.',
      })
    }
    if (lower.includes('already') || lower.includes('registered') || lower.includes('exists')) {
      return pickText(language, {
        zh: '这个邮箱已经注册过了，请直接登录。',
        en: 'This email is already registered. Try signing in instead.',
      })
    }
    if (lower.includes('invalid api key')) {
      return pickText(language, {
        zh: '认证服务暂时配置异常。',
        en: 'Authentication service is temporarily misconfigured.',
      })
    }
    return message
  }

  const verifyAccess = async () => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      throw new Error(pickText(language, {
        zh: '当前会话读取失败，请重新登录。',
        en: 'Unable to read the current session. Please sign in again.',
      }))
    }

    const accessRes = await fetchAccessStatus(token)

    if (!accessRes.ok) {
      await supabase.auth.signOut()
      throw new Error(accessRes.error || pickText(language, {
        zh: '这个账号当前没有访问本站的权限。',
        en: 'This account is not authorized for the current site.',
      }))
    }

    await persistAuthorizedSession(token)
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('reason') === 'unauthorized') {
      setError(pickText(language, {
        zh: '这个账号当前没有授权，请联系管理员恢复权限。',
        en: 'This account is no longer authorized. Ask the primary admin to restore access.',
      }))
      void postClientEvent('auth_access_denied_client', { edition: brand.edition })
    }
  }, [brand.edition, language])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) {
          void postClientEvent('auth_login_failed', { edition: brand.edition, reason: signInError.message })
          throw signInError
        }
      } else {
          const registerRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })

        if (!registerRes.ok) {
          const data = await readJsonSafely(registerRes)
          const message = typeof data?.error === 'string'
            ? data.error
            : pickText(language, {
                zh: '注册失败，请稍后再试。',
                en: 'Registration failed. Please try again.',
              })
          void postClientEvent('auth_register_failed', { edition: brand.edition, reason: message })
          throw new Error(message)
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) {
          void postClientEvent('auth_login_failed', { edition: brand.edition, reason: signInError.message })
          throw signInError
        }
      }

      await verifyAccess()
      router.push('/')
      router.refresh()
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? formatAuthError(submitError.message)
          : pickText(language, {
              zh: '发生了一点问题，请稍后再试。',
              en: 'Something went wrong. Please try again.',
            })
      )
    } finally {
      setLoading(false)
    }
  }

  const loginSubtitle = edition === 'resume'
    ? pickText(language, {
        zh: '公开演示站，支持商品内容、图片、SEO 与工作流展示。',
        en: 'Public demo workspace for product content, images, SEO, and workflow review.',
      })
    : '内部商品工作台'

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(254,243,199,0.7),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(191,219,254,0.6),transparent_32%),linear-gradient(135deg,#ffffff_0%,#f8fafc_52%,#eff6ff_100%)] px-4">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.16)_1px,transparent_1px)] bg-[size:32px_32px]" />
      <div className="pointer-events-none absolute left-16 top-16 h-44 w-36 rotate-[-12deg] rounded-3xl border border-white/80 bg-white/40 shadow-2xl shadow-slate-200/70 backdrop-blur" />
      <div className="pointer-events-none absolute bottom-20 left-[-40px] h-64 w-72 rotate-[14deg] rounded-3xl border border-white/80 bg-white/35 shadow-2xl shadow-slate-200/70 backdrop-blur" />
      <div className="pointer-events-none absolute right-20 top-32 h-56 w-64 rotate-[-10deg] rounded-3xl border border-white/80 bg-white/40 shadow-2xl shadow-slate-200/70 backdrop-blur" />

      <div className="relative w-full max-w-xl">
        <div className="rounded-[2rem] border border-white/80 bg-white/88 p-10 shadow-2xl shadow-slate-300/50 backdrop-blur-xl">
          <div className="mb-4 flex justify-end">
            <LanguageToggle />
          </div>
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex w-fit items-center justify-center">
              <BrandMark size="lg" />
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">{brand.loginTitle}</h1>
            <p className="mt-3 text-lg text-slate-500">{loginSubtitle}</p>
          </div>

          <div className="mb-7 mt-7 flex rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('login')
                setError(null)
              }}
              className={`flex-1 rounded-xl py-3 text-base font-semibold transition-colors ${
                mode === 'login'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {pickText(language, { zh: '登录', en: 'Sign in' })}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register')
                setError(null)
              }}
              className={`flex-1 rounded-xl py-3 text-base font-semibold transition-colors ${
                mode === 'register'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {pickText(language, { zh: '注册', en: 'Register' })}
            </button>
          </div>

          {error && (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">
                {pickText(language, { zh: '邮箱', en: 'Email' })}
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={pickText(language, { zh: 'you@example.com', en: 'you@example.com' })}
                className="w-full rounded-2xl border border-slate-300 px-4 py-4 text-base text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">
                {pickText(language, { zh: '密码', en: 'Password' })}
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={pickText(language, { zh: '至少 6 位', en: 'At least 6 characters' })}
                className="w-full rounded-2xl border border-slate-300 px-4 py-4 text-base text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-blue-600 px-5 py-4 text-base font-semibold text-white shadow-xl shadow-blue-500/25 transition-colors hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? (mode === 'login'
                    ? pickText(language, { zh: '登录中...', en: 'Signing in...' })
                    : pickText(language, { zh: '注册中...', en: 'Registering...' }))
                : (mode === 'login'
                    ? pickText(language, { zh: '登录', en: 'Sign in' })
                    : pickText(language, { zh: '注册', en: 'Register' }))}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
