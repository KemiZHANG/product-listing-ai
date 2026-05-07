'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import PaginationBar from '@/components/PaginationBar'
import SignedImage from '@/components/SignedImage'
import { apiFetch } from '@/lib/api'
import { subscribeToTableChanges } from '@/lib/client-realtime'
import { supabase } from '@/lib/supabase'
import { getCategoryDisplayName, pickText, useUiLanguage } from '@/lib/ui-language'
import { signStorageUrls } from '@/lib/signed-storage'
import {
  COPY_IMAGE_PLAN_ATTRIBUTE_KEY,
  COPY_PLAN_ATTRIBUTE_KEY,
  DEFAULT_PRODUCT_IMAGE_ROLES,
  PRODUCT_IMAGE_ROLE_OPTIONS,
  PRODUCT_LANGUAGES,
  normalizeProductImageRole,
} from '@/lib/types'
import type { Category, Product, ProductAttributeColumn, ProductImageRole } from '@/lib/types'
import {
  SHOPEE_CATEGORY_ATTRIBUTE_KEY,
  SHOPEE_CATEGORY_TREE,
  decodeShopeeCategorySelection,
  encodeShopeeCategorySelection,
  formatShopeeCategorySelection,
} from '@/lib/shopee-categories'
import type { ShopeeCategoryNode, ShopeeCategorySelection } from '@/lib/shopee-categories'

const AUTO_REFRESH_INTERVAL_MS = 60 * 1000

type ProductForm = {
  id?: string
  sku: string
  category_id: string
  source_title: string
  source_description: string
  selling_points: string
  languageCopyCounts: Record<string, number>
  imageCopyPlan: ImageCopyPlanEntry[]
  shopeeCategory: ShopeeCategorySelection | null
  attributes: Record<string, string>
}

type ImageCopyPlanEntry = {
  key: string
  languageCode: string
  copyIndex: number
  imageRoles: ProductImageRole[]
}

const defaultLanguageCopyCounts = Object.fromEntries(
  PRODUCT_LANGUAGES.map((language) => [language.code, language.code === 'en' ? 1 : 0])
)

function imageCopyPlanKey(languageCode: string, copyIndex: number) {
  return `${languageCode}-${copyIndex}`
}

function sanitizeImageRoles(value: unknown, fallbackToDefault = true): ProductImageRole[] {
  const roles = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  const normalized = roles
    .map((role) => normalizeProductImageRole(String(role)))
    .filter(Boolean) as ProductImageRole[]
  const deduped = DEFAULT_PRODUCT_IMAGE_ROLES.filter((role) => normalized.includes(role))
  return deduped.length > 0 ? deduped : fallbackToDefault ? DEFAULT_PRODUCT_IMAGE_ROLES : []
}

function buildImageCopyPlan(
  counts: Record<string, number>,
  previousPlan: ImageCopyPlanEntry[] = []
): ImageCopyPlanEntry[] {
  const previousByKey = new Map(previousPlan.map((entry) => [entry.key, entry]))

  return PRODUCT_LANGUAGES.flatMap((language) => {
    const count = Math.min(Math.max(Math.floor(Number(counts[language.code] || 0)), 0), 20)
    return Array.from({ length: count }, (_, index) => {
      const copyIndex = index + 1
      const key = imageCopyPlanKey(language.code, copyIndex)
      const previous = previousByKey.get(key)
      return {
        key,
        languageCode: language.code,
        copyIndex,
        imageRoles: previous ? sanitizeImageRoles(previous.imageRoles, false) : DEFAULT_PRODUCT_IMAGE_ROLES,
      }
    })
  })
}

const emptyForm: ProductForm = {
  sku: '',
  category_id: '',
  source_title: '',
  source_description: '',
  selling_points: '',
  languageCopyCounts: defaultLanguageCopyCounts,
  imageCopyPlan: buildImageCopyPlan(defaultLanguageCopyCounts),
  shopeeCategory: null,
  attributes: {},
}

function parseLanguageCopyCounts(product?: Product | null) {
  const fallback = Object.fromEntries(PRODUCT_LANGUAGES.map((language) => [
    language.code,
    product?.languages?.includes(language.code) ? Math.max(1, Number(product.copy_count || 1)) : 0,
  ]))

  const rawPlan = product?.attributes?.[COPY_PLAN_ATTRIBUTE_KEY]
  if (typeof rawPlan === 'string') {
    try {
      const parsed = JSON.parse(rawPlan) as Record<string, unknown>
      const counts = Object.fromEntries(PRODUCT_LANGUAGES.map((language) => [
        language.code,
        Math.min(Math.max(Math.floor(Number(parsed[language.code] || 0)), 0), 20),
      ]))
      return Object.values(counts).some((count) => count > 0) ? counts : fallback
    } catch {
      return fallback
    }
  }

  return fallback
}

