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

const CATEGORY_ACCENTS = [
  {
    border: 'border-zinc-500',
    ring: 'ring-zinc-500/20',
    soft: 'bg-zinc-800 text-zinc-200',
    icon: 'bg-zinc-800 text-zinc-100',
    bar: 'bg-zinc-700',
    hover: 'hover:border-zinc-500',
  },
]

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

  const statCards = [
    { label: '类目', value: categories.length },
    { label: 'Prompts', value: stats.prompts },
    { label: '产品图片', value: stats.images },
    { label: '预计出图数', value: stats.jobs },
  ]

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
      <div className="flex min-h-screen items-center justify-center bg-[#141414]">
        <div className="rounded-md border border-stone-700 bg-stone-900 px-4 py-3 text-sm text-stone-400 shadow-sm">
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#141414]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="mb-6 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-sm">
          <div className="h-px bg-zinc-700" />
          <div className="flex flex-col gap-5 bg-stone-900 px-5 py-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="inline-flex rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300 ring-1 ring-zinc-700">
                Dashboard
              </p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-50">类目管理</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">
                管理电商生图类目、产品图片和 prompts。预置类目现在也可以删除，删除后不会自动恢复。
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleRun}
                disabled={selected.size === 0 || running}
                className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 shadow-sm transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running ? '提交中...' : `运行已选类目 (${selected.size})`}
              </button>
              <button
                onClick={() => setShowNewModal(true)}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 shadow-sm transition-colors hover:bg-zinc-700"
              >
                新建类目
              </button>
            </div>
          </div>

          <div className="grid gap-3 border-t border-stone-800 bg-stone-950/60 p-4 sm:grid-cols-4">
            {statCards.map((card) => (
              <div key={card.label} className="rounded-md border border-zinc-800 bg-zinc-900 p-4 shadow-sm">
                <div className="mb-3 h-px w-12 rounded-full bg-zinc-600" />
                <div className="text-2xl font-semibold text-stone-50">{card.value}</div>
                <div className="mt-1 text-xs font-medium text-zinc-400">{card.label}</div>
              </div>
            ))}
          </div>
        </section>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-stone-400">
            {categoriesLoading ? '正在同步最新类目...' : `共 ${categories.length} 个类目`}
          </div>
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-md border border-stone-700 px-3 py-1.5 text-sm font-medium text-stone-300 transition-colors hover:bg-stone-800 hover:text-stone-50"
            >
              清空选择
            </button>
          )}
        </div>

        {categoriesLoading && categories.length === 0 ? (
          <div className="rounded-lg border border-stone-700 bg-stone-900 p-12 text-center shadow-sm">
            <p className="text-sm text-stone-400">类目加载中...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-600 bg-stone-900 p-12 text-center">
            <h2 className="text-base font-semibold text-stone-50">暂无类目</h2>
            <p className="mt-2 text-sm text-stone-400">点击“新建类目”开始创建自己的 prompt 工作区。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {categories.map((category, index) => {
              const isSelected = selected.has(category.id)
              const isDeleting = deletingId === category.id
              const accent = CATEGORY_ACCENTS[index % CATEGORY_ACCENTS.length]

              return (
                <article
                  key={category.id}
                  className={`group overflow-hidden rounded-lg border bg-stone-900 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl ${
                    isSelected ? `${accent.border} ring-2 ${accent.ring}` : `border-stone-700 ${accent.hover}`
                  }`}
                >
                  <div className={`h-1 ${accent.bar}`} />
                  <div className="p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <button
                      onClick={() => toggleSelect(category.id)}
                      className={`flex h-10 min-w-10 items-center justify-center rounded-md border-2 text-sm font-bold shadow-sm transition-colors ${
                        isSelected
                          ? 'border-zinc-100 bg-zinc-100 text-zinc-950'
                          : 'border-zinc-500 bg-zinc-900 text-zinc-300 hover:border-zinc-200 hover:text-zinc-100'
                      }`}
                      aria-label={isSelected ? '取消选择类目' : '选择类目'}
                    >
                      {isSelected ? '✓' : '□'}
                    </button>

                    <button
                      onClick={() => askDeleteCategory(category)}
                      disabled={isDeleting}
                      className="rounded-md border border-red-400/20 px-2 py-1 text-xs font-medium text-red-300 opacity-90 transition-colors hover:bg-red-400/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isDeleting ? '删除中' : '删除'}
                    </button>
                  </div>

                  <Link href={`/category/${category.slug}`} className="block">
                    <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-md text-2xl shadow-sm ${accent.icon}`}>
                      {category.icon}
                    </div>
                    <h3 className="line-clamp-1 text-base font-semibold text-stone-50">
                      {category.name_zh}
                    </h3>
                    <p className="mt-1 line-clamp-1 text-xs text-stone-500">/{category.slug}</p>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className={`rounded-md px-3 py-2 ${accent.soft}`}>
                        <div className="text-sm font-semibold text-stone-50">{category.prompt_count ?? 0}</div>
                        <div className="mt-0.5 text-[11px] opacity-75">Prompts</div>
                      </div>
                      <div className="rounded-md bg-stone-800 px-3 py-2">
                        <div className="text-sm font-semibold text-stone-50">{category.image_count ?? 0}</div>
                        <div className="mt-0.5 text-[11px] text-stone-400">Images</div>
                      </div>
                    </div>
                  </Link>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>

      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-black/70" onClick={() => setShowNewModal(false)} />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-lg border border-stone-700 bg-stone-900 shadow-xl">
            <div className="h-px bg-zinc-700" />
            <div className="p-6">
            <h3 className="text-lg font-semibold text-stone-50">新建类目</h3>
            <p className="mt-1 text-sm text-stone-400">创建一个新的类目工作区，再为它添加 prompts 和产品图片。</p>

            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-300">类目名称</label>
                <input
                  required
                  value={newForm.name_zh}
                  onChange={(event) => setNewForm((form) => ({ ...form, name_zh: event.target.value }))}
                  placeholder="例如：护肤品"
                  className="w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-50 placeholder-stone-500 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-300"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-300">Slug</label>
                <input
                  required
                  value={newForm.slug}
                  onChange={(event) => setNewForm((form) => ({ ...form, slug: event.target.value }))}
                  onBlur={() => setNewForm((form) => ({ ...form, slug: slugify(form.slug) }))}
                  placeholder="例如：skincare"
                  className="w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-50 placeholder-stone-500 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-300"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-300">Icon</label>
                <input
                  value={newForm.icon}
                  onChange={(event) => setNewForm((form) => ({ ...form, icon: event.target.value }))}
                  placeholder="emoji icon"
                  className="w-full rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-50 placeholder-stone-500 focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-300"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="rounded-md border border-stone-700 px-4 py-2 text-sm font-medium text-stone-300 transition-colors hover:bg-stone-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-white disabled:opacity-50"
                >
                  {creating ? '创建中...' : '创建'}
                </button>
              </div>
            </form>
            </div>
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
