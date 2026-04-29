'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/ConfirmDialog'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { Category } from '@/lib/types'

type NewCategoryForm = {
  name_zh: string
  slug: string
  icon: string
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newForm, setNewForm] = useState<NewCategoryForm>({ name_zh: '', slug: '', icon: '📦' })
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/login')
      } else {
        setLoading(false)
      }
    })
  }, [router])

  const fetchCategories = useCallback(async () => {
    const cacheKey = 'nano-banana:categories'
    const cached = window.sessionStorage.getItem(cacheKey)
    if (cached) {
      try {
        setCategories(JSON.parse(cached))
      } catch {
        window.sessionStorage.removeItem(cacheKey)
      }
    }

    setCategoriesLoading(true)
    try {
      const res = await apiFetch('/api/categories')
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || '类目加载失败，请刷新页面重试。')
        return
      }

      setCategories(data)
      window.sessionStorage.setItem(cacheKey, JSON.stringify(data))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '类目加载失败，请刷新页面重试。')
    } finally {
      setCategoriesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!loading) {
      fetchCategories()
    }
  }, [loading, fetchCategories])

  const stats = useMemo(() => {
    const prompts = categories.reduce((sum, category) => sum + (category.prompt_count ?? 0), 0)
    const images = categories.reduce((sum, category) => sum + (category.image_count ?? 0), 0)
    const jobs = categories.reduce(
      (sum, category) => sum + (category.prompt_count ?? 0) * (category.image_count ?? 0),
      0
    )
    return { prompts, images, jobs }
  }, [categories])

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || '创建任务失败。')
      }
      router.push('/jobs')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '发生未知错误。')
    } finally {
      setRunning(false)
    }
  }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const form = {
        ...newForm,
        slug: slugify(newForm.slug),
        icon: newForm.icon.trim() || '📦',
      }
      const res = await apiFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || '创建类目失败。')
      }

      setShowNewModal(false)
      setNewForm({ name_zh: '', slug: '', icon: '📦' })
      window.sessionStorage.removeItem('nano-banana:categories')
      await fetchCategories()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '发生未知错误。')
    } finally {
      setCreating(false)
    }
  }

  const askDeleteCategory = (category: Category) => {
    setConfirmDialog({
      isOpen: true,
      title: '删除类目',
      message: `确定删除「${category.name_zh}」吗？该类目下的 prompts 和产品图片记录会一起删除，此操作不可撤销。`,
      onConfirm: async () => {
        setDeletingId(category.id)
        setError(null)
        try {
          const res = await apiFetch(`/api/categories/${category.id}`, { method: 'DELETE' })
          const data = await res.json().catch(() => null)
          if (!res.ok) {
            throw new Error(data?.error || '删除类目失败。')
          }

          setSelected((prev) => {
            const next = new Set(prev)
            next.delete(category.id)
            return next
          })
          window.sessionStorage.removeItem('nano-banana:categories')
          window.sessionStorage.removeItem(`nano-banana:category:${category.slug}`)
          await fetchCategories()
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : '删除类目失败。')
        } finally {
          setDeletingId(null)
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
        }
      },
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="mb-6 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Dashboard</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950">类目管理</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                管理电商生图类目、产品图片和 prompts。预置类目现在也可以删除，删除后不会自动恢复。
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleRun}
                disabled={selected.size === 0 || running}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running ? '提交中...' : `运行已选类目 (${selected.size})`}
              </button>
              <button
                onClick={() => setShowNewModal(true)}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                新建类目
              </button>
            </div>
          </div>

          <div className="grid border-t border-slate-100 sm:grid-cols-4">
            <div className="border-b border-slate-100 px-5 py-4 sm:border-b-0 sm:border-r">
              <div className="text-2xl font-semibold text-slate-950">{categories.length}</div>
              <div className="mt-1 text-xs text-slate-500">类目</div>
            </div>
            <div className="border-b border-slate-100 px-5 py-4 sm:border-b-0 sm:border-r">
              <div className="text-2xl font-semibold text-slate-950">{stats.prompts}</div>
              <div className="mt-1 text-xs text-slate-500">Prompts</div>
            </div>
            <div className="border-b border-slate-100 px-5 py-4 sm:border-b-0 sm:border-r">
              <div className="text-2xl font-semibold text-slate-950">{stats.images}</div>
              <div className="mt-1 text-xs text-slate-500">产品图片</div>
            </div>
            <div className="px-5 py-4">
              <div className="text-2xl font-semibold text-slate-950">{stats.jobs}</div>
              <div className="mt-1 text-xs text-slate-500">预计出图数</div>
            </div>
          </div>
        </section>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            {categoriesLoading ? '正在同步最新类目...' : `共 ${categories.length} 个类目`}
          </div>
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              清空选择
            </button>
          )}
        </div>

        {categoriesLoading && categories.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
            <p className="text-sm text-slate-500">类目加载中...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
            <h2 className="text-base font-semibold text-slate-900">暂无类目</h2>
            <p className="mt-2 text-sm text-slate-500">点击“新建类目”开始创建自己的 prompt 工作区。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {categories.map((category) => {
              const isSelected = selected.has(category.id)
              const isDeleting = deletingId === category.id

              return (
                <article
                  key={category.id}
                  className={`group rounded-lg border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md ${
                    isSelected ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'
                  }`}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <button
                      onClick={() => toggleSelect(category.id)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md border text-sm transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-600 text-white'
                          : 'border-slate-200 bg-white text-slate-400 hover:border-blue-300 hover:text-blue-600'
                      }`}
                      aria-label={isSelected ? '取消选择类目' : '选择类目'}
                    >
                      {isSelected ? '✓' : ''}
                    </button>

                    <button
                      onClick={() => askDeleteCategory(category)}
                      disabled={isDeleting}
                      className="rounded-md px-2 py-1 text-xs font-medium text-red-500 opacity-80 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isDeleting ? '删除中' : '删除'}
                    </button>
                  </div>

                  <Link href={`/category/${category.slug}`} className="block">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-2xl">
                      {category.icon}
                    </div>
                    <h3 className="line-clamp-1 text-base font-semibold text-slate-950">
                      {category.name_zh}
                    </h3>
                    <p className="mt-1 line-clamp-1 text-xs text-slate-400">/{category.slug}</p>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-md bg-slate-50 px-3 py-2">
                        <div className="text-sm font-semibold text-slate-900">{category.prompt_count ?? 0}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">Prompts</div>
                      </div>
                      <div className="rounded-md bg-slate-50 px-3 py-2">
                        <div className="text-sm font-semibold text-slate-900">{category.image_count ?? 0}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">Images</div>
                      </div>
                    </div>
                  </Link>
                </article>
              )
            })}
          </div>
        )}
      </main>

      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-slate-950/50" onClick={() => setShowNewModal(false)} />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-950">新建类目</h3>
            <p className="mt-1 text-sm text-slate-500">创建一个新的类目工作区，再为它添加 prompts 和产品图片。</p>

            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">类目名称</label>
                <input
                  required
                  value={newForm.name_zh}
                  onChange={(event) => setNewForm((form) => ({ ...form, name_zh: event.target.value }))}
                  placeholder="例如：护肤品"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Slug</label>
                <input
                  required
                  value={newForm.slug}
                  onChange={(event) => setNewForm((form) => ({ ...form, slug: event.target.value }))}
                  onBlur={() => setNewForm((form) => ({ ...form, slug: slugify(form.slug) }))}
                  placeholder="例如：skincare"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Icon</label>
                <input
                  value={newForm.icon}
                  onChange={(event) => setNewForm((form) => ({ ...form, icon: event.target.value }))}
                  placeholder="emoji icon"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? '创建中...' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}
