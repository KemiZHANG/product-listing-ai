'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { PRODUCT_LANGUAGES } from '@/lib/types'
import type { Category, Product, ProductAttributeColumn } from '@/lib/types'

type ProductForm = {
  id?: string
  sku: string
  category_id: string
  source_title: string
  source_description: string
  selling_points: string
  copy_count: number
  languages: string[]
  attributes: Record<string, string>
}

const emptyForm: ProductForm = {
  sku: '',
  category_id: '',
  source_title: '',
  source_description: '',
  selling_points: '',
  copy_count: 1,
  languages: ['en'],
  attributes: {},
}

function normalizeForm(product?: Product | null): ProductForm {
  if (!product) return emptyForm
  return {
    id: product.id,
    sku: product.sku,
    category_id: product.category_id || '',
    source_title: product.source_title || '',
    source_description: product.source_description || '',
    selling_points: product.selling_points || '',
    copy_count: product.copy_count || 1,
    languages: product.languages?.length ? product.languages : ['en'],
    attributes: product.attributes || {},
  }
}

const statCards = [
  { key: 'products', label: '商品', icon: '▣', tone: 'border-blue-500 bg-blue-50 text-blue-600' },
  { key: 'images', label: '原始参考图', icon: '▧', tone: 'border-emerald-500 bg-emerald-50 text-emerald-600' },
  { key: 'copies', label: '计划副本', icon: '✦', tone: 'border-violet-500 bg-violet-50 text-violet-600' },
  { key: 'columns', label: '全局属性列', icon: '▤', tone: 'border-orange-500 bg-orange-50 text-orange-600' },
]

