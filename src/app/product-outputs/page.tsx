'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { sanitizeListingText } from '@/lib/listing-text'
import { PRODUCT_LANGUAGES, type ListingStatus } from '@/lib/types'
import type { Category, ProductCopy, ProductCopyImage } from '@/lib/types'
import {
  SHOPEE_CATEGORY_ATTRIBUTE_KEY,
  decodeShopeeCategorySelection,
  formatShopeeCategorySelection,
} from '@/lib/shopee-categories'

type WorkbenchFilter = 'all' | ListingStatus | 'image_failed'

const LISTING_STATUS_OPTIONS: Array<{ value: ListingStatus; label: string; tone: string }> = [
  { value: 'not_listed', label: '未上品', tone: 'bg-slate-100 text-slate-700' },
  { value: 'listed', label: '已上品', tone: 'bg-emerald-50 text-emerald-700' },
  { value: 'needs_edit', label: '需修改', tone: 'bg-amber-50 text-amber-700' },
  { value: 'paused', label: '暂停', tone: 'bg-zinc-100 text-zinc-700' },
  { value: 'done', label: '已完成', tone: 'bg-blue-50 text-blue-700' },
]

const FILTERS: Array<{ value: WorkbenchFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'not_listed', label: '未上品' },
  { value: 'listed', label: '已上品' },
  { value: 'needs_edit', label: '需修改' },
  { value: 'image_failed', label: '图片失败' },
]

const REGENERATION_PRESETS = ['更清晰', '更像主图', '不要改包装', '背景更干净']

function statusMeta(status?: string | null) {
  return LISTING_STATUS_OPTIONS.find((item) => item.value === status) || LISTING_STATUS_OPTIONS[0]
}

