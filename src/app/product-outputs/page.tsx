'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { subscribeToTableChanges } from '@/lib/client-realtime'
import PaginationBar from '@/components/PaginationBar'
import StorageImage from '@/components/StorageImage'
import { supabase } from '@/lib/supabase'
import { sanitizeListingText } from '@/lib/listing-text'
import { signStorageUrls } from '@/lib/signed-storage'
import { pickText, useUiLanguage, type UiLanguage } from '@/lib/ui-language'
import { PRODUCT_LANGUAGES, type ListingStatus } from '@/lib/types'
import type { Category, ProductCopy, ProductCopyImage } from '@/lib/types'
import {
  SHOPEE_CATEGORY_ATTRIBUTE_KEY,
  decodeShopeeCategorySelection,
  formatShopeeCategorySelection,
} from '@/lib/shopee-categories'

type WorkbenchFilter = 'all' | ListingStatus | 'image_failed'

const AUTO_REFRESH_INTERVAL_MS = 45 * 1000
const COPIES_PER_PAGE = 12

const LISTING_STATUS_OPTIONS: Array<{ value: ListingStatus; zh: string; en: string; tone: string }> = [
  { value: 'not_listed', zh: '未上品', en: 'Not listed', tone: 'bg-slate-100 text-slate-700' },
  { value: 'listed', zh: '已上品', en: 'Listed', tone: 'bg-emerald-50 text-emerald-700' },
  { value: 'needs_edit', zh: '需修改', en: 'Needs edit', tone: 'bg-amber-50 text-amber-700' },
  { value: 'paused', zh: '暂停', en: 'Paused', tone: 'bg-zinc-100 text-zinc-700' },
  { value: 'done', zh: '已完成', en: 'Done', tone: 'bg-blue-50 text-blue-700' },
]

const FILTERS: Array<{ value: WorkbenchFilter; zh: string; en: string }> = [
  { value: 'all', zh: '全部', en: 'All' },
  { value: 'not_listed', zh: '未上品', en: 'Not listed' },
  { value: 'listed', zh: '已上品', en: 'Listed' },
  { value: 'needs_edit', zh: '需修改', en: 'Needs edit' },
  { value: 'image_failed', zh: '图片失败', en: 'Image failed' },
]

const REGENERATION_PRESETS = [
  { zh: '更清晰', en: 'Sharper' },
  { zh: '更像主图', en: 'More like main image' },
  { zh: '不要改包装', en: 'Keep packaging unchanged' },
  { zh: '背景更干净', en: 'Cleaner background' },
]

function statusMeta(status: string | null | undefined, language: UiLanguage) {
  const item = LISTING_STATUS_OPTIONS.find((option) => option.value === status) || LISTING_STATUS_OPTIONS[0]
  return {
    value: item.value,
    label: pickText(language, { zh: item.zh, en: item.en }),
    tone: item.tone,
  }
}

function imageStatusText(image: ProductCopyImage, language: UiLanguage) {
  if (image.pending_storage_path) return pickText(language, { zh: '待确认新图', en: 'Pending review' })
  if (image.status === 'completed') return pickText(language, { zh: '已完成', en: 'Completed' })
  if (image.status === 'generating') return pickText(language, { zh: '生成中', en: 'Generating' })
  if (image.status === 'queued') return pickText(language, { zh: '排队中', en: 'Queued' })
  if (image.status === 'failed') return pickText(language, { zh: '失败', en: 'Failed' })
  return pickText(language, { zh: '需检查', en: 'Needs review' })
}

function imageDoneCount(images: ProductCopyImage[]) {
  return images.filter((image) => image.status === 'completed' || Boolean(image.pending_storage_path)).length
}

function appendPreset(current: string, preset: string) {
  if (!current.trim()) return preset
  if (current.includes(preset)) return current
  return `${current.trim()}，${preset}`
}

function getQualityReport(copy: ProductCopy) {
  const report = (copy.quality_report || {}) as {
    issues?: Array<{ label: string; message: string; severity?: string }>
  }

  return {
    issues: Array.isArray(report.issues) ? report.issues : [],
  }
}

