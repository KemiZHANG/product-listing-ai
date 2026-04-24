'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'
import type { Category } from '@/lib/types'
import Navbar from '@/components/Navbar'

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<Category[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newForm, setNewForm] = useState({ name_zh: '', slug: '', icon: '📦' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const res = await apiFetch('/api/categories')
      if (res.ok) {
        const data = await res.json()
        setCategories(data)
      }
    } catch {
      // silently ignore fetch errors for now
    }
  }, [])

  useEffect(() => {
    if (!loading) {
      fetchCategories()
    }
  }, [loading, fetchCategories])

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Run selected categories
  const handleRun = async () => {
    if (selected.size === 0) return
    setRunning(true)
    setError(null)
    try {
      const res = await apiFetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_ids: Array.from(selected) }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create job')
      }
      router.push('/jobs')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setRunning(false)
    }
  }

  // Create new category
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const res = await apiFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create category')
      }
      setShowNewModal(false)
      setNewForm({ name_zh: '', slug: '', icon: '📦' })
      await fetchCategories()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Top bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-gray-900">类目管理</h2>
          <div className="flex gap-3">
            <button
              onClick={handleRun}
              disabled={selected.size === 0 || running}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {running ? '提交中...' : `运行已勾选类目 (${selected.size})`}
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              新建类目
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Category grid */}
        {categories.length === 0 ? (
          <div className="rounded-lg bg-white p-12 text-center shadow-sm">
            <p className="text-gray-500">暂无类目，点击&quot;新建类目&quot;开始创建。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="group relative rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selected.has(cat.id)}
                  onChange={() => toggleSelect(cat.id)}
                  className="absolute right-3 top-3 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />

                <Link href={`/category/${cat.slug}`} className="block">
                  <div className="mb-3 text-3xl">{cat.icon}</div>
                  <h3 className="mb-1 text-base font-semibold text-gray-900">
                    {cat.name_zh}
                  </h3>
                  <p className="mb-3 text-xs text-gray-400">/{cat.slug}</p>
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>{cat.prompt_count ?? 0} Prompts</span>
                    <span>{cat.image_count ?? 0} Images</span>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New Category Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setShowNewModal(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">新建类目</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  类目名称
                </label>
                <input
                  required
                  value={newForm.name_zh}
                  onChange={(e) =>
                    setNewForm((f) => ({ ...f, name_zh: e.target.value }))
                  }
                  placeholder="例如：护肤品"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Slug
                </label>
                <input
                  required
                  value={newForm.slug}
                  onChange={(e) =>
                    setNewForm((f) => ({ ...f, slug: e.target.value }))
                  }
                  placeholder="例如：skincare"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Icon
                </label>
                <input
                  value={newForm.icon}
                  onChange={(e) =>
                    setNewForm((f) => ({ ...f, icon: e.target.value }))
                  }
                  placeholder="emoji icon"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? '创建中...' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