function parseImageCopyPlan(product?: Product | null) {
  const counts = parseLanguageCopyCounts(product)
  const rawPlan = product?.attributes?.[COPY_IMAGE_PLAN_ATTRIBUTE_KEY]

  if (typeof rawPlan === 'string') {
    try {
      const parsed = JSON.parse(rawPlan) as { copies?: Array<Record<string, unknown>> }
      const plan = (parsed.copies || [])
        .map((entry) => {
          const languageCode = String(entry.languageCode || '')
          const copyIndex = Math.max(1, Math.floor(Number(entry.copyIndex || 1)))
          return {
            key: imageCopyPlanKey(languageCode, copyIndex),
            languageCode,
            copyIndex,
            imageRoles: sanitizeImageRoles(entry.imageRoles, false),
          }
        })
        .filter((entry) => PRODUCT_LANGUAGES.some((language) => language.code === entry.languageCode))
      return buildImageCopyPlan(counts, plan)
    } catch {
      return buildImageCopyPlan(counts)
    }
  }

  return buildImageCopyPlan(counts)
}

function publicAttributes(attributes?: Record<string, string> | null) {
  const next = { ...(attributes || {}) }
  delete next[COPY_PLAN_ATTRIBUTE_KEY]
  delete next[COPY_IMAGE_PLAN_ATTRIBUTE_KEY]
  delete next[SHOPEE_CATEGORY_ATTRIBUTE_KEY]
  return next
}

function productShopeeCategory(product: Product) {
  return decodeShopeeCategorySelection(product.attributes?.[SHOPEE_CATEGORY_ATTRIBUTE_KEY])
}

function languageCopyTotal(product: Product) {
  const counts = parseLanguageCopyCounts(product)
  return Object.values(counts).reduce((sum, count) => sum + count, 0)
}

function languageCopySummary(product: Product) {
  const counts = parseLanguageCopyCounts(product)
  return PRODUCT_LANGUAGES
    .filter((language) => counts[language.code] > 0)
    .map((language) => `${language.label} ${counts[language.code]}`)
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
    languageCopyCounts: parseLanguageCopyCounts(product),
    imageCopyPlan: parseImageCopyPlan(product),
    shopeeCategory: decodeShopeeCategorySelection(product.attributes?.[SHOPEE_CATEGORY_ATTRIBUTE_KEY]),
    attributes: publicAttributes(product.attributes),
  }
}