export default function ProductOutputsPage() {
  const router = useRouter()
  const { language: uiLanguage } = useUiLanguage()
  const [loading, setLoading] = useState(true)
  const [copies, setCopies] = useState<ProductCopy[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [regenerationNotes, setRegenerationNotes] = useState<Record<string, string>>({})
  const [sku, setSku] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [language, setLanguage] = useState('')
  const [date, setDate] = useState('')
  const [shopeeFilter, setShopeeFilter] = useState('')
  const [filter, setFilter] = useState<WorkbenchFilter>('all')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [savingCopyId, setSavingCopyId] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkStoreName, setBulkStoreName] = useState('')
  const [copyPage, setCopyPage] = useState(1)
  const [copyTotal, setCopyTotal] = useState(0)
  const [copyTotalPages, setCopyTotalPages] = useState(1)
  const [failedImageCopyIds, setFailedImageCopyIds] = useState<string[]>([])
  const text = {
    loading: pickText(uiLanguage, { zh: '加载中...', en: 'Loading...' }),
    retrying: pickText(uiLanguage, { zh: '正在重试...', en: 'Retrying...' }),
    heroEyebrow: pickText(uiLanguage, { zh: '副本输出工作台', en: 'Generated listings workbench' }),
    heroTitle: pickText(uiLanguage, { zh: '商品副本输出工作台', en: 'Product outputs' }),
    heroDescription: pickText(uiLanguage, {
      zh: '这里直接管理副本、图片、Shopee 类目和上品进度。单张图片重生会先生成待确认新图，员工确认后才替换旧图。',
      en: 'Manage generated copies, images, Shopee categories, and listing progress in one place. Single-image regeneration creates a review candidate before replacing the current image.',
    }),
    retryFailedImages: (count: number) => pickText(uiLanguage, {
      zh: `批量重试失败图片 (${count})`,
      en: `Retry failed images (${count})`,
    }),
    skuPlaceholder: pickText(uiLanguage, { zh: '请输入 SKU', en: 'Search SKU' }),
    category: pickText(uiLanguage, { zh: '类目', en: 'Category' }),
    allCategories: pickText(uiLanguage, { zh: '全部类目', en: 'All categories' }),
    language: pickText(uiLanguage, { zh: '语言', en: 'Language' }),
    allLanguages: pickText(uiLanguage, { zh: '全部语言', en: 'All languages' }),
    createdDate: pickText(uiLanguage, { zh: '生成日期', en: 'Created date' }),
    shopeeCategory: pickText(uiLanguage, { zh: 'Shopee 类目', en: 'Shopee category' }),
    shopeePlaceholder: pickText(uiLanguage, { zh: '输入类目路径或叶类目', en: 'Path or leaf category' }),
    filter: pickText(uiLanguage, { zh: '筛选', en: 'Filter' }),
    batchActions: pickText(uiLanguage, { zh: '批量操作', en: 'Batch actions' }),
    batchSummary: (selectedCount: number, visibleCount: number) => pickText(uiLanguage, {
      zh: `已选择 ${selectedCount} 个副本；当前筛选显示 ${visibleCount} 个。可以批量标记上品、设置店铺、重试失败图片或导出给员工上架。`,
      en: `${selectedCount} selected · ${visibleCount} match the current filters. Batch actions can mark items as listed, set store names, retry failed images, or export rows.`,
    }),
    selectPage: pickText(uiLanguage, { zh: '选择当前页', en: 'Select page' }),
    clearSelection: pickText(uiLanguage, { zh: '清空选择', en: 'Clear selection' }),
    bulkStorePlaceholder: pickText(uiLanguage, { zh: '店铺名，例如：Shopee MY 店铺 A', en: 'Store name, for example: Shopee MY Store A' }),
    markListed: pickText(uiLanguage, { zh: '标记已上品', en: 'Mark listed' }),
    setStore: pickText(uiLanguage, { zh: '设置店铺', en: 'Set store' }),
    retryFailedBatch: pickText(uiLanguage, { zh: '批量重试失败图片', en: 'Retry failed images' }),
    exportSelected: pickText(uiLanguage, { zh: '导出所选', en: 'Export selected' }),
    exportFiltered: pickText(uiLanguage, { zh: '导出当前筛选', en: 'Export page' }),
    emptyTitle: pickText(uiLanguage, { zh: '暂无符合条件的商品副本', en: 'No copies match the current filters.' }),
    emptyDescription: pickText(uiLanguage, { zh: '可以调整筛选条件，或回到商品页生成新的副本。', en: 'Adjust the filters or generate new copies from the products page.' }),
    unlinkedCategory: pickText(uiLanguage, { zh: '未关联类目', en: 'No category linked' }),
    notTagged: pickText(uiLanguage, { zh: '未标注', en: 'Not tagged' }),
    imageCount: (done: number, total: number) => pickText(uiLanguage, {
      zh: `${done}/${total} 图`,
      en: `${done}/${total} images`,
    }),
    selectSku: (sku: string) => pickText(uiLanguage, { zh: `选择 ${sku}`, en: `Select ${sku}` }),
    pageSummary: (count: number, page: number, totalPages: number) => pickText(uiLanguage, {
      zh: `共 ${count} 个副本，当前第 ${page} / ${totalPages} 页`,
      en: `${count} copies total · page ${page} / ${totalPages}`,
    }),
    saving: pickText(uiLanguage, { zh: '保存中...', en: 'Saving...' }),
    operator: (email: string) => pickText(uiLanguage, { zh: `操作者：${email}`, en: `Operator: ${email}` }),
    unrecorded: pickText(uiLanguage, { zh: '未记录', en: 'Not recorded' }),
    openDetails: pickText(uiLanguage, { zh: '打开详情 →', en: 'Open details →' }),
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login')
      else setLoading(false)
    })
  }, [router])

  const signImageUrls = useCallback(async (rows: ProductCopy[]) => {
    const paths = Array.from(new Set(rows.flatMap((copy) =>
      (copy.product_copy_images || []).flatMap((image) => [
        image.output_storage_path,
        image.pending_storage_path,
        image.previous_storage_path,
      ].filter(Boolean) as string[])
    )))

    const urls = await signStorageUrls('outputs', paths)
    setImageUrls((previous) => ({ ...previous, ...urls }))
  }, [])

  const fetchCategories = useCallback(async () => {
    const res = await apiFetch('/api/categories')
    if (res.ok) setCategories(await res.json())
  }, [])

  const fetchCopies = useCallback(async () => {
    setError(null)
    const params = new URLSearchParams()
    params.set('page', String(copyPage))
    params.set('limit', String(COPIES_PER_PAGE))
    if (sku) params.set('sku', sku)
    if (categoryId) params.set('category_id', categoryId)
    if (language) params.set('language', language)
    if (date) params.set('date', date)
    params.set('listing_filter', filter)
    if (shopeeFilter.trim()) params.set('shopee_search', shopeeFilter.trim())
    const res = await apiFetch(`/api/product-copies?${params.toString()}`)
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '输出结果加载失败')
      return
    }
    const rows = (Array.isArray(data?.data) ? data.data : []) as ProductCopy[]
    setCopies(rows)
    setCopyTotal(Number(data?.total || rows.length || 0))
    setCopyTotalPages(Math.max(1, Number(data?.totalPages || 1)))
    setFailedImageCopyIds(Array.isArray(data?.failedCopyIds) ? data.failedCopyIds : [])
    setSelectedIds((previous) => previous.filter((id) => rows.some((row) => row.id === id)))
  }, [categoryId, copyPage, date, filter, language, shopeeFilter, sku])

  const updateCopy = async (copyId: string, patch: Partial<ProductCopy>) => {
    setSavingCopyId(copyId)
    setError(null)
    const res = await apiFetch(`/api/product-copies/${copyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '保存失败')
    } else {
      setCopies((previous) => previous.map((copy) => copy.id === copyId ? { ...copy, ...data } : copy))
    }
    setSavingCopyId(null)
  }

  const batchUpdateCopies = async (patch: Record<string, unknown>, key: string) => {
    if (selectedIds.length === 0) {
      setError('请先选择要批量处理的副本')
      return
    }
    setBusyKey(key)
    setError(null)
    setNotice(null)
    const res = await apiFetch('/api/product-copies/batch', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selectedIds, ...patch }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '批量操作失败')
    } else {
      setNotice(`已批量更新 ${data.updated || 0} 个副本。`)
      await fetchCopies()
    }
    setBusyKey(null)
  }

  const exportCopies = async (selectedOnly = false) => {
    setBusyKey(selectedOnly ? 'export-selected' : 'export-all')
    setError(null)
    const params = new URLSearchParams()
    if (selectedOnly) {
      if (selectedIds.length === 0) {
        setError('请先选择要导出的副本')
        setBusyKey(null)
        return
      }
      params.set('ids', selectedIds.join(','))
    } else {
      if (filter === 'image_failed' || shopeeFilter.trim()) {
        params.set('ids', visibleIds.join(','))
      } else {
        if (sku) params.set('sku', sku)
        if (categoryId) params.set('category_id', categoryId)
        if (language) params.set('language', language)
        if (date) params.set('date', date)
        if (filter !== 'all') params.set('listing_status', filter)
      }
    }

    const res = await apiFetch(`/api/product-copies/export?${params.toString()}`)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error || '导出失败')
      setBusyKey(null)
      return
    }

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `product-copies-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setBusyKey(null)
  }

  const retryImages = async (
    payload: { image_ids?: string[]; copy_ids?: string[]; failed_only?: boolean; regeneration_note?: string },
    key: string
  ) => {
    setBusyKey(key)
    setError(null)
    setNotice(null)
    const res = await apiFetch('/api/product-copy-images/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '图片重试失败')
    } else {
      setNotice(`已重新排队 ${data.queued || 0} 张图片。单张重生完成后会显示为“待确认新图”。`)
      await fetchCopies()
    }
    setBusyKey(null)
  }

  const confirmPendingImage = async (imageId: string, action: 'accept' | 'discard') => {
    setBusyKey(`${action}-${imageId}`)
    setError(null)
    setNotice(null)
    const res = await apiFetch('/api/product-copy-images/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_id: imageId, action }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '确认图片失败')
    } else {
      setNotice(action === 'accept' ? '已保留新图。' : '已恢复旧图。')
      await fetchCopies()
    }
    setBusyKey(null)
  }

  useEffect(() => {
    if (!loading) {
      fetchCategories()
      fetchCopies()
    }
  }, [loading, fetchCategories, fetchCopies])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const visibleIds = useMemo(() => copies.map((copy) => copy.id), [copies])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id))

  useEffect(() => {
    setCopyPage(1)
  }, [categoryId, date, filter, language, shopeeFilter, sku])

  useEffect(() => {
    if (copyPage > copyTotalPages) {
      setCopyPage(copyTotalPages)
    }
  }, [copyPage, copyTotalPages])

  useEffect(() => {
    let cancelled = false

    async function loadPageImageUrls() {
      try {
        await signImageUrls(copies)
      } catch (err) {
        if (!cancelled) {
          setError((current) => current || (err instanceof Error ? err.message : '鍥剧墖鍔犺浇澶辫触'))
        }
      }
    }

    void loadPageImageUrls()

    return () => {
      cancelled = true
    }
  }, [copies, signImageUrls])

  useEffect(() => {
    if (loading) return

    const handleWindowFocus = () => {
      void fetchCopies()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchCopies()
      }
    }

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const intervalId = window.setInterval(() => {
      void fetchCopies()
    }, AUTO_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchCopies, loading])

  useEffect(() => {
    if (loading) return

    return subscribeToTableChanges(
      'product-outputs-page-realtime',
      [
        { table: 'product_copies' },
        { table: 'product_copy_images' },
        { table: 'products' },
      ],
      () => {
        void fetchCopies()
      },
      { debounceMs: 500 }
    )
  }, [fetchCopies, loading])

  const toggleCopySelection = (copyId: string) => {
    setSelectedIds((previous) => (
      previous.includes(copyId)
        ? previous.filter((id) => id !== copyId)
        : [...previous, copyId]
    ))
  }

  const toggleVisibleSelection = () => {
    setSelectedIds((previous) => {
      if (allVisibleSelected) return previous.filter((id) => !visibleIds.includes(id))
      return Array.from(new Set([...previous, ...visibleIds]))
    })
  }

  if (loading) {
    return <div className="app-shell flex min-h-screen items-center justify-center text-sm text-slate-500">{text.loading}</div>
  }

  return (
    <div className="app-shell min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-[1700px] px-4 py-6 sm:px-6">
        <div className="hero-panel mb-5 flex flex-col gap-4 rounded-[1.75rem] p-5 sm:p-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="hero-kicker text-sm font-semibold uppercase">{text.heroEyebrow}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{text.heroTitle}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
              {text.heroDescription}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => retryImages({ copy_ids: failedImageCopyIds, failed_only: true }, 'bulk-failed')}
              disabled={failedImageCopyIds.length === 0 || busyKey === 'bulk-failed'}
              className="rounded-xl bg-red-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-red-300 disabled:bg-slate-300"
            >
              {busyKey === 'bulk-failed' ? text.retrying : text.retryFailedImages(failedImageCopyIds.length)}
            </button>
          </div>
        </div>

        <section className="glass-surface mb-4 grid gap-3 rounded-[1.25rem] p-4 xl:grid-cols-[1fr_1fr_1fr_1fr_1.15fr_auto] xl:items-end">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">SKU</span>
            <input value={sku} onChange={(event) => setSku(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder={text.skuPlaceholder} />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">{text.category}</span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
              <option value="">{text.allCategories}</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name_zh}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">{text.language}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
              <option value="">{text.allLanguages}</option>
              {PRODUCT_LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">{text.createdDate}</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">{text.shopeeCategory}</span>
            <input
              value={shopeeFilter}
              onChange={(event) => setShopeeFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              placeholder={text.shopeePlaceholder}
            />
          </label>
          <button onClick={fetchCopies} className="rounded-xl bg-slate-950 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-slate-800">
            {text.filter}
          </button>
        </section>

        <section className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              onClick={() => setFilter(item.value)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${filter === item.value ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/15' : 'bg-white/80 text-slate-600 ring-1 ring-slate-200 hover:-translate-y-0.5 hover:bg-white'}`}
            >
              {pickText(uiLanguage, { zh: item.zh, en: item.en })}
            </button>
          ))}
        </section>

        <section className="glass-surface mb-4 rounded-[1.25rem] p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-950">{text.batchActions}</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {text.batchSummary(selectedIds.length, visibleIds.length)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleVisibleSelection}
                disabled={visibleIds.length === 0}
                className="rounded-xl border border-slate-300 bg-white/85 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-white disabled:text-slate-300"
              >
                {allVisibleSelected ? text.clearSelection : text.selectPage}
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                disabled={selectedIds.length === 0}
                className="rounded-xl border border-slate-300 bg-white/85 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-white disabled:text-slate-300"
              >
                {text.clearSelection}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_auto_auto_auto_auto_auto] xl:items-center">
            <input
              value={bulkStoreName}
              onChange={(event) => setBulkStoreName(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white/90 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              placeholder={text.bulkStorePlaceholder}
            />
            <button
              type="button"
              onClick={() => batchUpdateCopies({ listing_status: 'listed' }, 'batch-listed')}
              disabled={selectedIds.length === 0 || busyKey === 'batch-listed'}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-500/15 transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:bg-slate-300"
            >
              {text.markListed}
            </button>
            <button
              type="button"
              onClick={() => batchUpdateCopies({ store_name: bulkStoreName }, 'batch-store')}
              disabled={selectedIds.length === 0 || !bulkStoreName.trim() || busyKey === 'batch-store'}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/15 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:bg-slate-300"
            >
              {text.setStore}
            </button>
            <button
              type="button"
              onClick={() => retryImages({ copy_ids: selectedIds.length > 0 ? selectedIds : failedImageCopyIds, failed_only: true }, 'batch-selected-failed')}
              disabled={(selectedIds.length === 0 && failedImageCopyIds.length === 0) || busyKey === 'batch-selected-failed'}
              className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-red-500/15 transition hover:-translate-y-0.5 hover:bg-red-700 disabled:bg-slate-300"
            >
              {text.retryFailedBatch}
            </button>
            <button
              type="button"
              onClick={() => exportCopies(true)}
              disabled={selectedIds.length === 0 || busyKey === 'export-selected'}
              className="rounded-xl border border-slate-300 bg-white/85 px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-white disabled:text-slate-300"
            >
              {text.exportSelected}
            </button>
            <button
              type="button"
              onClick={() => exportCopies(false)}
              disabled={copies.length === 0 || busyKey === 'export-all'}
              className="rounded-xl border border-slate-300 bg-white/85 px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-white disabled:text-slate-300"
            >
              {text.exportFiltered}
            </button>
          </div>
        </section>

        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 shadow-sm">{error}</div>}
        {notice && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700 shadow-sm">{notice}</div>}

        {copies.length === 0 ? (
          <div className="glass-surface rounded-[1.25rem] p-12 text-center">
            <h2 className="text-xl font-semibold text-slate-950">{text.emptyTitle}</h2>
            <p className="mt-2 text-sm text-slate-500">{text.emptyDescription}</p>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {copies.map((copy) => {
              const product = copy.products
              const category = product?.categories
              const images = (copy.product_copy_images || []).sort((a, b) => a.prompt_number - b.prompt_number)
              const completedImages = imageDoneCount(images)
              const failedImages = images.filter((image) => image.status === 'failed')
              const shopeeCategory = formatShopeeCategorySelection(
                decodeShopeeCategorySelection(product?.attributes?.[SHOPEE_CATEGORY_ATTRIBUTE_KEY])
              )
              const listingStatus = statusMeta(copy.listing_status, uiLanguage)
              const qualityReport = getQualityReport(copy)
              const qualityIssues = qualityReport.issues
              const cleanTitle = sanitizeListingText(copy.generated_title || product?.source_title)
              const cleanDescription = sanitizeListingText(copy.generated_description || product?.source_description)

              return (
                <article key={copy.id} className="glass-surface soft-lift rounded-[1.25rem] p-4 transition-all hover:border-blue-300">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(copy.id)}
                          onChange={() => toggleCopySelection(copy.id)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          aria-label={text.selectSku(copy.sku)}
                        />
                        <div className="font-mono text-xl font-semibold text-slate-950">{copy.sku}</div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{copy.language_label}{copy.copy_index}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${listingStatus.tone}`}>{listingStatus.label}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{text.imageCount(completedImages, images.length)}</span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-400">{new Date(copy.created_at).toLocaleString()}</div>
                  </div>

                  <div className="mt-3 text-xs text-slate-500">{category ? `${category.icon} ${category.name_zh}` : text.unlinkedCategory}</div>
                  <div className="mt-2 rounded-xl bg-orange-50 px-3 py-2 text-xs font-semibold leading-5 text-orange-700 ring-1 ring-orange-100">
                    {text.shopeeCategory}：{shopeeCategory || text.notTagged}
                  </div>

                  <h2 className="mt-3 line-clamp-2 text-sm font-semibold text-slate-900">
                    {cleanTitle || pickText(uiLanguage, { zh: '标题待生成', en: 'Title pending' })}
                  </h2>
                  <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm leading-6 text-slate-500">
                    {cleanDescription || pickText(uiLanguage, { zh: '描述待生成', en: 'Description pending' })}
                  </p>

                  {qualityIssues.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                      <div className="font-semibold">{pickText(uiLanguage, { zh: '质量检查提示', en: 'Quality checks' })}</div>
                      {qualityIssues.slice(0, 4).map((item) => <div key={`${copy.id}-${item.label}`}>• {item.label}：{item.message}</div>)}
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-500">{pickText(uiLanguage, { zh: '上品状态', en: 'Listing status' })}</span>
                      <select
                        value={copy.listing_status || 'not_listed'}
                        onChange={(event) => updateCopy(copy.id, { listing_status: event.target.value as ListingStatus })}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                      >
                        {LISTING_STATUS_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {pickText(uiLanguage, { zh: item.zh, en: item.en })}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-500">{pickText(uiLanguage, { zh: '店铺名', en: 'Store name' })}</span>
                      <input
                        defaultValue={copy.store_name || ''}
                        onBlur={(event) => {
                          if (event.currentTarget.value !== (copy.store_name || '')) updateCopy(copy.id, { store_name: event.currentTarget.value })
                        }}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                        placeholder={pickText(uiLanguage, { zh: '例如：Shopee MY 店铺 A', en: 'For example: Shopee MY Store A' })}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-500">{pickText(uiLanguage, { zh: '上品时间', en: 'Listed time' })}</span>
                      <input
                        type="datetime-local"
                        defaultValue={copy.listed_at ? new Date(copy.listed_at).toISOString().slice(0, 16) : ''}
                        onBlur={(event) => updateCopy(copy.id, { listed_at: event.currentTarget.value ? new Date(event.currentTarget.value).toISOString() : null })}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                      />
                    </label>
                    <button
                      onClick={() => updateCopy(copy.id, { listing_status: 'listed' })}
                      className="self-end rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/15 hover:bg-emerald-700"
                    >
                      {pickText(uiLanguage, { zh: '快速标记已上品', en: 'Quick mark as listed' })}
                    </button>
                    <label className="block md:col-span-2">
                      <span className="mb-1 block text-xs font-semibold text-slate-500">{pickText(uiLanguage, { zh: '员工备注', en: 'Operator notes' })}</span>
                      <textarea
                        rows={3}
                        defaultValue={copy.operator_note || copy.staff_note || ''}
                        onBlur={(event) => {
                          const current = copy.operator_note || copy.staff_note || ''
                          if (event.currentTarget.value !== current) updateCopy(copy.id, { operator_note: event.currentTarget.value, staff_note: event.currentTarget.value })
                        }}
                        placeholder={pickText(uiLanguage, {
                          zh: '例如：已上到店铺A / 标题需要改短 / 图片3重生后再上架',
                          en: 'For example: Listed to Store A / shorten the title / relist after image 3 is regenerated',
                        })}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none focus:border-blue-500"
                      />
                    </label>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/70 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">{pickText(uiLanguage, { zh: '图片任务', en: 'Image tasks' })}</div>
                      <button
                        onClick={() => retryImages({ copy_ids: [copy.id], failed_only: true }, `copy-${copy.id}`)}
                        disabled={failedImages.length === 0 || busyKey === `copy-${copy.id}`}
                        className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:border-slate-200 disabled:text-slate-300"
                      >
                        {pickText(uiLanguage, { zh: '重试失败图片', en: 'Retry failed images' })}
                      </button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {images.map((image) => {
                        const note = regenerationNotes[image.id] || ''
                        return (
                          <div key={image.id} className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-700">{image.prompt_number}. {image.prompt_role}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${image.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : image.status === 'failed' ? 'bg-red-50 text-red-700' : image.pending_storage_path ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{imageStatusText(image, uiLanguage)}</span>
                            </div>

                            {(image.output_storage_path || image.pending_storage_path) && (
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <div>
                                  <div className="mb-1 text-[11px] font-semibold text-slate-500">{pickText(uiLanguage, { zh: '当前图', en: 'Current image' })}</div>
                                  <div className="aspect-square overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
                                    {image.output_storage_path ? (
                                      <StorageImage
                                        bucket="outputs"
                                        storagePath={image.output_storage_path}
                                        initialSrc={imageUrls[image.output_storage_path]}
                                        alt={pickText(uiLanguage, { zh: '\u5f53\u524d\u56fe', en: 'Current image' })}
                                        fill
                                        className="h-full w-full object-cover"
                                      />
                                    ) : <div className="flex h-full items-center justify-center text-xs text-slate-400">{pickText(uiLanguage, { zh: '??', en: 'Empty' })}</div>}
                                  </div>
                                </div>
                                <div>
                                  <div className="mb-1 text-[11px] font-semibold text-amber-600">{pickText(uiLanguage, { zh: '待确认新图', en: 'Pending image' })}</div>
                                  <div className="aspect-square overflow-hidden rounded-lg bg-white ring-1 ring-amber-200">
                                    {image.pending_storage_path ? (
                                      <StorageImage
                                        bucket="outputs"
                                        storagePath={image.pending_storage_path}
                                        initialSrc={imageUrls[image.pending_storage_path]}
                                        alt={pickText(uiLanguage, { zh: '\u5f85\u786e\u8ba4\u65b0\u56fe', en: 'Pending image' })}
                                        fill
                                        className="h-full w-full object-cover"
                                      />
                                    ) : <div className="flex h-full items-center justify-center text-xs text-slate-400">{pickText(uiLanguage, { zh: '\u672a\u751f\u6210', en: 'Not generated' })}</div>}
                                  </div>
                                </div>
                              </div>
                            )}

                            {image.pending_storage_path && (
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => confirmPendingImage(image.id, 'accept')}
                                  disabled={busyKey === `accept-${image.id}`}
                                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
                                >
                                  {pickText(uiLanguage, { zh: '保留新图', en: 'Keep new image' })}
                                </button>
                                <button
                                  onClick={() => confirmPendingImage(image.id, 'discard')}
                                  disabled={busyKey === `discard-${image.id}`}
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:text-slate-300"
                                >
                                  {pickText(uiLanguage, { zh: '恢复旧图', en: 'Restore old image' })}
                                </button>
                              </div>
                            )}

                            {image.error_message && <p className="mt-2 text-xs leading-5 text-red-600">{image.error_message}</p>}

                            <div className="mt-3 space-y-2">
                              <div className="flex flex-wrap gap-1.5">
                                {REGENERATION_PRESETS.map((preset) => (
                                  <button
                                    key={preset.zh}
                                    type="button"
                                    onClick={() => setRegenerationNotes((previous) => ({ ...previous, [image.id]: appendPreset(previous[image.id] || '', pickText(uiLanguage, preset)) }))}
                                    className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700"
                                  >
                                    {pickText(uiLanguage, preset)}
                                  </button>
                                ))}
                              </div>
                              <textarea
                                value={note}
                                onChange={(event) => setRegenerationNotes((previous) => ({ ...previous, [image.id]: event.target.value }))}
                                rows={2}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 outline-none focus:border-blue-500"
                                placeholder={pickText(uiLanguage, {
                                  zh: '本次重生要求，例如：背景更干净，不要改包装，产品文字更清晰',
                                  en: 'Regeneration notes, for example: cleaner background, keep packaging unchanged, make text sharper',
                                })}
                              />
                              <button
                                onClick={() => retryImages({ image_ids: [image.id], failed_only: false, regeneration_note: note }, `image-${image.id}`)}
                                disabled={busyKey === `image-${image.id}`}
                                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 disabled:text-slate-300"
                              >
                                {busyKey === `image-${image.id}` ? pickText(uiLanguage, { zh: '排队中...', en: 'Queued...' }) : pickText(uiLanguage, { zh: '只重生这一张', en: 'Regenerate only this image' })}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-400">
                      {savingCopyId === copy.id ? text.saving : text.operator(copy.operator_email || text.unrecorded)}
                    </span>
                    <Link href={`/product-outputs/${copy.id}`} className="text-sm font-semibold text-slate-900 hover:text-blue-700">
                      {text.openDetails}
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        )}
        {copies.length > 0 && (
          <PaginationBar
            page={copyPage}
            totalPages={copyTotalPages}
            onPageChange={setCopyPage}
            totalLabel={text.pageSummary(copyTotal, Math.min(copyPage, copyTotalPages), copyTotalPages)}
          />
        )}
      </main>
    </div>
  )
}
