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
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <section className="mb-5 border-b border-slate-200 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Product workflow</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950">商品素材生成工作台</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                每一行是一个商品。选择类目后会调用该类目的 6 条图片指令，并按 SKU、语言、副本序号生成商品图、标题和描述。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleUpgradePrompts}
                disabled={upgradingPrompts}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-50"
              >
                {upgradingPrompts ? '升级中...' : '升级类目 6 指令'}
              </button>
              <button onClick={openCreate} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                新增商品
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={importing}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-50"
              >
                {importing ? '导入中...' : '导入 Excel/CSV'}
              </button>
              <button
                onClick={handleGenerate}
                disabled={selected.size === 0 || generating}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? '创建中...' : `生成已选商品 (${selected.size})`}
              </button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <div className="border-l-2 border-slate-900 bg-white px-4 py-3 shadow-sm">
              <div className="text-2xl font-semibold">{products.length}</div>
              <div className="text-xs text-slate-500">商品</div>
            </div>
            <div className="border-l-2 border-emerald-600 bg-white px-4 py-3 shadow-sm">
              <div className="text-2xl font-semibold">{stats.imageCount}</div>
              <div className="text-xs text-slate-500">原始参考图</div>
            </div>
            <div className="border-l-2 border-blue-600 bg-white px-4 py-3 shadow-sm">
              <div className="text-2xl font-semibold">{stats.copyTarget}</div>
              <div className="text-xs text-slate-500">计划副本</div>
            </div>
            <div className="border-l-2 border-amber-500 bg-white px-4 py-3 shadow-sm">
              <div className="text-2xl font-semibold">{columns.length}</div>
              <div className="text-xs text-slate-500">全局属性列</div>
            </div>
          </div>
        </section>

        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {notice && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}

        <section className="mb-4 flex flex-col gap-3 border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newColumnName}
              onChange={(event) => setNewColumnName(event.target.value)}
              placeholder="新增全局属性，如品牌/材质/颜色"
              className="w-72 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
            <button onClick={handleAddColumn} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              添加属性列
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {columns.map((column) => (
              <button
                key={column.id}
                onClick={() => handleDeleteColumn(column)}
                className="rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-red-50 hover:text-red-600"
                title="点击删除属性列"
              >
                {column.name}
              </button>
            ))}
          </div>
        </section>

        <section className="overflow-hidden border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                    <td colSpan={10 + columns.length} className="px-4 py-14 text-center text-slate-500">
                      还没有商品。先新增一个 SKU，上传原图，再选择类目生成。
                    </td>
                  </tr>
                ) : products.map((product) => (
                  <tr key={product.id} className="align-top hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleSelected(product.id)} />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-900">{product.sku}</td>
                    <td className="px-3 py-3">
                      <div className="flex max-w-[180px] flex-wrap gap-1.5">
                        {(product.images || []).slice(0, 4).map((image) => (
                          <img
                            key={image.id}
                            src={imageUrls[image.storage_path]}
                            alt={image.display_name}
                            className="h-10 w-10 rounded border border-slate-200 object-cover"
                          />
                        ))}
                        <button onClick={() => handleUploadClick(product.id)} className="h-10 w-10 rounded border border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-50">
                          +
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
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{product.status}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(product)} className="text-sm font-medium text-blue-600 hover:text-blue-800">编辑</button>
                        <button onClick={() => handleDelete(product)} className="text-sm font-medium text-red-600 hover:text-red-800">删除</button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form onSubmit={handleSave} className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-md bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">{form.id ? '编辑商品' : '新增商品'}</h2>
            </div>
            <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">SKU（唯一）</span>
                <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">商品类目</span>
                <select required value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                  <option value="">请选择类目</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.icon} {category.name_zh}</option>
                  ))}
                </select>
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">原始参考图（可多选）</span>
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
                  className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
                    sourceDragActive
                      ? 'border-slate-950 bg-slate-100'
                      : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-white'
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
                  <div className="text-sm font-semibold text-slate-900">拖动图片到这里，或从本地选择</div>
                  <div className="mt-2 text-xs text-slate-500">支持一次选择多张 JPG / PNG / WebP 图片，会追加到当前商品的参考图列表。</div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      sourceInputRef.current?.click()
                    }}
                    className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
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
                      <span key={`${file.name}-${file.size}-${file.lastModified}`} className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
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
                <span className="mb-1 block text-sm font-medium text-slate-700">原始标题</span>
                <input value={form.source_title} onChange={(e) => setForm({ ...form, source_title: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">原始描述</span>
                <textarea rows={5} value={form.source_description} onChange={(e) => setForm({ ...form, source_description: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">卖点补充（可空）</span>
                <textarea rows={3} value={form.selling_points} onChange={(e) => setForm({ ...form, selling_points: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">每种语言副本数</span>
                <input type="number" min={1} max={20} value={form.copy_count} onChange={(e) => setForm({ ...form, copy_count: Number(e.target.value) })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <div>
                <span className="mb-2 block text-sm font-medium text-slate-700">副本语言</span>
                <div className="flex flex-wrap gap-2">
                  {PRODUCT_LANGUAGES.map((language) => (
                    <label key={language.code} className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-sm">
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
                  <span className="mb-1 block text-sm font-medium text-slate-700">{column.name}</span>
                  <input
                    value={form.attributes[column.name] || ''}
                    onChange={(e) => setForm({
                      ...form,
                      attributes: { ...form.attributes, [column.name]: e.target.value },
                    })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={closeForm} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                取消
              </button>
              <button disabled={saving} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? '保存中...' : '保存商品'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