function ShopeeCategoryPicker({
  value,
  onChange,
}: {
  value: ShopeeCategorySelection | null
  onChange: (selection: ShopeeCategorySelection | null) => void
}) {
  const [activePath, setActivePath] = useState<string[]>(value?.path || [])

  useEffect(() => {
    setActivePath(value?.path || [])
  }, [value])

  const columns: Array<{ nodes: ShopeeCategoryNode[]; level: number }> = []
  let nodes = SHOPEE_CATEGORY_TREE
  columns.push({ nodes, level: 0 })
  for (let index = 0; index < activePath.length; index += 1) {
    const node = nodes.find((item) => item.name === activePath[index])
    if (!node?.children?.length) break
    nodes = node.children
    columns.push({ nodes, level: index + 1 })
  }

  const selectedText = formatShopeeCategorySelection(value)

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="block text-sm font-semibold text-slate-700">Shopee 类目</span>
          <span className="mt-1 block text-xs text-slate-500">仅用于标注员工上品时应选择的 Shopee 叶类目，不参与 AI 生成。</span>
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            清空选择
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3">
        {columns.map((column) => (
          <div key={column.level} className="min-w-[220px] border-r border-slate-100 pr-3 last:border-r-0">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Level {column.level + 1}</div>
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {column.nodes.map((node) => {
                const isActive = activePath[column.level] === node.name
                const nextPath = [...activePath.slice(0, column.level), node.name]
                const isLeaf = !node.children?.length
                return (
                  <button
                    key={`${column.level}-${node.name}`}
                    type="button"
                    onClick={() => {
                      setActivePath(nextPath)
                      if (isLeaf) onChange({ path: nextPath, id: node.id })
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-red-50 text-red-600'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                    }`}
                  >
                    <span>{node.name}</span>
                    {isLeaf ? (
                      node.id ? <span className="text-xs text-slate-400">{node.id}</span> : null
                    ) : (
                      <span className="text-slate-400">›</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
        当前选择：<span className="font-semibold text-slate-950">{selectedText || '未选择'}</span>
      </div>
    </div>
  )
}

const statCards = [
  { key: 'products', label: '商品', icon: '▣', tone: 'border-blue-500 bg-blue-50 text-blue-600' },
  { key: 'images', label: '原始参考图', icon: '▧', tone: 'border-emerald-500 bg-emerald-50 text-emerald-600' },
  { key: 'copies', label: '计划副本', icon: '✦', tone: 'border-violet-500 bg-violet-50 text-violet-600' },
  { key: 'columns', label: '全局属性列', icon: '▤', tone: 'border-orange-500 bg-orange-50 text-orange-600' },
]

export default function ProductDashboardPage() {
  const router = useRouter()
  const { language } = useUiLanguage()
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
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const sourceInputRef = useRef<HTMLInputElement>(null)
  const [uploadingProductId, setUploadingProductId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [sourceDragActive, setSourceDragActive] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'missing_images' | 'generated' | 'pending'>('all')
  const [productPage, setProductPage] = useState(1)
  const [productTotal, setProductTotal] = useState(0)
  const [productTotalPages, setProductTotalPages] = useState(1)
  const text = language === 'en'
    ? {
        loading: 'Loading...',
        heroEyebrow: 'Listing content studio',
        heroBadge: 'Up to 3 images: main / scene / detail',
        heroTitle: 'Product listing workspace',
        heroDescription: 'Manage SKUs, reference images, categories, titles, descriptions, and multilingual copies in one place.',
        createProduct: 'New product',
        importing: 'Importing...',
        importFile: 'Import Excel/CSV',
        generating: 'Creating...',
        generateSelected: (count: number) => `Generate selected (${count})`,
        statLabels: {
          products: 'Products',
          images: 'Source images',
          copies: 'Planned copies',
          columns: 'Global fields',
        },
        searchLabel: 'Search products',
        searchPlaceholder: 'SKU, title, description, or Shopee category',
        categoryLabel: 'Category',
        allCategories: 'All categories',
        statusLabel: 'Status',
        statusAll: 'All',
        statusMissingImages: 'Missing source images',
        statusPending: 'Ready to generate',
        statusGenerated: 'Copies generated',
        productCount: (count: number) => `${count} products`,
        globalAttributes: 'Global attributes',
        addAttributePlaceholder: 'Add a global field, for example brand / material / color',
        addAttribute: 'Add field',
        deleteAttributeTitle: 'Delete this attribute field',
        sourceImages: 'Source images',
        sourceTitle: 'Source title',
        sourceDescription: 'Source description',
        categoryHeader: 'Category',
        shopeeCategoryHeader: 'Shopee category',
        copiesHeader: 'Copies / languages',
        statusHeader: 'Status',
        actionsHeader: 'Actions',
        emptyTitle: 'No products yet',
        emptyDescription: 'Create a SKU and upload reference images to start generating listing content.',
        noCategory: 'Not selected',
        emptyCell: 'Not filled',
        missingSourceImages: 'Missing source images',
        edit: 'Edit',
        delete: 'Delete',
        uploadSourceImages: 'Upload images',
        generateCopy: 'Generate copy',
        regenerateCopy: 'Regenerate copy',
        close: 'Close',
      }
    : {
        loading: '加载中...',
        heroEyebrow: '商品内容工作台',
        heroBadge: '最多 3 张图：主图 / 场景图 / 详情图',
        heroTitle: '商品素材生成工作台',
        heroDescription: '统一管理 SKU、参考图、类目、标题、描述和多语言副本，集中处理商品内容生成。',
        createProduct: '新建商品',
        importing: '导入中...',
        importFile: '导入 Excel/CSV',
        generating: '创建中...',
        generateSelected: (count: number) => `生成已选商品 (${count})`,
        statLabels: {
          products: '商品',
          images: '原始参考图',
          copies: '计划副本',
          columns: '全局属性列',
        },
        searchLabel: '搜索商品',
        searchPlaceholder: 'SKU、标题、描述或 Shopee 类目',
        categoryLabel: '类目',
        allCategories: '全部类目',
        statusLabel: '状态',
        statusAll: '全部',
        statusMissingImages: '缺少原图',
        statusPending: '待生成',
        statusGenerated: '已生成副本',
        productCount: (count: number) => `${count} 个商品`,
        globalAttributes: '全局属性',
        addAttributePlaceholder: '新增全局字段，例如品牌 / 材质 / 颜色',
        addAttribute: '添加字段',
        deleteAttributeTitle: '删除这个属性字段',
        sourceImages: '原图',
        sourceTitle: '原始标题',
        sourceDescription: '原始描述',
        categoryHeader: '类目',
        shopeeCategoryHeader: 'Shopee 类目',
        copiesHeader: '副本 / 语言',
        statusHeader: '状态',
        actionsHeader: '操作',
        emptyTitle: '还没有商品',
        emptyDescription: '先新建一个 SKU 并上传参考图，再开始生成商品内容。',
        noCategory: '未选择',
        emptyCell: '未填写',
        missingSourceImages: '缺少原图',
        edit: '编辑',
        delete: '删除',
        uploadSourceImages: '上传原图',
        generateCopy: '生成副本',
        regenerateCopy: '重新生成副本',
        close: '关闭',
      }

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
      const productParams = new URLSearchParams({
        limit: '24',
        page: String(productPage),
        status_filter: statusFilter,
      })
      if (searchText.trim()) productParams.set('search', searchText.trim())
      if (categoryFilter) productParams.set('category_id', categoryFilter)

      const [productsRes, categoriesRes, columnsRes] = await Promise.all([
        apiFetch(`/api/products?${productParams.toString()}`),
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

      setProducts(Array.isArray(productsData?.data) ? productsData.data : [])
      setProductTotal(Number(productsData?.total || 0))
      setProductTotalPages(Math.max(1, Number(productsData?.totalPages || 1)))
      setCategories(categoriesData || [])
      setColumns(columnsData || [])

    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setFetching(false)
    }
  }, [categoryFilter, productPage, searchText, statusFilter])

  useEffect(() => {
    if (!loading) fetchAll()
  }, [loading, fetchAll])

  const stats = useMemo(() => {
    const imageCount = products.reduce((sum, product) => sum + (product.images?.length || 0), 0)
    const copyTarget = products.reduce((sum, product) => sum + languageCopyTotal(product), 0)
    return { imageCount, copyTarget }
  }, [products])

  const pagedProducts = products

  useEffect(() => {
    setProductPage(1)
  }, [categoryFilter, searchText, statusFilter])

  useEffect(() => {
    if (productPage > productTotalPages) {
      setProductPage(productTotalPages)
    }
  }, [productPage, productTotalPages])

  useEffect(() => {
    let cancelled = false

    async function loadPageImageUrls() {
      const paths = pagedProducts.flatMap((product) =>
        (product.images || []).slice(0, 4).map((image) => image.storage_path)
      )

      try {
        const urls = await signStorageUrls('images', paths)
        if (!cancelled) {
          setImageUrls((previous) => ({ ...previous, ...urls }))
        }
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
  }, [pagedProducts])

  useEffect(() => {
    if (loading) return

    const handleWindowFocus = () => {
      void fetchAll()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchAll()
      }
    }

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const intervalId = window.setInterval(() => {
      void fetchAll()
    }, AUTO_REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchAll, loading])

  useEffect(() => {
    if (loading) return

    return subscribeToTableChanges(
      'products-page-realtime',
      [
        { table: 'products' },
        { table: 'product_images' },
        { table: 'product_copies' },
      ],
      () => {
        void fetchAll()
      },
      { debounceMs: 500 }
    )
  }, [fetchAll, loading])

  const toggleSelected = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openCreate = () => {
    const languageCopyCounts = { ...defaultLanguageCopyCounts }
    setForm({
      ...emptyForm,
      languageCopyCounts,
      imageCopyPlan: buildImageCopyPlan(languageCopyCounts),
      shopeeCategory: null,
      attributes: {},
    })
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

  const updateLanguageCopyCount = (languageCode: string, value: number) => {
    setForm((current) => {
      const languageCopyCounts = {
        ...current.languageCopyCounts,
        [languageCode]: value,
      }
      return {
        ...current,
        languageCopyCounts,
        imageCopyPlan: buildImageCopyPlan(languageCopyCounts, current.imageCopyPlan),
      }
    })
  }

  const updateCopyImageRole = (copyKey: string, role: ProductImageRole, checked: boolean) => {
    setForm((current) => ({
      ...current,
      imageCopyPlan: current.imageCopyPlan.map((entry) => {
        if (entry.key !== copyKey) return entry
        const nextRoles = checked
          ? DEFAULT_PRODUCT_IMAGE_ROLES.filter((item) => [...entry.imageRoles, role].includes(item))
          : entry.imageRoles.filter((item) => item !== role)
        return { ...entry, imageRoles: nextRoles }
      }),
    }))
  }

  const setCopyImageRoles = (copyKey: string, roles: ProductImageRole[]) => {
    setForm((current) => ({
      ...current,
      imageCopyPlan: current.imageCopyPlan.map((entry) =>
        entry.key === copyKey ? { ...entry, imageRoles: DEFAULT_PRODUCT_IMAGE_ROLES.filter((role) => roles.includes(role)) } : entry
      ),
    }))
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
      const languageCopyCounts = Object.fromEntries(PRODUCT_LANGUAGES.map((language) => [
        language.code,
        Math.min(Math.max(Math.floor(Number(form.languageCopyCounts[language.code] || 0)), 0), 20),
      ]))
      const selectedLanguages = PRODUCT_LANGUAGES
        .filter((language) => languageCopyCounts[language.code] > 0)
        .map((language) => language.code)
      const normalizedLanguages = selectedLanguages.length > 0 ? selectedLanguages : ['en']
      const normalizedCounts = selectedLanguages.length > 0
        ? languageCopyCounts
        : { ...languageCopyCounts, en: 1 }
      const imageCopyPlan = buildImageCopyPlan(normalizedCounts, form.imageCopyPlan)
      const maxCopyCount = Math.max(...Object.values(normalizedCounts), 1)
      const payload = {
        id: form.id,
        sku: form.sku,
        category_id: form.category_id || null,
        source_title: form.source_title,
        source_description: form.source_description,
        selling_points: form.selling_points,
        copy_count: maxCopyCount,
        languages: normalizedLanguages,
        attributes: {
          ...form.attributes,
          [COPY_PLAN_ATTRIBUTE_KEY]: JSON.stringify(normalizedCounts),
          [COPY_IMAGE_PLAN_ATTRIBUTE_KEY]: JSON.stringify({ version: 1, copies: imageCopyPlan }),
          [SHOPEE_CATEGORY_ATTRIBUTE_KEY]: encodeShopeeCategorySelection(form.shopeeCategory),
        },
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

  const handleGenerate = async (productIds?: string[]) => {
    const targetIds = Array.isArray(productIds) ? productIds : Array.from(selected)
    if (targetIds.length === 0) return
    setGenerating(true)
    setError(null)
    try {
      const res = await apiFetch('/api/product-copies/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: targetIds }),
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

  if (loading) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center text-sm text-slate-500">
        {text.loading}
      </div>
    )
  }

  return (
    <div className="app-shell min-h-screen text-slate-950">
      <Navbar />
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <section className="hero-panel mb-5 rounded-[1.75rem] p-5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="hero-kicker text-sm font-semibold uppercase">{text.heroEyebrow}</p>
                <span className="command-card rounded-full px-3 py-1 text-xs font-semibold text-sky-50">{text.heroBadge}</span>
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{text.heroTitle}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
                {text.heroDescription}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={openCreate} className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-xl shadow-black/20 transition-transform hover:-translate-y-0.5 hover:bg-sky-50">
                {text.createProduct}
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={importing}
                className="command-card rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                {importing ? text.importing : text.importFile}
              </button>
              <button
                onClick={() => handleGenerate()}
                disabled={selected.size === 0 || generating}
                className="rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-xl shadow-emerald-900/20 transition-transform hover:-translate-y-0.5 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {generating ? text.generating : text.generateSelected(selected.size)}
              </button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {statCards.map((card) => {
              const value = card.key === 'products'
                ? products.length
                : card.key === 'images'
                  ? stats.imageCount
                  : card.key === 'copies'
                    ? stats.copyTarget
                    : columns.length
              return (
                <div key={card.key} className="command-card rounded-[1.15rem] p-4 transition-transform hover:-translate-y-0.5">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-full text-xl ${card.tone.replace(card.tone.split(' ')[0], '')}`}>
                      {card.icon}
                    </span>
                    <div>
                      <div className="metric-number text-2xl font-semibold tracking-tight text-white">{value}</div>
                      <div className="mt-1 text-sm text-slate-300">
                        {text.statLabels[card.key as keyof typeof text.statLabels]}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 shadow-sm">{error}</div>}
        {notice && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700 shadow-sm">{notice}</div>}

        <section className="glass-surface mb-4 grid gap-3 rounded-[1.25rem] p-4 lg:grid-cols-[1fr_220px_220px_auto] lg:items-end">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">{text.searchLabel}</span>
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={text.searchPlaceholder}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">{text.categoryLabel}</span>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
              <option value="">{text.allCategories}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {getCategoryDisplayName(category, language)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-500">{text.statusLabel}</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
              <option value="all">{text.statusAll}</option>
              <option value="missing_images">{text.statusMissingImages}</option>
              <option value="pending">{text.statusPending}</option>
              <option value="generated">{text.statusGenerated}</option>
            </select>
          </label>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                  {text.productCount(productTotal)}
          </div>
        </section>

        <section className="glass-surface mb-4 flex flex-col gap-3 rounded-[1.25rem] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-base font-semibold text-slate-950">{text.globalAttributes}</span>
            <input
              value={newColumnName}
              onChange={(event) => setNewColumnName(event.target.value)}
              placeholder={text.addAttributePlaceholder}
              className="w-80 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:border-slate-900 focus:outline-none"
            />
            <button onClick={handleAddColumn} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">
              {text.addAttribute}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {columns.map((column) => (
              <button
                key={column.id}
                onClick={() => handleDeleteColumn(column)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                title={text.deleteAttributeTitle}
              >
                {column.name} ×
              </button>
            ))}
          </div>
        </section>

        <section className="glass-surface overflow-hidden rounded-[1.25rem]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-950 text-left text-xs font-semibold uppercase tracking-wide text-slate-100">
                <tr>
                  <th className="w-10 px-3 py-3"></th>
                  <th className="px-3 py-3">SKU</th>
                  <th className="px-3 py-3">{text.sourceImages}</th>
                  <th className="min-w-[220px] px-3 py-3">{text.sourceTitle}</th>
                  <th className="min-w-[260px] px-3 py-3">{text.sourceDescription}</th>
                  <th className="px-3 py-3">{text.categoryHeader}</th>
                  <th className="min-w-[240px] px-3 py-3">{text.shopeeCategoryHeader}</th>
                  <th className="px-3 py-3">{text.copiesHeader}</th>
                  {columns.map((column) => <th key={column.id} className="px-3 py-3">{column.name}</th>)}
                  <th className="px-3 py-3">{text.statusHeader}</th>
                  <th className="px-3 py-3">{text.actionsHeader}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={11 + columns.length} className="px-4 py-20 text-center">
                      <div className="mx-auto flex max-w-lg flex-col items-center">
                        <div className="relative mb-5 flex h-24 w-24 items-center justify-center rounded-3xl bg-blue-50 text-5xl shadow-inner">
                          📦
                          <span className="absolute -right-2 -top-2 text-xl">✨</span>
                        </div>
                        <h2 className="text-xl font-semibold text-slate-950">{text.emptyTitle}</h2>
                        <p className="mt-3 text-sm leading-6 text-slate-500">{text.emptyDescription}</p>
                        <div className="mt-6 flex flex-wrap justify-center gap-3">
                          <button type="button" onClick={openCreate} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800">
                            {text.createProduct}
                          </button>
                          <button type="button" onClick={() => importInputRef.current?.click()} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
                            {text.importFile}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : pagedProducts.map((product) => (
                  <tr key={product.id} className={`align-top transition-colors hover:bg-slate-50 ${(product.images || []).length === 0 ? 'bg-red-50/40' : ''}`}>
                    <td className="px-3 py-3">
                      <input className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" type="checkbox" checked={selected.has(product.id)} onChange={() => toggleSelected(product.id)} />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-900">{product.sku}</td>
                    <td className="px-3 py-3">
                      <div className="flex max-w-[180px] flex-wrap gap-1.5">
                        {(product.images || []).slice(0, 4).map((image) => (
                          <SignedImage
                            key={image.id}
                            src={imageUrls[image.storage_path]}
                            alt={image.display_name}
                            width={44}
                            height={44}
                            className="h-11 w-11 rounded-xl border border-slate-200 object-cover shadow-sm"
                          />
                        ))}
                        <button onClick={() => handleUploadClick(product.id)} className={`h-11 min-w-11 rounded-xl border border-dashed px-2 text-xs font-medium transition-colors ${(product.images || []).length === 0 ? 'border-red-300 bg-white text-red-600 hover:bg-red-50' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>
                          {(product.images || []).length === 0 ? text.uploadSourceImages : '+'}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="line-clamp-3 max-w-[260px] text-slate-700">{product.source_title || text.emptyCell}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="line-clamp-4 max-w-[320px] text-slate-500">{product.source_description || text.emptyCell}</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {product.categories ? `${product.categories.icon} ${getCategoryDisplayName(product.categories, language)}` : <span className="text-red-500">{text.noCategory}</span>}
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      <div className="line-clamp-3 min-w-[220px] text-xs leading-5">
                        {formatShopeeCategorySelection(productShopeeCategory(product)) || '-'}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="whitespace-nowrap text-slate-700">
                        {pickText(language, {
                          zh: `${languageCopyTotal(product)} 组`,
                          en: `${languageCopyTotal(product)} copies`,
                        })}
                      </div>
                      <div className="mt-1 flex max-w-[200px] flex-wrap gap-1 text-xs text-slate-500">
                        {languageCopySummary(product).map((item) => (
                          <span key={item} className="rounded-lg bg-slate-100 px-2 py-1">{item}</span>
                        ))}
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
                          : product.copy_count_generated
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                            : product.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                              : product.status === 'queued' || product.status === 'generating'
                                ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                            : 'bg-slate-100 text-slate-600'
                      }`}>
                        {(product.images || []).length === 0
                          ? text.missingSourceImages
                          : product.copy_count_generated
                            ? pickText(language, {
                                zh: `已生成 ${product.copy_count_generated} 个副本，可重新生成`,
                                en: `${product.copy_count_generated} copies generated`,
                              })
                            : product.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleGenerate([product.id])}
                          disabled={generating}
                          className="rounded-lg px-2 py-1 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 hover:text-emerald-800 disabled:text-slate-300"
                        >
                          {product.copy_count_generated ? text.regenerateCopy : text.generateCopy}
                        </button>
                        <button onClick={() => openEdit(product)} className="rounded-lg px-2 py-1 text-sm font-semibold text-blue-600 hover:bg-blue-50 hover:text-blue-800">{text.edit}</button>
                        <button onClick={() => handleDelete(product)} className="rounded-lg px-2 py-1 text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-800">{text.delete}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <PaginationBar
          page={productPage}
          totalPages={productTotalPages}
          onPageChange={setProductPage}
          totalLabel={pickText(language, {
            zh: `共 ${productTotal} 个商品，当前第 ${Math.min(productPage, productTotalPages)} / ${productTotalPages} 页`,
            en: `${productTotal} products · page ${Math.min(productPage, productTotalPages)} / ${productTotalPages}`,
          })}
        />
        {fetching && (
          <p className="mt-3 text-xs text-slate-400">
            {pickText(language, { zh: '正在刷新商品数据...', en: 'Refreshing products...' })}
          </p>
        )}
      </main>

      <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleUpload} />
      <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <form onSubmit={handleSave} className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl ring-1 ring-slate-900/10">
            <div className="flex items-start justify-between border-b border-slate-200 px-7 py-5">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                  {form.id
                    ? pickText(language, { zh: '编辑商品', en: 'Edit product' })
                    : pickText(language, { zh: '新增商品', en: 'New product' })}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {pickText(language, {
                    zh: '填写商品原始资料，上传参考图后可生成多语言副本和按需勾选的商品图。',
                    en: 'Add the source listing details and reference images, then generate multilingual copies and selected image types.',
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label={text.close}
              >
                ×
              </button>
            </div>
            <div className="grid gap-5 px-7 py-6 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  SKU<span className="text-red-500"> *</span>
                </span>
                <input
                  required
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                  placeholder={pickText(language, { zh: '请输入 SKU', en: 'Enter SKU' })}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">{text.categoryHeader}<span className="text-red-500"> *</span></span>
                <select required value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
                  <option value="">{pickText(language, { zh: '请选择类目', en: 'Select category' })}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.icon} {getCategoryDisplayName(category, language)}</option>
                  ))}
                </select>
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  {pickText(language, { zh: '原始参考图（可多选）', en: 'Reference images (multiple allowed)' })}
                </span>
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
                  <div className="text-base font-semibold text-slate-900">
                    {pickText(language, { zh: '拖动图片到这里，或从本地选择', en: 'Drag images here or choose from your computer' })}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {pickText(language, {
                      zh: '支持一次选择多张 JPG / PNG / WebP 图片，会追加到当前商品的参考图列表。',
                      en: 'You can add multiple JPG / PNG / WebP files at once.',
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      sourceInputRef.current?.click()
                    }}
                    className="mt-4 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                  >
                    {pickText(language, { zh: '从本地选择图片', en: 'Choose images' })}
                  </button>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {pickText(language, {
                    zh: '这些图片会存到该 SKU 下，生成每个副本勾选的图片类型时都会作为参考图一起传入模型。多张原图可以同时参考。',
                    en: 'These images stay under the SKU and are sent as references when generating each selected image type.',
                  })}
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
                          aria-label={pickText(language, { zh: `移除 ${file.name}`, en: `Remove ${file.name}` })}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-slate-700">{text.sourceTitle}</span>
                <input value={form.source_title} onChange={(e) => setForm({ ...form, source_title: e.target.value })} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder={pickText(language, { zh: '请输入原始标题（建议 10-120 个字符）', en: 'Enter the original title (10-120 characters recommended)' })} />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-slate-700">{text.sourceDescription}</span>
                <textarea rows={5} value={form.source_description} onChange={(e) => setForm({ ...form, source_description: e.target.value })} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder={pickText(language, { zh: '请输入原始描述（建议 20-2000 个字符）', en: 'Enter the original description (20-2000 characters recommended)' })} />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-slate-700">{pickText(language, { zh: '卖点补充（可空）', en: 'Selling points (optional)' })}</span>
                <textarea rows={3} value={form.selling_points} onChange={(e) => setForm({ ...form, selling_points: e.target.value })} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder={pickText(language, { zh: '请输入商品卖点、功能亮点或使用场景等补充信息', en: 'Add selling points, feature highlights, or usage scenes' })} />
              </label>
              <div className="md:col-span-2">
                <ShopeeCategoryPicker
                  value={form.shopeeCategory}
                  onChange={(selection) => setForm({ ...form, shopeeCategory: selection })}
                />
              </div>
              <div className="md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  {pickText(language, { zh: '各语言副本数量', en: 'Copies per language' })}
                </span>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {PRODUCT_LANGUAGES.map((language) => (
                    <label key={language.code} className={`rounded-2xl border px-4 py-3 shadow-sm transition-colors ${
                      (form.languageCopyCounts[language.code] || 0) > 0
                        ? 'border-blue-200 bg-blue-50/60'
                        : 'border-slate-200 bg-white'
                    }`}>
                      <span className="mb-2 block text-sm font-semibold text-slate-700">{language.label}</span>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={form.languageCopyCounts[language.code] || 0}
                        onChange={(event) => {
                          const value = Math.min(Math.max(Math.floor(Number(event.target.value || 0)), 0), 20)
                          updateLanguageCopyCount(language.code, value)
                        }}
                        className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {pickText(language, {
                    zh: '填 0 表示不生成该语言。例：英语 2、马来语 1、其他 0，会生成 3 个独立副本；每个副本都会重新生成标题、描述，并按勾选生成 1 到 3 张图片。',
                    en: 'Set 0 to skip a language. For example, English 2 and Malay 1 will create 3 independent copies, each with its own selected image types.',
                  })}
                </p>
              </div>
              <div className="md:col-span-2">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="block text-sm font-semibold text-slate-700">
                      {pickText(language, { zh: '每个副本要生成的图片类型', en: 'Image types for each copy' })}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {pickText(language, {
                        zh: '每个语言副本独立选择。只勾主图就只生成 1 张，全勾最多生成 3 张。',
                        en: 'Each language copy is configured separately. Main only creates 1 image, and all selected creates up to 3.',
                      })}
                    </span>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {pickText(language, {
                      zh: `共 ${form.imageCopyPlan.reduce((sum, entry) => sum + entry.imageRoles.length, 0)} 张图片任务`,
                      en: `${form.imageCopyPlan.reduce((sum, entry) => sum + entry.imageRoles.length, 0)} image tasks`,
                    })}
                  </span>
                </div>
                {form.imageCopyPlan.length > 0 ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {form.imageCopyPlan.map((entry) => {
                      const languageOption = PRODUCT_LANGUAGES.find((item) => item.code === entry.languageCode)
                      return (
                        <div key={entry.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="font-semibold text-slate-900">
                              {languageOption?.label || entry.languageCode} {entry.copyIndex}
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setCopyImageRoles(entry.key, DEFAULT_PRODUCT_IMAGE_ROLES)}
                                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                {pickText(language, { zh: '全选', en: 'All' })}
                              </button>
                              <button
                                type="button"
                                onClick={() => setCopyImageRoles(entry.key, ['main'])}
                                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                {pickText(language, { zh: '只主图', en: 'Main only' })}
                              </button>
                              <button
                                type="button"
                                onClick={() => setCopyImageRoles(entry.key, [])}
                                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                {pickText(language, { zh: '只生成文案', en: 'Text only' })}
                              </button>
                            </div>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-3">
                            {PRODUCT_IMAGE_ROLE_OPTIONS.map((role) => {
                              const checked = entry.imageRoles.includes(role.value)
                              return (
                                <label
                                  key={`${entry.key}-${role.value}`}
                                  className={`cursor-pointer rounded-xl border px-3 py-2 transition-colors ${
                                    checked ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600'
                                  }`}
                                >
                                  <span className="flex items-center gap-2 text-sm font-semibold">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(event) => updateCopyImageRole(entry.key, role.value, event.target.checked)}
                                    />
                                    {role.label}
                                  </span>
                                  <span className="mt-1 block text-xs text-slate-500">{role.description}</span>
                                </label>
                              )
                            })}
                          </div>
                          {entry.imageRoles.length === 0 && (
                            <p className="mt-2 text-xs font-semibold text-slate-500">
                              {pickText(language, { zh: '该副本只生成标题和描述，不生成图片。', en: 'This copy will generate title and description only.' })}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                    {pickText(language, { zh: '请先把至少一个语言副本数量设为 1。', en: 'Set at least one language copy count to 1 first.' })}
                  </div>
                )}
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
                {pickText(language, { zh: '取消', en: 'Cancel' })}
              </button>
              <button disabled={saving} className="rounded-xl bg-slate-950 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800 disabled:bg-slate-400 disabled:shadow-none">
                {saving
                  ? pickText(language, { zh: '保存中...', en: 'Saving...' })
                  : pickText(language, { zh: '保存商品', en: 'Save product' })}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
