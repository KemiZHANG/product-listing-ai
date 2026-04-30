'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { Category } from '@/lib/types'

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function CategoriesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [icon, setIcon] = useState('📦')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [upgrading, setUpgrading] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login')
      else setLoading(false)
    })
  }, [router])

  const fetchCategories = useCallback(async () => {
    const res = await apiFetch('/api/categories')
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '类目加载失败')
      return
    }
    setCategories(data || [])
  }, [])

  useEffect(() => {
    if (!loading) fetchCategories()
  }, [loading, fetchCategories])

  const createCategory = async (event: React.FormEvent) => {
    event.preventDefault()
    setCreating(true)
    setError(null)
    const finalSlug = slugify(slug || name)
    const res = await apiFetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name_zh: name.trim(), slug: finalSlug, icon: icon.trim() || '📦' }),
    })
    const data = await res.json().catch(() => null)
    setCreating(false)
    if (!res.ok) {
      setError(data?.error || '创建类目失败')
      return
    }
    setName('')
    setSlug('')
    setIcon('📦')
    await fetchCategories()
  }

  const deleteCategory = async (category: Category) => {
    if (!window.confirm(`确定删除类目「${category.name_zh}」吗？该类目的指令也会删除。`)) return
    const res = await apiFetch(`/api/categories/${category.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '删除类目失败')
      return
    }
    await fetchCategories()
  }

  const upgradePrompts = async () => {
    if (!window.confirm('确定把所有类目升级为 6 条指令结构吗？这会重写当前类目指令。')) return
    setUpgrading(true)
    setError(null)
    const res = await apiFetch('/api/categories/upgrade-prompts', { method: 'POST' })
    const data = await res.json().catch(() => null)
    setUpgrading(false)
    if (!res.ok) {
      setError(data?.error || '升级类目指令失败')
      return
    }
    await fetchCategories()
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Prompt categories</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">类目与生图指令</h1>
            <p className="mt-2 text-sm text-slate-500">这里管理你的 23 个类目和每个类目下的 6 条或更多图片指令。商品页只从这里选择类目。</p>
          </div>
          <button
            onClick={upgradePrompts}
            disabled={upgrading}
            className="w-fit rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-50"
          >
            {upgrading ? '升级中...' : '升级全部类目为 6 指令'}
          </button>
        </div>

        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <form onSubmit={createCategory} className="mb-5 grid gap-3 border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[90px_1fr_1fr_auto]">
          <input value={icon} onChange={(e) => setIcon(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="图标" />
          <input required value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="类目名称" />
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="slug，可自动生成" />
          <button disabled={creating} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {creating ? '创建中...' : '新增类目'}
          </button>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <article key={category.id} className="border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/categories/${category.id}`} className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-xl">{category.icon}</span>
                    <div>
                      <h2 className="font-semibold text-slate-950">{category.name_zh}</h2>
                      <p className="mt-1 text-xs text-slate-500">{category.prompt_count ?? 0} 条指令</p>
                    </div>
                  </div>
                </Link>
                <button onClick={() => deleteCategory(category)} className="text-sm font-medium text-red-600 hover:text-red-800">
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  )
}