export default function ProductDashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [columns, setColumns] = useState<ProductAttributeColumn[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [sourceFiles, setSourceFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [upgradingPrompts, setUpgradingPrompts] = useState(false)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const sourceInputRef = useRef<HTMLInputElement>(null)
  const [uploadingProductId, setUploadingProductId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [sourceDragActive, setSourceDragActive] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/login')
      } else {
        setLoading(false)
      }
    })
  }, [router])

  const fetchAll = useCallback(async () => {
    setFetching(true)
    setError(null)
    try {
      const [productsRes, categoriesRes, columnsRes] = await Promise.all([
        apiFetch('/api/products?limit=120'),
        apiFetch('/api/categories'),
        apiFetch('/api/product-attributes'),
      ])

      const [productsData, categoriesData, columnsData] = await Promise.all([
        productsRes.json().catch(() => null),
        categoriesRes.json().catch(() => null),
        columnsRes.json().catch(() => null),
      ])

      if (!productsRes.ok) throw new Error(productsData?.error || '商品加载失败')
      if (!categoriesRes.ok) throw new Error(categoriesData?.error || '类目加载失败')
      if (!columnsRes.ok) throw new Error(columnsData?.error || '属性列加载失败')

      setProducts(productsData || [])
      setCategories(categoriesData || [])
      setColumns(columnsData || [])

      const paths = (productsData || []).flatMap((product: Product) =>
        (product.images || []).slice(0, 4).map((image) => image.storage_path)
      )
      const signedUrls = await Promise.all(
        paths.map(async (path: string) => {
          const { data } = await supabase.storage.from('images').createSignedUrl(path, 60 * 60)
          return [path, data?.signedUrl || ''] as const
        })
      )
      setImageUrls(Object.fromEntries(signedUrls))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setFetching(false)
    }
  }, [])

  useEffect(() => {
    if (!loading) fetchAll()
  }, [loading, fetchAll])

  const stats = useMemo(() => {
    const imageCount = products.reduce((sum, product) => sum + (product.images?.length || 0), 0)
    const copyTarget = products.reduce((sum, product) => sum + product.copy_count * (product.languages?.length || 1), 0)
    return { imageCount, copyTarget }
  }, [products])

  const toggleSelected = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openCreate = () => {
    setForm(emptyForm)
    setSourceFiles([])
    setFormOpen(true)
  }

  const openEdit = (product: Product) => {
    setForm(normalizeForm(product))
    setSourceFiles([])
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setSourceFiles([])
  }

  const uploadProductImages = async (productId: string, files: File[]) => {
    if (files.length === 0) return

    const imageFormData = new FormData()
    files.forEach((file) => imageFormData.append('files', file))
    const uploadRes = await apiFetch(`/api/products/${productId}/images`, {
      method: 'POST',
      body: imageFormData,
    })
    const uploadData = await uploadRes.json().catch(() => null)
    if (!uploadRes.ok) {
      throw new Error(uploadData?.error || '上传原始参考图失败')
    }
  }

  const appendSourceFiles = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    setSourceFiles((previous) => {
      const next = [...previous]
      const seen = new Set(previous.map((file) => `${file.name}-${file.size}-${file.lastModified}`))
      for (const file of imageFiles) {
        const key = `${file.name}-${file.size}-${file.lastModified}`
        if (!seen.has(key)) {
          seen.add(key)
          next.push(file)
        }
      }
      return next
    })
  }

  const removeSourceFile = (fileToRemove: File) => {
    setSourceFiles((previous) => previous.filter((file) => file !== fileToRemove))
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...form,
        category_id: form.category_id || null,
        copy_count: Number(form.copy_count || 1),
      }
      const res = await apiFetch(form.id ? `/api/products/${form.id}` : '/api/products', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || '保存商品失败')

      await uploadProductImages(data.id, sourceFiles)
      closeForm()
      await fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存商品失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (product: Product) => {
    if (!window.confirm(`确定删除 SKU ${product.sku} 吗？`)) return
    setError(null)
    const res = await apiFetch(`/api/products/${product.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '删除商品失败')
      return
    }
    setSelected((previous) => {
      const next = new Set(previous)
      next.delete(product.id)
      return next
    })
    await fetchAll()
  }

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return
    setError(null)
    const res = await apiFetch('/api/product-attributes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newColumnName.trim() }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '新增属性失败')
      return
    }
    setNewColumnName('')
    await fetchAll()
  }

  const handleDeleteColumn = async (column: ProductAttributeColumn) => {
    if (!window.confirm(`确定删除属性列「${column.name}」吗？已填写的商品属性值不会自动清理。`)) return
    const res = await apiFetch(`/api/product-attributes/${column.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '删除属性失败')
      return
    }
    await fetchAll()
  }

  const handleUploadClick = (productId: string) => {
    setUploadingProductId(productId)
    fileInputRef.current?.click()
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || !uploadingProductId) return
    const formData = new FormData()
    Array.from(files).forEach((file) => formData.append('files', file))
    const res = await apiFetch(`/api/products/${uploadingProductId}/images`, {
      method: 'POST',
      body: formData,
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) setError(data?.error || '上传图片失败')
    event.target.value = ''
    setUploadingProductId(null)
    await fetchAll()
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImporting(true)
    setError(null)
    setNotice(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiFetch('/api/products/import', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || '导入失败')

      const warningText = data?.warnings?.length ? `；提醒：${data.warnings.join('；')}` : ''
      setNotice(`导入完成：新增 ${data.created} 个，更新 ${data.updated} 个，跳过 ${data.failed} 行，新增属性列 ${data.attributes_created} 个${warningText}`)
      await fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
    } finally {
      event.target.value = ''
      setImporting(false)
    }
  }

  const handleGenerate = async () => {
    if (selected.size === 0) return
    const productsWithoutImages = products.filter((product) => selected.has(product.id) && (product.images || []).length === 0)
    if (productsWithoutImages.length > 0) {
      setError(`这些 SKU 还没有上传原始参考图，不能生图：${productsWithoutImages.map((product) => product.sku).join('、')}`)
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const res = await apiFetch('/api/product-copies/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: Array.from(selected) }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || '创建生成任务失败')
      router.push('/product-outputs')
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建生成任务失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleUpgradePrompts = async () => {
    if (!window.confirm('这会把现有类目 prompts 迁移成 6 条：主图2条、场景2条、详情2条。确定继续吗？')) return
    setUpgradingPrompts(true)
    setError(null)
    try {
      const res = await apiFetch('/api/categories/upgrade-prompts', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || '升级类目指令失败')
      await fetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : '升级类目指令失败')
    } finally {
      setUpgradingPrompts(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(254,243,199,0.45),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_42%,#f1f5f9_100%)] text-slate-950">
      <Navbar />
      <main className="mx-auto max-w-[1600px] px-5 py-8 sm:px-8">
        <section className="mb-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Product workflow</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">商品素材生成工作台</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
                每一行是一个商品。选择类目后会调用该类目的 6 条图片指令，并按 SKU、语言、副本序号生成商品图、标题和描述。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleUpgradePrompts}
                disabled={upgradingPrompts}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
              >
                {upgradingPrompts ? '升级中...' : '升级类目 6 指令'}
              </button>
              <button onClick={openCreate} className="rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800">
                新增商品
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={importing}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
              >
                {importing ? '导入中...' : '导入 Excel/CSV'}
              </button>
              <button
                onClick={handleGenerate}
                disabled={selected.size === 0 || generating}
                className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {generating ? '创建中...' : `生成已选商品 (${selected.size})`}
              </button>
            </div>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {statCards.map((card) => {
              const value = card.key === 'products'
                ? products.length
                : card.key === 'images'
                  ? stats.imageCount
                  : card.key === 'copies'
                    ? stats.copyTarget
                    : columns.length
              return (
                <div key={card.key} className={`rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm ring-1 ring-white/70 ${card.tone.split(' ')[0]}`}>
                  <div className="flex items-center gap-5">
                    <span className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl ${card.tone.replace(card.tone.split(' ')[0], '')}`}>
                      {card.icon}
                    </span>
                    <div>
                      <div className="text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
                      <div className="mt-1 text-sm text-slate-500">{card.label}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 shadow-sm">{error}</div>}
        {notice && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700 shadow-sm">{notice}</div>}

        <section className="mb-5 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-base font-semibold text-slate-950">全局属性</span>
            <input
              value={newColumnName}
              onChange={(event) => setNewColumnName(event.target.value)}
              placeholder="新增全局属性，如品牌/材质/颜色"
              className="w-80 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:border-slate-900 focus:outline-none"
            />
            <button onClick={handleAddColumn} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">
              添加属性列
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {columns.map((column) => (
              <button
                key={column.id}
                onClick={() => handleDeleteColumn(column)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                title="点击删除属性列"
              >
                {column.name} ×
              </button>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-3"></th>
                  <th className="px-3 py-3">SKU</th>
                  <th className="px-3 py-3">原图</th>
                  <th className="min-w-[220px] px-3 py-3">原始标题</th>
                  <th className="min-w-[260px] px-3 py-3">原始描述</th>
                  <th className="px-3 py-3">类目</th>
                  <th className="px-3 py-3">副本/语言</th>
                  {columns.map((column) => <th key={column.id} className="px-3 py-3">{column.name}</th>)}
                  <th className="px-3 py-3">状态</th>
                  <th className="px-3 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={10 + columns.length} className="px-4 py-20 text-center">
                      <div className="mx-auto flex max-w-lg flex-col items-center">
                        <div className="relative mb-5 flex h-24 w-24 items-center justify-center rounded-3xl bg-blue-50 text-5xl shadow-inner">
                          📦
                          <span className="absolute -right-2 -top-2 text-xl">✨</span>
                        </div>
                        <h2 className="text-xl font-semibold text-slate-950">还没有商品。</h2>
                        <p className="mt-3 text-sm leading-6 text-slate-500">先新增一个 SKU，上传原始参考图，再选择类目生成商品素材。</p>
                        <div className="mt-6 flex flex-wrap justify-center gap-3">
                          <button type="button" onClick={openCreate} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800">
                            新增商品
                          </button>
                          <button type="button" onClick={() => importInputRef.current?.click()} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                            导入 Excel/CSV
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : products.map((product) => (
                  <tr key={product.id} className={`align-top transition-colors hover:bg-slate-50 ${(product.images || []).length === 0 ? 'bg-red-50/40' : ''}`}>
                    <td className="px-3 py-3">
                      <input className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" type="checkbox" checked={selected.has(product.id)} onChange={() => toggleSelected(product.id)} />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-900">{product.sku}</td>
                    <td className="px-3 py-3">
                      <div className="flex max-w-[180px] flex-wrap gap-1.5">
                        {(product.images || []).slice(0, 4).map((image) => (
                          <img
                            key={image.id}
                            src={imageUrls[image.storage_path]}
                            alt={image.display_name}
                            className="h-11 w-11 rounded-xl border border-slate-200 object-cover shadow-sm"
                          />
                        ))}
                        <button onClick={() => handleUploadClick(product.id)} className={`h-11 min-w-11 rounded-xl border border-dashed px-2 text-xs font-medium transition-colors ${(product.images || []).length === 0 ? 'border-red-300 bg-white text-red-600 hover:bg-red-50' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>
                          {(product.images || []).length === 0 ? '上传原图' : '+'}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="line-clamp-3 max-w-[260px] text-slate-700">{product.source_title || '未填写'}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="line-clamp-4 max-w-[320px] text-slate-500">{product.source_description || '未填写'}</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {product.categories ? `${product.categories.icon} ${product.categories.name_zh}` : <span className="text-red-500">未选择</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="whitespace-nowrap text-slate-700">{product.copy_count} 组</div>
                      <div className="mt-1 max-w-[180px] text-xs text-slate-500">
                        {(product.languages || []).map((code) => PRODUCT_LANGUAGES.find((item) => item.code === code)?.label || code).join('、')}
                      </div>
                    </td>
                    {columns.map((column) => (
                      <td key={column.id} className="px-3 py-3 text-slate-500">
                        <div className="line-clamp-2 min-w-[120px]">{product.attributes?.[column.name] || '-'}</div>
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <span className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                        (product.images || []).length === 0
                          ? 'bg-red-50 text-red-600 ring-1 ring-red-200'
                          : product.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                            : 'bg-slate-100 text-slate-600'
                      }`}>
                        {(product.images || []).length === 0 ? '缺少原图' : product.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(product)} className="rounded-lg px-2 py-1 text-sm font-semibold text-blue-600 hover:bg-blue-50 hover:text-blue-800">编辑</button>
                        <button onClick={() => handleDelete(product)} className="rounded-lg px-2 py-1 text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-800">删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {fetching && <p className="mt-3 text-xs text-slate-400">正在刷新商品数据...</p>}
      </main>

      <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleUpload} />
      <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <form onSubmit={handleSave} className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl ring-1 ring-slate-900/10">
            <div className="flex items-start justify-between border-b border-slate-200 px-7 py-5">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{form.id ? '编辑商品' : '新增商品'}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  填写商品原始资料，上传参考图后可生成多语言副本和 6 张商品图。
                </p>
              </div>
              <button type="button" onClick={closeForm} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="关闭">
                ×
              </button>
            </div>
            <div className="grid gap-5 px-7 py-6 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">SKU（唯一）<span className="text-red-500"> *</span></span>
                <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="请输入 SKU" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">商品类目<span className="text-red-500"> *</span></span>
                <select required value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
                  <option value="">请选择类目</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.icon} {category.name_zh}</option>
                  ))}
                </select>
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-slate-700">原始参考图（可多选）</span>
                <div
                  onClick={() => sourceInputRef.current?.click()}
                  onDragEnter={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setSourceDragActive(true)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setSourceDragActive(true)
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setSourceDragActive(false)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setSourceDragActive(false)
                    appendSourceFiles(Array.from(event.dataTransfer.files || []))
                  }}
                  className={`cursor-pointer rounded-2xl border-2 border-dashed px-5 py-9 text-center transition-colors ${
                    sourceDragActive
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-blue-300 bg-blue-50/40 hover:border-blue-400 hover:bg-white'
                  }`}
                >
                  <input
                    ref={sourceInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onClick={(event) => {
                      event.currentTarget.value = ''
                    }}
                    onChange={(event) => appendSourceFiles(Array.from(event.target.files || []))}
                    className="hidden"
                  />
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl shadow-sm ring-1 ring-blue-100">☁</div>
                  <div className="text-base font-semibold text-slate-900">拖动图片到这里，或从本地选择</div>
                  <div className="mt-2 text-xs text-slate-500">支持一次选择多张 JPG / PNG / WebP 图片，会追加到当前商品的参考图列表。</div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      sourceInputRef.current?.click()
                    }}
                    className="mt-4 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                  >
                    从本地选择图片
                  </button>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  这些图片会存到该 SKU 下，生成每个副本的 6 张图时都会作为参考图一起传入模型。多张原图可以同时参考。
                </p>
                {sourceFiles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sourceFiles.map((file) => (
                      <span key={`${file.name}-${file.size}-${file.lastModified}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
                        {file.name}
                        <button
                          type="button"
                          onClick={() => removeSourceFile(file)}
                          className="font-semibold text-slate-400 hover:text-red-600"
                          aria-label={`移除 ${file.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-slate-700">原始标题</span>
                <input value={form.source_title} onChange={(e) => setForm({ ...form, source_title: e.target.value })} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="请输入原始标题（建议 10-120 个字符）" />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-slate-700">原始描述</span>
                <textarea rows={5} value={form.source_description} onChange={(e) => setForm({ ...form, source_description: e.target.value })} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="请输入原始描述（建议 20-2000 个字符）" />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-slate-700">卖点补充（可空）</span>
                <textarea rows={3} value={form.selling_points} onChange={(e) => setForm({ ...form, selling_points: e.target.value })} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="请输入商品卖点、功能亮点或使用场景等补充信息" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">每种语言副本数</span>
                <input type="number" min={1} max={20} value={form.copy_count} onChange={(e) => setForm({ ...form, copy_count: Number(e.target.value) })} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50" />
              </label>
              <div>
                <span className="mb-2 block text-sm font-semibold text-slate-700">副本语言</span>
                <div className="flex flex-wrap gap-2">
                  {PRODUCT_LANGUAGES.map((language) => (
                    <label key={language.code} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                      <input
                        type="checkbox"
                        checked={form.languages.includes(language.code)}
                        onChange={() => {
                          const next = form.languages.includes(language.code)
                            ? form.languages.filter((code) => code !== language.code)
                            : [...form.languages, language.code]
                          setForm({ ...form, languages: next.length ? next : ['en'] })
                        }}
                      />
                      {language.label}
                    </label>
                  ))}
                </div>
              </div>
              {columns.map((column) => (
                <label key={column.id} className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">{column.name}</span>
                  <input
                    value={form.attributes[column.name] || ''}
                    onChange={(e) => setForm({
                      ...form,
                      attributes: { ...form.attributes, [column.name]: e.target.value },
                    })}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                  />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50/70 px-7 py-5">
              <button type="button" onClick={closeForm} className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                取消
              </button>
              <button disabled={saving} className="rounded-xl bg-slate-950 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800 disabled:bg-slate-400 disabled:shadow-none">
                {saving ? '保存中...' : '保存商品'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
