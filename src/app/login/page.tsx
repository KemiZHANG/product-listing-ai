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
      router.push('/')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? formatAuthError(err.message) : '发生未知错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Title */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Nano Banana 生图系统</h1>
          <p className="mt-1 text-sm text-gray-500">AI Image Generation Platform</p>
        </div>

        {/* Card */}
        <div className="rounded-lg bg-white p-6 shadow-md">
          {/* Tabs */}
          <div className="mb-6 flex rounded-md bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('login')
                setError(null)
              }}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
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
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
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
            <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
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
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
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
