'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'
import type { Category, Output } from '@/lib/types'
import Navbar from '@/components/Navbar'

export default function OutputsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<Category[]>([])
  const [outputs, setOutputs] = useState<Output[]>([])
  const [outputUrls, setOutputUrls] = useState<Record<string, string>>({})
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [fetching, setFetching] = useState(false)

  // Filters
  const [categorySlug, setCategorySlug] = useState('')
  const [date, setDate] = useState('')
  const [promptNumber, setPromptNumber] = useState('')
  const [search, setSearch] = useState('')

  // Modal
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState('')

  const limit = 24

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

  // Fetch categories for filter dropdown
  const fetchCategories = useCallback(async () => {
    try {
      const res = await apiFetch('/api/categories')
      if (res.ok) {
        const data = await res.json()
        setCategories(data)
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    if (!loading) {
      fetchCategories()
    }
  }, [loading, fetchCategories])

  // Fetch outputs
  const fetchOutputs = useCallback(async () => {
    setFetching(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(limit))
      if (categorySlug) params.set('category_slug', categorySlug)
      if (date) params.set('date', date)
      if (promptNumber) params.set('prompt_number', promptNumber)
      if (search) params.set('search', search)

      const res = await apiFetch(`/api/outputs?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setOutputs(data.data)
        setTotal(data.total)
        setTotalPages(data.totalPages)
        const signedUrls = await Promise.all(
          data.data.map(async (output: Output) => {
            const { data: signed } = await supabase.storage
              .from('outputs')
              .createSignedUrl(output.storage_path, 60 * 60)
            return [output.storage_path, signed?.signedUrl ?? ''] as const
          })
        )
        setOutputUrls(Object.fromEntries(signedUrls))
      }
    } catch {
      // silent
    } finally {
      setFetching(false)
    }
  }, [page, categorySlug, date, promptNumber, search])

  useEffect(() => {
    if (!loading) {
      fetchOutputs()
    }
  }, [loading, fetchOutputs])

  const handleApplyFilter = () => {
    setPage(1)
    fetchOutputs()
  }

  const handleClearFilter = () => {
    setCategorySlug('')
    setDate('')
    setPromptNumber('')
    setSearch('')
    setPage(1)
  }

  // After clearing, re-fetch via the state update cycle
  useEffect(() => {
    if (!loading && categorySlug === '' && date === '' && promptNumber === '' && search === '') {
      fetchOutputs()
    }
  }, [categorySlug, date, promptNumber, search])

  const openPreview = async (output: Output) => {
    const { data } = await supabase.storage
      .from('outputs')
      .createSignedUrl(output.storage_path, 60 * 60)
    setPreviewUrl(data?.signedUrl ?? outputUrls[output.storage_path] ?? '')
    setPreviewFilename(output.output_filename)
  }

  const handleDownload = async (output: Output) => {
    const { data } = await supabase.storage
      .from('outputs')
      .createSignedUrl(output.storage_path, 60 * 60)
    const link = document.createElement('a')
    link.href = data?.signedUrl ?? outputUrls[output.storage_path] ?? ''
    link.download = output.output_filename
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const getImageUrl = (storagePath: string) => {
    return outputUrls[storagePath] || ''
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(250,204,21,0.14),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(37,99,235,0.12),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_46%,#eef2f7_100%)]">
      <Navbar />

      <main className="mx-auto max-w-[1600px] px-5 py-10 sm:px-8">
        <div className="mb-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Standalone image outputs</p>
          <h2 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">单纯图片输出</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">这里展示从类目页批量运行的图片结果。它读取类目参考图和类目指令，不读取商品表里的 SKU 原图。</p>
        </div>

        {/* Filter bar */}
        <div className="mb-6 rounded-[1.4rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="flex flex-wrap items-end gap-4">
            {/* Category */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">类目</label>
              <select
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">全部类目</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.slug}>
                    {cat.icon} {cat.name_zh}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">日期</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Prompt number */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Prompt 编号</label>
              <select
                value={promptNumber}
                onChange={(e) => setPromptNumber(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">全部</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    P{n}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-600">SKU / 名称搜索</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="输入 SKU 或图片名称..."
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleApplyFilter}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                应用筛选
              </button>
              <button
                onClick={handleClearFilter}
                className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                清除
              </button>
            </div>
          </div>
        </div>

        {/* Results info */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            共 {total} 张图片
          </p>
          {fetching && <span className="text-xs text-gray-400">加载中...</span>}
        </div>

        {/* Output grid */}
        {outputs.length === 0 ? (
          <div className="rounded-[1.4rem] bg-white/88 p-12 text-center shadow-sm">
            <p className="text-gray-500">暂无输出图片。</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {outputs.map((output) => (
              <div
                key={output.id}
                className="group relative overflow-hidden rounded-[1.4rem] border border-slate-200/80 bg-white/90 shadow-[0_18px_55px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                {/* Image preview */}
                <button
                  onClick={() => openPreview(output)}
                  className="block w-full"
                >
                  <div className="aspect-square bg-gray-100">
                    <img
                      src={getImageUrl(output.storage_path)}
                      alt={output.output_filename}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                </button>

                {/* Info */}
                <div className="p-3">
                  <p className="truncate text-sm font-medium text-gray-900" title={output.output_filename}>
                    {output.output_filename}
                  </p>
                  <div className="mt-1 flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                      <span className="mr-2">{output.category_slug}</span>
                      <span>P{output.prompt_number}</span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(output.created_at).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                </div>

                {/* Download button overlay */}
                <button
                  onClick={() => handleDownload(output)}
                  className="absolute right-2 top-2 rounded-md bg-white/90 p-1.5 text-gray-600 shadow-sm opacity-0 transition-opacity hover:bg-white hover:text-gray-900 group-hover:opacity-100"
                  title="下载"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              上一页
            </button>
            <span className="text-sm text-gray-600">
              第 {page} / {totalPages} 页
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              下一页
            </button>
          </div>
        )}
      </main>

      {/* Full-size preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/80"
            onClick={() => { setPreviewUrl(null); setPreviewFilename('') }}
          />
          <div className="relative z-10 flex max-h-[90vh] max-w-[90vw] flex-col items-center">
            <div className="mb-3 flex items-center gap-4">
              <p className="text-sm text-white">{previewFilename}</p>
              <button
                onClick={() => { setPreviewUrl(null); setPreviewFilename('') }}
                className="rounded-md bg-white/20 px-3 py-1 text-sm text-white hover:bg-white/30 transition-colors"
              >
                关闭
              </button>
            </div>
            <img
              src={previewUrl}
              alt={previewFilename}
              className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )
}