function imageStatusText(image: ProductCopyImage) {
  if (image.pending_storage_path) return '待确认新图'
  if (image.status === 'completed') return '已完成'
  if (image.status === 'generating') return '生成中'
  if (image.status === 'queued') return '排队中'
  if (image.status === 'failed') return '失败'
  return '需检查'
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

    const signedPairs = await Promise.all(paths.map(async (path) => {
      const { data } = await supabase.storage.from('outputs').createSignedUrl(path, 60 * 60)
      return [path, data?.signedUrl || ''] as const
    }))
    setImageUrls(Object.fromEntries(signedPairs))
  }, [])

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
    const rows = Array.isArray(data) ? data : []
    setCopies(rows)
    setSelectedIds((previous) => previous.filter((id) => rows.some((row) => row.id === id)))
    await signImageUrls(rows)
  }, [sku, categoryId, language, date, signImageUrls])

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

  const filteredCopies = useMemo(() => {
    return copies.filter((copy) => {
      const images = copy.product_copy_images || []
      const shopeeCategory = formatShopeeCategorySelection(
        decodeShopeeCategorySelection(copy.products?.attributes?.[SHOPEE_CATEGORY_ATTRIBUTE_KEY])
      )
      if (shopeeFilter.trim() && !shopeeCategory.toLowerCase().includes(shopeeFilter.trim().toLowerCase())) {
        return false
      }
      const imageFailed = images.some((image) => image.status === 'failed')
      if (filter === 'all') return true
      if (filter === 'image_failed') return imageFailed
      return (copy.listing_status || 'not_listed') === filter
    })
  }, [copies, filter, shopeeFilter])

  const failedImageCopyIds = useMemo(() => {
    return copies
      .filter((copy) => (copy.product_copy_images || []).some((image) => image.status === 'failed'))
      .map((copy) => copy.id)
  }, [copies])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const visibleIds = useMemo(() => filteredCopies.map((copy) => copy.id), [filteredCopies])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id))

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
    return <div className="app-shell flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>
  }

  return (
    <div className="app-shell min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-[1700px] px-4 py-6 sm:px-6">
        <div className="hero-panel mb-5 flex flex-col gap-4 rounded-[1.75rem] p-5 sm:p-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="hero-kicker text-sm font-semibold uppercase">Generated listings workbench</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">商品副本输出工作台</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
              这里直接管理副本、图片、Shopee 类目和上品进度。单张图片重生会先生成待确认新图，员工确认后才替换旧图。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => retryImages({ copy_ids: failedImageCopyIds, failed_only: true }, 'bulk-failed')}
              disabled={failedImageCopyIds.length === 0 || busyKey === 'bulk-failed'}
              className="rounded-xl bg-red-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-red-300 disabled:bg-slate-300"
            >
              {busyKey === 'bulk-failed' ? '正在重试...' : `批量重试失败图片 (${failedImageCopyIds.length})`}
            </button>
          </div>
        </div>

        <section className="glass-surface mb-4 grid gap-3 rounded-[1.25rem] p-4 xl:grid-cols-[1fr_1fr_1fr_1fr_1.15fr_auto] xl:items-end">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">SKU</span>
            <input value={sku} onChange={(event) => setSku(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="请输入 SKU" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">类目</span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
              <option value="">全部类目</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name_zh}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">语言</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
              <option value="">全部语言</option>
              {PRODUCT_LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">生成日期</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">Shopee 类目</span>
            <input
              value={shopeeFilter}
              onChange={(event) => setShopeeFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              placeholder="输入类目路径或叶类目"
            />
          </label>
          <button onClick={fetchCopies} className="rounded-xl bg-slate-950 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-slate-800">
            筛选
          </button>
        </section>

        <section className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              onClick={() => setFilter(item.value)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${filter === item.value ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/15' : 'bg-white/80 text-slate-600 ring-1 ring-slate-200 hover:-translate-y-0.5 hover:bg-white'}`}
            >
              {item.label}
            </button>
          ))}
        </section>

        <section className="glass-surface mb-4 rounded-[1.25rem] p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-950">批量操作</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                已选择 {selectedIds.length} 个副本；当前筛选显示 {visibleIds.length} 个。可以批量标记上品、设置店铺、重试失败图片或导出给员工上架。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleVisibleSelection}
                disabled={visibleIds.length === 0}
                className="rounded-xl border border-slate-300 bg-white/85 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-white disabled:text-slate-300"
              >
                {allVisibleSelected ? '取消选择当前筛选' : '全选当前筛选'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                disabled={selectedIds.length === 0}
                className="rounded-xl border border-slate-300 bg-white/85 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-white disabled:text-slate-300"
              >
                清空选择
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_auto_auto_auto_auto_auto] xl:items-center">
            <input
              value={bulkStoreName}
              onChange={(event) => setBulkStoreName(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white/90 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              placeholder="批量设置店铺名，例如：Shopee MY 店铺 A"
            />
            <button
              type="button"
              onClick={() => batchUpdateCopies({ listing_status: 'listed' }, 'batch-listed')}
              disabled={selectedIds.length === 0 || busyKey === 'batch-listed'}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-500/15 transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:bg-slate-300"
            >
              批量标记已上品
            </button>
            <button
              type="button"
              onClick={() => batchUpdateCopies({ store_name: bulkStoreName }, 'batch-store')}
              disabled={selectedIds.length === 0 || !bulkStoreName.trim() || busyKey === 'batch-store'}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/15 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:bg-slate-300"
            >
              批量设置店铺
            </button>
            <button
              type="button"
              onClick={() => retryImages({ copy_ids: selectedIds.length > 0 ? selectedIds : failedImageCopyIds, failed_only: true }, 'batch-selected-failed')}
              disabled={(selectedIds.length === 0 && failedImageCopyIds.length === 0) || busyKey === 'batch-selected-failed'}
              className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-red-500/15 transition hover:-translate-y-0.5 hover:bg-red-700 disabled:bg-slate-300"
            >
              批量重试失败图片
            </button>
            <button
              type="button"
              onClick={() => exportCopies(true)}
              disabled={selectedIds.length === 0 || busyKey === 'export-selected'}
              className="rounded-xl border border-slate-300 bg-white/85 px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-white disabled:text-slate-300"
            >
              导出所选
            </button>
            <button
              type="button"
              onClick={() => exportCopies(false)}
              disabled={visibleIds.length === 0 || busyKey === 'export-all'}
              className="rounded-xl border border-slate-300 bg-white/85 px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-white disabled:text-slate-300"
            >
              导出当前筛选
            </button>
          </div>
        </section>

        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 shadow-sm">{error}</div>}
        {notice && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700 shadow-sm">{notice}</div>}

        {filteredCopies.length === 0 ? (
          <div className="glass-surface rounded-[1.25rem] p-12 text-center">
            <h2 className="text-xl font-semibold text-slate-950">暂无符合条件的商品副本</h2>
            <p className="mt-2 text-sm text-slate-500">可以调整筛选条件，或回到商品页生成新的副本。</p>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {filteredCopies.map((copy) => {
              const product = copy.products
              const category = product?.categories
              const images = (copy.product_copy_images || []).sort((a, b) => a.prompt_number - b.prompt_number)
              const completedImages = imageDoneCount(images)
              const failedImages = images.filter((image) => image.status === 'failed')
              const shopeeCategory = formatShopeeCategorySelection(
                decodeShopeeCategorySelection(product?.attributes?.[SHOPEE_CATEGORY_ATTRIBUTE_KEY])
              )
              const listingStatus = statusMeta(copy.listing_status)
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
                          aria-label={`选择 ${copy.sku}`}
                        />
                        <div className="font-mono text-xl font-semibold text-slate-950">{copy.sku}</div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{copy.language_label}{copy.copy_index}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${listingStatus.tone}`}>{listingStatus.label}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{completedImages}/{images.length} 图</span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-400">{new Date(copy.created_at).toLocaleString()}</div>
                  </div>

                  <div className="mt-3 text-xs text-slate-500">{category ? `${category.icon} ${category.name_zh}` : '未关联类目'}</div>
                  <div className="mt-2 rounded-xl bg-orange-50 px-3 py-2 text-xs font-semibold leading-5 text-orange-700 ring-1 ring-orange-100">
                    Shopee 类目：{shopeeCategory || '未标注'}
                  </div>

                  <h2 className="mt-3 line-clamp-2 text-sm font-semibold text-slate-900">{cleanTitle || '标题待生成'}</h2>
                  <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm leading-6 text-slate-500">{cleanDescription || '描述待生成'}</p>

                  {qualityIssues.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                      <div className="font-semibold">质量检查提示</div>
                      {qualityIssues.slice(0, 4).map((item) => <div key={`${copy.id}-${item.label}`}>• {item.label}：{item.message}</div>)}
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-500">上品状态</span>
                      <select
                        value={copy.listing_status || 'not_listed'}
                        onChange={(event) => updateCopy(copy.id, { listing_status: event.target.value as ListingStatus })}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                      >
                        {LISTING_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-500">店铺名</span>
                      <input
                        defaultValue={copy.store_name || ''}
                        onBlur={(event) => {
                          if (event.currentTarget.value !== (copy.store_name || '')) updateCopy(copy.id, { store_name: event.currentTarget.value })
                        }}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                        placeholder="例如：Shopee MY 店铺 A"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-500">上品时间</span>
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
                      快速标记已上品
                    </button>
                    <label className="block md:col-span-2">
                      <span className="mb-1 block text-xs font-semibold text-slate-500">员工备注</span>
                      <textarea
                        rows={3}
                        defaultValue={copy.operator_note || copy.staff_note || ''}
                        onBlur={(event) => {
                          const current = copy.operator_note || copy.staff_note || ''
                          if (event.currentTarget.value !== current) updateCopy(copy.id, { operator_note: event.currentTarget.value, staff_note: event.currentTarget.value })
                        }}
                        placeholder="例如：已上到店铺A / 标题需要改短 / 图片3重生后再上架"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none focus:border-blue-500"
                      />
                    </label>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/70 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">图片任务</div>
                      <button
                        onClick={() => retryImages({ copy_ids: [copy.id], failed_only: true }, `copy-${copy.id}`)}
                        disabled={failedImages.length === 0 || busyKey === `copy-${copy.id}`}
                        className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:border-slate-200 disabled:text-slate-300"
                      >
                        重试失败图片
                      </button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {images.map((image) => {
                        const note = regenerationNotes[image.id] || ''
                        return (
                          <div key={image.id} className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-700">{image.prompt_number}. {image.prompt_role}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${image.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : image.status === 'failed' ? 'bg-red-50 text-red-700' : image.pending_storage_path ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{imageStatusText(image)}</span>
                            </div>

                            {(image.output_storage_path || image.pending_storage_path) && (
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <div>
                                  <div className="mb-1 text-[11px] font-semibold text-slate-500">当前图</div>
                                  <div className="aspect-square overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
                                    {image.output_storage_path ? <img src={imageUrls[image.output_storage_path]} alt="当前图" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-slate-400">暂无</div>}
                                  </div>
                                </div>
                                <div>
                                  <div className="mb-1 text-[11px] font-semibold text-amber-600">待确认新图</div>
                                  <div className="aspect-square overflow-hidden rounded-lg bg-white ring-1 ring-amber-200">
                                    {image.pending_storage_path ? <img src={imageUrls[image.pending_storage_path]} alt="待确认新图" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-slate-400">未生成</div>}
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
                                  保留新图
                                </button>
                                <button
                                  onClick={() => confirmPendingImage(image.id, 'discard')}
                                  disabled={busyKey === `discard-${image.id}`}
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:text-slate-300"
                                >
                                  恢复旧图
                                </button>
                              </div>
                            )}

                            {image.error_message && <p className="mt-2 text-xs leading-5 text-red-600">{image.error_message}</p>}

                            <div className="mt-3 space-y-2">
                              <div className="flex flex-wrap gap-1.5">
                                {REGENERATION_PRESETS.map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => setRegenerationNotes((previous) => ({ ...previous, [image.id]: appendPreset(previous[image.id] || '', preset) }))}
                                    className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700"
                                  >
                                    {preset}
                                  </button>
                                ))}
                              </div>
                              <textarea
                                value={note}
                                onChange={(event) => setRegenerationNotes((previous) => ({ ...previous, [image.id]: event.target.value }))}
                                rows={2}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 outline-none focus:border-blue-500"
                                placeholder="本次重生要求，例如：背景更干净，不要改包装，产品文字更清晰"
                              />
                              <button
                                onClick={() => retryImages({ image_ids: [image.id], failed_only: false, regeneration_note: note }, `image-${image.id}`)}
                                disabled={busyKey === `image-${image.id}`}
                                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 disabled:text-slate-300"
                              >
                                {busyKey === `image-${image.id}` ? '排队中...' : '只重生这一张'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-400">{savingCopyId === copy.id ? '保存中...' : `操作者：${copy.operator_email || '未记录'}`}</span>
                    <Link href={`/product-outputs/${copy.id}`} className="text-sm font-semibold text-slate-900 hover:text-blue-700">
                      打开详情 →
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
