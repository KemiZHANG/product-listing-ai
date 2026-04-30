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
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 border-b border-slate-200 pb-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Generated listing copies</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">商品副本输出</h1>
          <p className="mt-2 text-sm text-slate-500">每张卡片就是一个完整副本，点击打开后可查看同一副本下的图片、标题和描述。</p>
        </div>

        <section className="mb-5 flex flex-wrap items-end gap-3 border border-slate-200 bg-white p-4 shadow-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">SKU</span>
            <input value={sku} onChange={(e) => setSku(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">类目</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">全部类目</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name_zh}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">语言</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">全部语言</option>
              {PRODUCT_LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">生成日期</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <button onClick={fetchCopies} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            筛选
          </button>
        </section>

        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {copies.length === 0 ? (
          <div className="border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm">暂无商品副本输出。</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {copies.map((copy) => {
              const product = copy.products
              const category = product?.categories
              const completedImages = (copy.product_copy_images || []).filter((image) => image.status === 'completed').length
              return (
                <Link key={copy.id} href={`/product-outputs/${copy.id}`} className="block border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-sm font-semibold text-slate-950">{copy.sku}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{copy.language_label}{copy.copy_index}</span>
                        <span className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{copy.status}</span>
                        <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{completedImages}/6 图</span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-400">{new Date(copy.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="mt-3 text-xs text-slate-500">{category ? `${category.icon} ${category.name_zh}` : '未关联类目'}</div>
                  <h2 className="mt-3 line-clamp-2 text-sm font-medium text-slate-900">{copy.generated_title || product?.source_title || '标题待生成'}</h2>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{copy.generated_description || product?.source_description || '描述待生成'}</p>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
