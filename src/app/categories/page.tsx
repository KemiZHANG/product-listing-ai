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
  const [notice, setNotice] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)

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

  const toggleSelected = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runSelectedCategories = async () => {
    if (selected.size === 0) return
    setRunning(true)
    setError(null)
    setNotice(null)
    const res = await apiFetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_ids: Array.from(selected) }),
    })
    const data = await res.json().catch(() => null)
    setRunning(false)
    if (!res.ok) {
      setError(data?.error || '创建单纯图片生成任务失败。请确认所选类目同时有指令和类目参考图。')
      return
    }
    setNotice(`已创建单纯图片生成任务：${data.total_items || 0} 张图片任务。可到 Image Outputs 查看结果。`)
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
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">类目页同时管理两类内容：商品生成会读取类目指令；单纯图片生成会读取类目指令和类目参考图。</p>
          </div>
          <button
            onClick={runSelectedCategories}
            disabled={selected.size === 0 || running}
            className="w-fit rounded-2xl bg-[linear-gradient(135deg,#071228,#0f172a)] px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-slate-950/18 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-300 disabled:shadow-none"
          >
            {running ? '创建任务中...' : `运行所选类目 (${selected.size})`}
          </button>
        </div>

        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 shadow-sm">{error}</div>}
        {notice && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700 shadow-sm">{notice}</div>}

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
            <article key={category.id} className={`group overflow-hidden rounded-[1.4rem] border bg-white/88 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur transition-all hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl hover:shadow-slate-200/70 ${selected.has(category.id) ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200/80'}`}>
              <div className="p-6">
                <label className="mb-4 inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                  <input
                    type="checkbox"
                    checked={selected.has(category.id)}
                    onChange={() => toggleSelected(category.id)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  选择运行
                </label>
                <Link href={`/categories/${category.id}`} className="min-w-0">
                  <div className="flex flex-col gap-4">
                    <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 text-4xl ring-1 ring-slate-100">{category.icon}</span>
                    <div>
                      <h2 className="text-xl font-semibold text-slate-950">{category.name_zh}</h2>
                      <p className="mt-1 text-sm text-slate-500">{category.slug}</p>
                      <div className="mt-5 flex items-center justify-between">
                        <span className="text-sm text-slate-500">{category.prompt_count ?? 0} prompts · {category.image_count ?? 0} images</span>
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
