'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { PRODUCT_LANGUAGES, type Category } from '@/lib/types'
import {
  SEO_KEYWORD_TYPES,
  scoreSeoContent,
  type SeoKeyword,
  type SeoKeywordBank,
  type SeoKeywordType,
} from '@/lib/seo-keywords'

type SeoKeywordBankWithCategory = SeoKeywordBank & {
  category_name_zh?: string
  category_slug?: string
  category_icon?: string
}

type Draft = {
  keyword: string
  type: SeoKeywordType
  priority: number
  note: string
}

type ImportPreview = {
  total_rows: number
  valid_rows: number
  skipped: number
  groups: Array<{
    category_id: string
    category_name: string
    language_code: string
    keyword_count: number
    sample_keywords: string[]
  }>
  errors: Array<{ row: number; reason: string }>
}

const EMPTY_DRAFT: Draft = {
  keyword: '',
  type: 'core',
  priority: 5,
  note: '',
}

function createKeyword(draft: Draft): SeoKeyword {
  return {
    id: crypto.randomUUID(),
    keyword: draft.keyword.trim(),
    type: draft.type,
    priority: draft.priority,
    ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
  }
}

function categoriesFromBanks(banks: SeoKeywordBankWithCategory[]) {
  return Array.from(
    banks.reduce((map, bank) => {
      if (!bank.category_id || map.has(bank.category_id)) return map
      map.set(bank.category_id, {
        id: bank.category_id,
        user_id: '',
        name_zh: bank.category_name_zh || bank.category_id,
        slug: bank.category_slug || bank.category_id,
        icon: bank.category_icon || '📦',
        sort_order: map.size,
        is_preset: true,
        created_at: '',
        updated_at: '',
      })
      return map
    }, new Map<string, Category>()).values()
  )
}

