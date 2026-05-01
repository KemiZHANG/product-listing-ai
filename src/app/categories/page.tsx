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

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(250,204,21,0.18),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(37,99,235,0.12),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_46%,#eef2f7_100%)]">
      <Navbar />
      <main className="mx-auto max-w-[1600px] px-5 py-10 sm:px-8">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Category prompts</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">类目管理</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">每个类目只存放对应的图片生成指令，商品在工作台中选择类目后自动调用这些指令。</p>
          </div>
        </div>

        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 shadow-sm">{error}</div>}

        <form onSubmit={createCategory} className="mb-7 grid gap-3 rounded-[1.4rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur md:grid-cols-[110px_1fr_1fr_auto]">
          <input value={icon} onChange={(e) => setIcon(e.target.value)} className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="图标" />
          <input required value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="类目名称" />
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="slug，可自动生成" />
          <button disabled={creating} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800 disabled:opacity-50">
            {creating ? '创建中...' : '新增类目'}
          </button>
        </form>

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {categories.map((category) => (
            <article key={category.id} className="group overflow-hidden rounded-[1.4rem] border border-slate-200/80 bg-white/88 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur transition-all hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl hover:shadow-slate-200/70">
              <div className="p-6">
                <Link href={`/categories/${category.id}`} className="min-w-0">
                  <div className="flex flex-col gap-4">
                    <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 text-4xl ring-1 ring-slate-100">{category.icon}</span>
                    <div>
                      <h2 className="text-xl font-semibold text-slate-950">{category.name_zh}</h2>
                      <p className="mt-1 text-sm text-slate-500">{category.slug}</p>
                      <div className="mt-5 flex items-center justify-between">
                        <span className="text-sm text-slate-500">{category.prompt_count ?? 0} prompts</span>
                        {category.is_preset && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600 ring-1 ring-blue-100">Preset</span>}
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
              <div className="grid grid-cols-2 border-t border-slate-200 bg-slate-50/60">
                <Link href={`/categories/${category.id}`} className="px-5 py-4 text-center text-sm font-semibold text-slate-700 hover:bg-white">
                  打开指令
                </Link>
                <button onClick={() => deleteCategory(category)} className="border-l border-slate-200 px-5 py-4 text-sm font-semibold text-red-600 hover:bg-red-50">
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
