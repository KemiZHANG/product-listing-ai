'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { PRODUCT_LANGUAGES } from '@/lib/types'
import type { Category, ProductCopy } from '@/lib/types'

export default function ProductOutputsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [copies, setCopies] = useState<ProductCopy[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [sku, setSku] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [language, setLanguage] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login')
      else setLoading(false)
    })
  }, [router])

  const fetchCategories = useCallback(async () => {
    const res = await apiFetch('/api/categories')
    if (res.ok) setCategories(await res.json())
  }, [])

  const fetchCopies = useCallback(async () => {
    setError(null)
    const params = new URLSearchParams()
    if (sku) params.set('sku', sku)
    if (categoryId) params.set('category_id', categoryId)
    if (language) params.set('language', language)
    if (date) params.set('date', date)
    const res = await apiFetch(`/api/product-copies?${params.toString()}`)
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '输出结果加载失败')
      return
    }
    setCopies(data || [])
  }, [sku, categoryId, language, date])

  useEffect(() => {
    if (!loading) {
      fetchCategories()
      fetchCopies()
    }
  }, [loading, fetchCategories, fetchCopies])

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_48%,#f1f5f9_100%)]">
      <Navbar />
      <main className="mx-auto max-w-[1600px] px-5 py-8 sm:px-8">
        <div className="mb-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Generated listings</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">商品副本输出</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">按 SKU、类目、语言和生成时间筛选。每个副本包含标题、描述和 6 张图片任务。</p>
        </div>

        <section className="mb-6 grid gap-4 rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">SKU</span>
            <input value={sku} onChange={(e) => setSku(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="请输入 SKU" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">类目</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
              <option value="">全部类目</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name_zh}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">语言</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
              <option value="">全部语言</option>
              {PRODUCT_LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">生成日期</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" />
          </label>
          <button onClick={fetchCopies} className="rounded-xl bg-slate-950 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800">
            筛选
          </button>
        </section>

        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 shadow-sm">{error}</div>}

        {copies.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-20 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-50 text-4xl">📄</div>
            <h2 className="text-xl font-semibold text-slate-950">暂无商品副本输出。</h2>
            <p className="mt-2 text-sm text-slate-500">回到商品工作台，选择商品并开始生成。</p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {copies.map((copy) => {
              const product = copy.products
              const category = product?.categories
              const completedImages = (copy.product_copy_images || []).filter((image) => image.status === 'completed').length
              return (
                <Link key={copy.id} href={`/product-outputs/${copy.id}`} className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-xl hover:shadow-slate-200/70">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-xl font-semibold text-slate-950">{copy.sku}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{copy.language_label}{copy.copy_index}</span>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{copy.status}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{completedImages}/6 图</span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-400">{new Date(copy.created_at).toLocaleString()}</div>
                  </div>
                  <div className="mt-3 text-xs text-slate-500">{category ? `${category.icon} ${category.name_zh}` : '未关联类目'}</div>
                  <h2 className="mt-3 line-clamp-2 text-sm font-semibold text-slate-900">{copy.generated_title || product?.source_title || '标题待生成'}</h2>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{copy.generated_description || product?.source_description || '描述待生成'}</p>
                  <div className="mt-4 text-right text-sm font-semibold text-slate-900">打开详情 →</div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