export default function SeoKeywordsPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [banks, setBanks] = useState<SeoKeywordBankWithCategory[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [languageCode, setLanguageCode] = useState('en')
  const [keywords, setKeywords] = useState<SeoKeyword[]>([])
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [bulkText, setBulkText] = useState('')
  const [seedText, setSeedText] = useState('')
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewDescription, setPreviewDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login')
      else setLoading(false)
    })
  }, [router])

  const applyCategories = useCallback((loadedCategories: Category[]) => {
    setCategories(loadedCategories)
    setCategoryId((current) => current || loadedCategories[0]?.id || '')
  }, [])

  const fetchData = useCallback(async () => {
    setError(null)
    setDataLoading(true)
    try {
      const [categoriesRes, banksRes] = await Promise.all([
        apiFetch('/api/categories'),
        apiFetch('/api/seo-keywords'),
      ])
      const categoriesData = await categoriesRes.json().catch(() => null)
      const banksData = await banksRes.json().catch(() => null)

      if (!banksRes.ok) throw new Error(banksData?.error || `关键词库加载失败 (${banksRes.status})`)
      const loadedBanks: SeoKeywordBankWithCategory[] = Array.isArray(banksData) ? banksData : []
      setBanks(loadedBanks)

      if (categoriesRes.ok && Array.isArray(categoriesData) && categoriesData.length > 0) {
        applyCategories(categoriesData)
      } else {
        applyCategories(categoriesFromBanks(loadedBanks))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setDataLoading(false)
    }
  }, [applyCategories])

  useEffect(() => {
    if (!loading) fetchData()
  }, [loading, fetchData])

  const effectiveCategoryId = categoryId || categories[0]?.id || ''
  const currentBank = useMemo(() => {
    return banks.find((bank) => bank.category_id === effectiveCategoryId && bank.language_code === languageCode) || null
  }, [banks, effectiveCategoryId, languageCode])

  useEffect(() => {
    setKeywords(currentBank?.keywords || [])
  }, [currentBank])

  const currentCategory = categories.find((category) => category.id === effectiveCategoryId)
  const groupedKeywords = SEO_KEYWORD_TYPES.map((type) => ({
    ...type,
    items: keywords.filter((keyword) => keyword.type === type.value),
  }))
  const previewHasContent = Boolean(previewTitle.trim() || previewDescription.trim())
  const score = useMemo(() => {
    if (!previewHasContent) return null
    return scoreSeoContent(previewTitle, previewDescription, {
      category_id: effectiveCategoryId,
      language_code: languageCode,
      keywords,
    })
  }, [effectiveCategoryId, languageCode, keywords, previewDescription, previewHasContent, previewTitle])

  const addKeyword = () => {
    if (!draft.keyword.trim()) return
    setKeywords((previous) => [...previous, createKeyword(draft)])
    setDraft(EMPTY_DRAFT)
  }

  const addBulkKeywords = () => {
    const items = bulkText
      .split(/[\n,，]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((keyword) => ({
        id: crypto.randomUUID(),
        keyword,
        type: draft.type,
        priority: draft.priority,
        ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
      }))
    if (!items.length) return
    setKeywords((previous) => [...previous, ...items])
    setBulkText('')
  }

  const updateKeyword = (id: string, patch: Partial<SeoKeyword>) => {
    setKeywords((previous) => previous.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  const removeKeyword = (id: string) => {
    setKeywords((previous) => previous.filter((item) => item.id !== id))
  }

  const saveBank = async (mode: 'replace' | 'append' = 'replace') => {
    if (!effectiveCategoryId) {
      setError('请先选择类目')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const res = await apiFetch('/api/seo-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: effectiveCategoryId,
          language_code: languageCode,
          keywords,
          mode,
          active: true,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || '保存关键词库失败')
      setNotice(mode === 'append' ? '关键词已追加保存，系统已自动去重。' : '关键词库已保存，下次商品生成会自动调用。')
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存关键词库失败')
    } finally {
      setSaving(false)
    }
  }

  const suggestKeywords = async (mode: 'replace' | 'append') => {
    if (!effectiveCategoryId) {
      setError('请先选择类目')
      return
    }
    setSuggesting(true)
    setError(null)
    setNotice(null)
    try {
      const res = await apiFetch('/api/seo-keywords/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: effectiveCategoryId,
          language_code: languageCode,
          seed_text: seedText,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'AI 生成关键词建议失败')
      const suggested = Array.isArray(data?.keywords) ? data.keywords : []
      setKeywords((previous) => mode === 'append' ? [...previous, ...suggested] : suggested)
      setNotice(`已生成 ${suggested.length} 个关键词建议。请检查后保存，保存后才会被商品生成调用。`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 生成关键词建议失败')
    } finally {
      setSuggesting(false)
    }
  }

  const importFile = async (file?: File | null, action: 'preview' | 'commit' = 'preview') => {
    if (!file) return
    setImporting(true)
    setError(null)
    setNotice(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('action', action)
      const res = await apiFetch('/api/seo-keywords/import', {
        method: 'POST',
        body: form,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || '导入失败')

      if (action === 'preview') {
        setSelectedImportFile(file)
        setImportPreview(data)
      } else {
        setNotice(`导入完成：追加 ${data.imported || 0} 个关键词，跳过 ${data.skipped || 0} 行，已自动去重。`)
        setSelectedImportFile(null)
        setImportPreview(null)
        await fetchData()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
    } finally {
      setImporting(false)
      if (action === 'commit' && fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const confirmImport = async () => {
    if (!selectedImportFile) return
    await importFile(selectedImportFile, 'commit')
  }

  const cancelImport = () => {
    setSelectedImportFile(null)
    setImportPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(250,204,21,0.20),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(37,99,235,0.14),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_42%,#eef2f7_100%)] text-slate-950">
      <Navbar />
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        <section className="mb-7 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Marketplace SEO Studio</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">商品 SEO 关键词库</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              支持按类目和语言维护核心词、长尾词、属性词、场景词、人群词和禁用词。导入默认是追加，不覆盖旧词，同类目、同语言、同类型、同关键词会自动去重。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => importFile(event.target.files?.[0], 'preview')}
            />
            <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:bg-slate-300">
              {importing ? '导入中...' : '导入 Excel/CSV'}
            </button>
            <a href="/api/seo-keywords/export" className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
              导出 CSV
            </a>
          </div>
        </section>

        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 shadow-sm">{error}</div>}
        {notice && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700 shadow-sm">{notice}</div>}
        {importPreview && (
          <section className="mb-6 rounded-[1.4rem] border border-blue-200 bg-white/95 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">导入预览</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  共读取 {importPreview.total_rows} 行，可导入 {importPreview.valid_rows} 个关键词，跳过 {importPreview.skipped} 行。确认后才会写入词库，并按类目、语言、类型、关键词自动去重。
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={confirmImport} disabled={importing || importPreview.valid_rows === 0} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:bg-slate-300">
                  {importing ? '写入中...' : '确认导入'}
                </button>
                <button onClick={cancelImport} className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  取消
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {importPreview.groups.slice(0, 8).map((group) => (
                <div key={`${group.category_id}-${group.language_code}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">{group.category_name} / {group.language_code}</div>
                  <div className="mt-1 text-xs text-slate-500">{group.keyword_count} 个关键词</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {group.sample_keywords.map((keyword) => (
                      <span key={keyword} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">{keyword}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {importPreview.errors.length > 0 && (
              <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                <div className="font-semibold">跳过行示例</div>
                {importPreview.errors.slice(0, 8).map((item) => <div key={`${item.row}-${item.reason}`}>第 {item.row} 行：{item.reason}</div>)}
              </div>
            )}
          </section>
        )}

        <section className="mb-6 grid gap-4 rounded-[1.4rem] border border-slate-200/80 bg-white/86 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] md:grid-cols-[1fr_220px_auto_auto]">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">类目</span>
            <select value={effectiveCategoryId} onChange={(event) => setCategoryId(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
              {dataLoading && categories.length === 0 && <option value="">正在加载类目...</option>}
              {!dataLoading && categories.length === 0 && <option value="">暂无类目</option>}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.icon} {category.name_zh}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">语言</span>
            <select value={languageCode} onChange={(event) => setLanguageCode(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
              {PRODUCT_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>{language.label}</option>
              ))}
            </select>
          </label>
          <button onClick={() => saveBank('replace')} disabled={saving || !effectiveCategoryId} className="self-end rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-slate-950/15 hover:bg-slate-800 disabled:bg-slate-300">
            {saving ? '保存中...' : '保存当前词库'}
          </button>
          <button onClick={() => saveBank('append')} disabled={saving || !effectiveCategoryId} className="self-end rounded-2xl border border-blue-200 bg-white px-5 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:text-slate-300">
            追加保存
          </button>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <section className="space-y-5">
            <div className="rounded-[1.4rem] border border-blue-200/80 bg-blue-50/55 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.04)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">AI 关键词建议</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">输入商品方向或市场关键词，生成后先进入当前页面草稿，需要保存后才会被商品生成调用。</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button onClick={() => suggestKeywords('replace')} disabled={suggesting || !effectiveCategoryId} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:bg-slate-300">
                    {suggesting ? '生成中...' : 'AI 生成并覆盖'}
                  </button>
                  <button onClick={() => suggestKeywords('append')} disabled={suggesting || !effectiveCategoryId} className="rounded-2xl border border-blue-200 bg-white px-5 py-3 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-50 disabled:text-slate-300">
                    AI 生成并追加
                  </button>
                </div>
              </div>
              <textarea value={seedText} onChange={(event) => setSeedText(event.target.value)} rows={3} className="mt-4 w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="可选：例如 eye cream for dry skin, gentle, fragrance free, avoid medical claims." />
            </div>

            <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
              <h2 className="text-lg font-semibold text-slate-950">新增关键词</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_170px_120px]">
                <input value={draft.keyword} onChange={(event) => setDraft({ ...draft, keyword: event.target.value })} className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="输入关键词，例如 facial cleanser" />
                <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as SeoKeywordType })} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
                  {SEO_KEYWORD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <input type="number" min={1} max={5} value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value || 3) })} className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="备注，可选" />
                <button onClick={addKeyword} className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700">添加关键词</button>
              </div>
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-700">批量追加到当前草稿</div>
                <textarea value={bulkText} onChange={(event) => setBulkText(event.target.value)} rows={3} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="一行一个，或用逗号分隔。会按上方选择的类型和优先级加入。" />
                <button onClick={addBulkKeywords} className="mt-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">批量添加</button>
              </div>
            </div>

            {groupedKeywords.map((group) => (
              <div key={group.value} className="rounded-[1.4rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">{group.label}</h2>
                    <p className="mt-1 text-sm text-slate-500">{group.hint}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{group.items.length}</span>
                </div>
                {group.items.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">暂无关键词。</div>
                ) : (
                  <div className="space-y-3">
                    {group.items.map((item) => (
                      <div key={item.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-[1fr_96px_1fr_auto]">
                        <input value={item.keyword} onChange={(event) => updateKeyword(item.id, { keyword: event.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                        <input type="number" min={1} max={5} value={item.priority} onChange={(event) => updateKeyword(item.id, { priority: Number(event.target.value || 3) })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                        <input value={item.note || ''} onChange={(event) => updateKeyword(item.id, { note: event.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="备注" />
                        <button onClick={() => removeKeyword(item.id)} className="rounded-xl px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">删除</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>

          <aside className="space-y-5">
            <section className="rounded-[1.4rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
              <h2 className="text-lg font-semibold text-slate-950">当前词库</h2>
              <div className="mt-2 text-2xl font-semibold">{currentCategory ? `${currentCategory.icon} ${currentCategory.name_zh}` : '未选择'}</div>
              <div className="mt-1 text-sm text-slate-500">{keywords.length} 个关键词</div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                导入字段建议：一级类目、二级类目、叶类目、language、keyword、type、priority、note。type 支持 core、long_tail、attribute、scene、audience、forbidden。
              </div>
            </section>

            <section className="rounded-[1.4rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
              <h2 className="text-lg font-semibold text-slate-950">SEO 评分预览</h2>
              <p className="mt-1 text-sm text-slate-500">把生成后的标题和描述粘进来，检查核心词、长尾词和禁词风险。</p>
              <input value={previewTitle} onChange={(event) => setPreviewTitle(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="商品标题" />
              <textarea value={previewDescription} onChange={(event) => setPreviewDescription(event.target.value)} rows={6} className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="商品描述" />
              <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-white">
                <div className="text-sm text-slate-300">当前评分</div>
                <div className="mt-1 text-4xl font-semibold">{score ? score.score : '--'}</div>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <div className="font-semibold text-slate-900">已命中关键词</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {score?.matched_keywords.length ? score.matched_keywords.map((item) => <span key={item} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{item}</span>) : <span className="text-slate-500">{previewHasContent ? '暂无' : '输入标题或描述后显示'}</span>}
                  </div>
                </div>
                {score && score.forbidden_keywords.length > 0 && (
                  <div>
                    <div className="font-semibold text-red-700">禁用词风险</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {score.forbidden_keywords.map((item) => <span key={item} className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">{item}</span>)}
                    </div>
                  </div>
                )}
                {score && score.suggestions.length > 0 && (
                  <div className="rounded-2xl bg-amber-50 p-4 text-amber-800">
                    {score.suggestions.map((item) => <p key={item}>{item}</p>)}
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
