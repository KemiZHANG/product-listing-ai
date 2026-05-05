'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'register'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const formatAuthError = (message: string) => {
    const lower = message.toLowerCase()
    if (lower.includes('invalid login credentials')) {
      return '邮箱或密码不正确。如果刚注册过，请确认你输入的是注册时的密码。'
    }
    if (lower.includes('email not confirmed')) {
      return '邮箱还没有确认。请切换到注册重新创建账号，系统会自动完成确认。'
    }
    if (lower.includes('already') || lower.includes('registered') || lower.includes('exists')) {
      return '这个邮箱已经注册过，请切换到登录。'
    }
    if (lower.includes('invalid api key')) {
      return '登录服务配置异常，请刷新页面后重试。'
    }
    return message
  }

  const verifyAccess = async () => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      throw new Error('登录状态获取失败，请重新登录。')
    }

    const accessRes = await fetch('/api/auth/access', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    if (!accessRes.ok) {
      const payload = await accessRes.json().catch(() => null)
      await supabase.auth.signOut()
      throw new Error(payload?.error || '该邮箱未被管理员授权，请联系管理员开通后再使用。')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (err) throw err
      } else {
        const registerRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        if (!registerRes.ok) {
          const data = await registerRes.json()
          throw new Error(data.error || '注册失败')
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
      }
      await verifyAccess()
      router.push('/')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? formatAuthError(err.message) : '发生未知错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(254,243,199,0.7),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(191,219,254,0.6),transparent_32%),linear-gradient(135deg,#ffffff_0%,#f8fafc_52%,#eff6ff_100%)] px-4">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.16)_1px,transparent_1px)] bg-[size:32px_32px]" />
      <div className="pointer-events-none absolute left-16 top-16 h-44 w-36 rotate-[-12deg] rounded-3xl border border-white/80 bg-white/40 shadow-2xl shadow-slate-200/70 backdrop-blur" />
      <div className="pointer-events-none absolute bottom-20 left-[-40px] h-64 w-72 rotate-[14deg] rounded-3xl border border-white/80 bg-white/35 shadow-2xl shadow-slate-200/70 backdrop-blur" />
      <div className="pointer-events-none absolute right-20 top-32 h-56 w-64 rotate-[-10deg] rounded-3xl border border-white/80 bg-white/40 shadow-2xl shadow-slate-200/70 backdrop-blur" />

      <div className="relative w-full max-w-xl">
        <div className="rounded-[2rem] border border-white/80 bg-white/88 p-10 shadow-2xl shadow-slate-300/50 backdrop-blur-xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-100 to-yellow-50 text-5xl shadow-sm ring-1 ring-amber-200/70">🍌</div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Nano Listing AI</h1>
            <p className="mt-3 text-lg text-slate-500">电商 AIGC 商品素材生成平台</p>
          </div>

          <div className="mb-7 flex rounded-2xl bg-slate-100 p-1">
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
              登录
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
              注册
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-slate-300 px-4 py-4 text-base text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full rounded-2xl border border-slate-300 px-4 py-4 text-base text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-blue-600 px-5 py-4 text-base font-semibold text-white shadow-xl shadow-blue-500/25 transition-colors hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? mode === 'login'
                  ? '登录中...'
                  : '注册中...'
                : mode === 'login'
                  ? '登录'
                  : '注册'}
            </button>
          </form>

        </div>
      </div>
    </div>
  )
}
