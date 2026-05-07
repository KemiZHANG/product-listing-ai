'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'
import { subscribeToTableChanges } from '@/lib/client-realtime'
import { signStorageUrls } from '@/lib/signed-storage'
import type { Category, Output } from '@/lib/types'
import Navbar from '@/components/Navbar'
import SignedImage from '@/components/SignedImage'
import { pickText, useUiLanguage } from '@/lib/ui-language'

export default function OutputsPage() {
  const router = useRouter()
  const { language } = useUiLanguage()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<Category[]>([])
  const [outputs, setOutputs] = useState<Output[]>([])
  const [outputUrls, setOutputUrls] = useState<Record<string, string>>({})
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [fetching, setFetching] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [downloadingSelected, setDownloadingSelected] = useState(false)

  // Filters
  const [categorySlug, setCategorySlug] = useState('')
  const [date, setDate] = useState('')
  const [promptNumber, setPromptNumber] = useState('')
  const [search, setSearch] = useState('')

  // Modal
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState('')

  const limit = 24
  const text = {
    loading: pickText(language, { zh: '加载中...', en: 'Loading...' }),
    eyebrow: pickText(language, { zh: '独立图片输出', en: 'Standalone image outputs' }),
    title: pickText(language, { zh: '图片输出', en: 'Image outputs' }),
    description: pickText(language, {
      zh: '这里展示从类目页批量运行的图片结果。它读取类目参考图和类目指令，不读取商品表里的 SKU 原图。',
      en: 'This page shows image results generated in batch from category workflows. It uses category references and prompts instead of SKU source images.',
    }),
    category: pickText(language, { zh: '类目', en: 'Category' }),
    allCategories: pickText(language, { zh: '全部类目', en: 'All categories' }),
    date: pickText(language, { zh: '日期', en: 'Date' }),
    promptNumber: pickText(language, { zh: 'Prompt 编号', en: 'Prompt number' }),
    all: pickText(language, { zh: '全部', en: 'All' }),
    search: pickText(language, { zh: 'SKU / 名称搜索', en: 'SKU / name search' }),
    searchPlaceholder: pickText(language, { zh: '输入 SKU 或图片名称...', en: 'Search by SKU or image name...' }),
    apply: pickText(language, { zh: '应用筛选', en: 'Apply filters' }),
    clear: pickText(language, { zh: '清除', en: 'Clear' }),
    summary: (total: number, selectedCount: number) => pickText(language, {
      zh: `共 ${total} 张图片，当前已选 ${selectedCount} 张`,
      en: `${total} images total, ${selectedCount} selected`,
    }),
    fetching: pickText(language, { zh: '加载中...', en: 'Loading...' }),
    selectPage: pickText(language, { zh: '全选当前页', en: 'Select page' }),
    clearSelection: pickText(language, { zh: '清空选择', en: 'Clear selection' }),
    downloading: pickText(language, { zh: '下载中...', en: 'Downloading...' }),
    downloadSelected: (count: number) => pickText(language, {
      zh: `下载所选 (${count})`,
      en: `Download selected (${count})`,
    }),
    empty: pickText(language, { zh: '暂无输出图片。', en: 'No image outputs yet.' }),
    selectOutput: (filename: string) => pickText(language, {
      zh: `选择 ${filename}`,
      en: `Select ${filename}`,
    }),
    download: pickText(language, { zh: '下载', en: 'Download' }),
    previous: pickText(language, { zh: '上一页', en: 'Previous' }),
    next: pickText(language, { zh: '下一页', en: 'Next' }),
    page: (current: number, pageCount: number) => pickText(language, {
      zh: `第 ${current} / ${pageCount} 页`,
      en: `Page ${current} / ${pageCount}`,
    }),
    close: pickText(language, { zh: '关闭', en: 'Close' }),
  }

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
        setOutputUrls(await signStorageUrls('outputs', data.data.map((output: Output) => output.storage_path)))
        setSelected((previous) => {
          const currentIds = new Set((data.data || []).map((output: Output) => output.id))
          return new Set(Array.from(previous).filter((id) => currentIds.has(id)))
        })
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

  useEffect(() => {
    if (loading) return

    return subscribeToTableChanges(
      'image-outputs-page-realtime',
      [
        { table: 'outputs' },
        { table: 'categories' },
      ],
      () => {
        void fetchOutputs()
      },
      { debounceMs: 500 }
    )
  }, [fetchOutputs, loading])

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
  }, [categorySlug, date, fetchOutputs, loading, promptNumber, search])

  const openPreview = async (output: Output) => {
    const urls = await signStorageUrls('outputs', [output.storage_path])
    setPreviewUrl(urls[output.storage_path] ?? outputUrls[output.storage_path] ?? '')
    setPreviewFilename(output.output_filename)
  }

  const handleDownload = async (output: Output) => {
    const link = document.createElement('a')
    const urls = await signStorageUrls('outputs', [output.storage_path])
    link.href = urls[output.storage_path] ?? outputUrls[output.storage_path] ?? ''
    link.download = output.output_filename
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const toggleSelected = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllCurrentPage = () => {
    setSelected(new Set(outputs.map((output) => output.id)))
  }

  const downloadSelectedOutputs = async () => {
    const selectedOutputs = outputs.filter((output) => selected.has(output.id))
    if (selectedOutputs.length === 0) return

    setDownloadingSelected(true)
    try {
      for (const output of selectedOutputs) {
        await handleDownload(output)
        await new Promise((resolve) => setTimeout(resolve, 180))
      }
    } finally {
      setDownloadingSelected(false)
    }
  }

  const getImageUrl = (storagePath: string) => {
    return outputUrls[storagePath] || ''
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-500">{text.loading}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(250,204,21,0.14),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(37,99,235,0.12),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_46%,#eef2f7_100%)]">
      <Navbar />

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <div className="mb-7">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{text.eyebrow}</p>
          <h2 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">{text.title}</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">{text.description}</p>
        </div>

        {/* Filter bar */}
        <div className="mb-6 rounded-[1.4rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="flex flex-wrap items-end gap-4">
            {/* Category */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{text.category}</label>
              <select
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">{text.allCategories}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.slug}>
                    {cat.icon} {cat.name_zh}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{text.date}</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Prompt number */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{text.promptNumber}</label>
              <select
                value={promptNumber}
                onChange={(e) => setPromptNumber(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">{text.all}</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    P{n}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-600">{text.search}</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={text.searchPlaceholder}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleApplyFilter}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                {text.apply}
              </button>
              <button
                onClick={handleClearFilter}
                className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {text.clear}
              </button>
            </div>
          </div>
        </div>

        {/* Results info */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-gray-500">
              {text.summary(total, selected.size)}
            </p>
            {fetching && <span className="text-xs text-gray-400">{text.fetching}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={selectAllCurrentPage}
              disabled={outputs.length === 0}
              className="rounded-xl border border-slate-300 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {text.selectPage}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              disabled={selected.size === 0}
              className="rounded-xl border border-slate-300 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {text.clearSelection}
            </button>
            <button
              onClick={downloadSelectedOutputs}
              disabled={selected.size === 0 || downloadingSelected}
              className="rounded-xl bg-[linear-gradient(135deg,#071228,#0f172a)] px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-300 disabled:shadow-none"
            >
              {downloadingSelected ? text.downloading : text.downloadSelected(selected.size)}
            </button>
          </div>
        </div>

        {/* Output grid */}
        {outputs.length === 0 ? (
          <div className="rounded-[1.4rem] bg-white/88 p-12 text-center shadow-sm">
            <p className="text-gray-500">{text.empty}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {outputs.map((output) => (
              <div
                key={output.id}
                className={`group relative overflow-hidden rounded-[1.4rem] border bg-white/90 shadow-[0_18px_55px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-1 hover:shadow-xl ${selected.has(output.id) ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200/80'}`}
              >
                <label className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 shadow-sm ring-1 ring-slate-200">
                  <input
                    type="checkbox"
                    checked={selected.has(output.id)}
                    onChange={() => toggleSelected(output.id)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    aria-label={text.selectOutput(output.output_filename)}
                  />
                </label>
                {/* Image preview */}
                <button
                  onClick={() => openPreview(output)}
                  className="block w-full"
                >
                  <div className="aspect-square bg-gray-100">
                    <SignedImage
                      src={getImageUrl(output.storage_path)}
                      alt={output.output_filename}
                      fill
                      className="h-full w-full object-cover"
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
                  title={text.download}
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
              {text.previous}
            </button>
            <span className="text-sm text-gray-600">
              {text.page(page, totalPages)}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {text.next}
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
                {text.close}
              </button>
            </div>
            <SignedImage
              src={previewUrl}
              alt={previewFilename}
              width={1200}
              height={1200}
              className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )
}
