'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { PRODUCT_LANGUAGES } from '@/lib/types'
import {
  SEO_KEYWORD_TYPES,
  scoreSeoContent,
  type SeoKeyword,
  type SeoKeywordBank,
  type SeoKeywordType,
} from '@/lib/seo-keywords'
import type { Category } from '@/lib/types'

type SeoKeywordBankWithCategory = SeoKeywordBank & {
  category_name_zh?: string
  category_slug?: string
  category_icon?: string
}

type KeywordDraft = {
  keyword: string
  type: SeoKeywordType
  priority: number
  note: string
}

const emptyDraft: KeywordDraft = {
  keyword: '',
  type: 'core',
  priority: 5,
  note: '',
}

function createKeyword(draft: KeywordDraft): SeoKeyword {
  return {
    id: crypto.randomUUID(),
    keyword: draft.keyword.trim(),
    type: draft.type,
    priority: draft.priority,
    ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
  }
}

export default function SeoKeywordsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<Category[]>([])
  const [banks, setBanks] = useState<SeoKeywordBank[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [languageCode, setLanguageCode] = useState('en')
  const [keywords, setKeywords] = useState<SeoKeyword[]>([])
  const [draft, setDraft] = useState<KeywordDraft>(emptyDraft)
  const [bulkText, setBulkText] = useState('')
  const [saving, setSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [seedText, setSeedText] = useState('')
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewDescription, setPreviewDescription] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login')
      else setLoading(false)
    })
  }, [router])

  const fetchData = useCallback(async () => {
    setError(null)
    try {
      const [categoriesRes, banksRes] = await Promise.all([
        apiFetch('/api/categories'),
        apiFetch('/api/seo-keywords'),
      ])
      const [categoriesData, banksData] = await Promise.all([
        categoriesRes.json().catch(() => null),
        banksRes.json().catch(() => null),
      ])

      if (!categoriesRes.ok) throw new Error(categoriesData?.error || '类目加载失败')
      if (!banksRes.ok) throw new Error(banksData?.error || '关键词库加载失败')

      const loadedBanks: SeoKeywordBankWithCategory[] = Array.isArray(banksData) ? banksData : []
      const loadedCategories: Category[] = Array.isArray(categoriesData) && categoriesData.length > 0
        ? categoriesData
        : Array.from(
            loadedBanks.reduce((map, bank) => {
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

      setCategories(loadedCategories)
      setBanks(loadedBanks)
      setCategoryId((current) => current || loadedCategories[0]?.id || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    if (!loading) fetchData()
  }, [loading, fetchData])

  useEffect(() => {
    if (!categoryId && categories.length > 0) {
      setCategoryId(categories[0].id)
    }
  }, [categories, categoryId])

  const effectiveCategoryId = categoryId || categories[0]?.id || ''
  const currentBank = useMemo(() => {
    return banks.find((bank) => bank.category_id === effectiveCategoryId && bank.language_code === languageCode) || null
  }, [banks, effectiveCategoryId, languageCode])

  useEffect(() => {
    setKeywords(currentBank?.keywords || [])
  }, [currentBank])

  const currentCategory = categories.find((category) => category.id === effectiveCategoryId)
  const score = useMemo(() => {
    return scoreSeoContent(previewTitle, previewDescription, {
      category_id: effectiveCategoryId,
      language_code: languageCode,
      keywords,
    })
  }, [effectiveCategoryId, languageCode, keywords, previewTitle, previewDescription])

  const groupedKeywords = SEO_KEYWORD_TYPES.map((type) => ({
    ...type,
    items: keywords.filter((keyword) => keyword.type === type.value),
  }))

  const addKeyword = () => {
    if (!draft.keyword.trim()) return
    setKeywords((previous) => [...previous, createKeyword(draft)])
    setDraft(emptyDraft)
  }

  const importBulk = () => {
    const parsed = bulkText
      .split(/[\n,，]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((keyword) => ({
        id: crypto.randomUUID(),
        keyword,
        type: draft.type,
        priority: draft.priority,
        ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
      }))

    if (parsed.length === 0) return
    setKeywords((previous) => [...previous, ...parsed])
    setBulkText('')
  }

  const updateKeyword = (id: string, patch: Partial<SeoKeyword>) => {
    setKeywords((previous) => previous.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  const removeKeyword = (id: string) => {
    setKeywords((previous) => previous.filter((item) => item.id !== id))
  }

  const saveBank = async () => {
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
          mode: 'replace',
          active: true,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || '保存关键词库失败')
      setNotice('关键词库已保存，下一次商品生成会自动调用。')
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存关键词库失败')
    } finally {
      setSaving(false)
    }
  }

  const deleteBank = async () => {
    if (!effectiveCategoryId || !window.confirm('确定删除当前类目和语言的关键词库吗？')) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const res = await apiFetch(`/api/seo-keywords?category_id=${effectiveCategoryId}&language_code=${languageCode}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || '删除关键词库失败')
      setKeywords([])
      setNotice('关键词库已删除。')
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除关键词库失败')
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
      setNotice(`已生成 ${suggested.length} 个关键词建议。请检查后点击“保存关键词库”，保存后才会被商品生成调用。`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 生成关键词建议失败')
    } finally {
      setSuggesting(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(250,204,21,0.20),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(37,99,235,0.14),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_42%,#eef2f7_100%)] text-slate-950">
      <Navbar />
      <main className="mx-auto max-w-[1500px] px-5 py-10 sm:px-8">
        <section className="mb-7 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Marketplace SEO Studio</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">商品关键词库</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              按类目和语言维护核心词、长尾词、属性词、场景词、人群词和禁用词。商品生成标题、描述和详情图文字时会自动调用这里的关键词库。
            </p>
          </div>
          <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/82 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
            <div className="text-sm font-semibold text-slate-950">当前类目</div>
            <div className="mt-2 text-2xl font-semibold">{currentCategory ? `${currentCategory.icon} ${currentCategory.name_zh}` : '未选择'}</div>
            <div className="mt-1 text-sm text-slate-500">{keywords.length} 个关键词</div>
          </div>
        </section>

        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 shadow-sm">{error}</div>}
        {notice && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700 shadow-sm">{notice}</div>}

        <section className="mb-6 grid gap-4 rounded-[1.4rem] border border-slate-200/80 bg-white/86 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] md:grid-cols-[1fr_260px_auto_auto]">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">类目</span>
            <select value={effectiveCategoryId} onChange={(event) => setCategoryId(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
              {categories.length === 0 && <option value="">没有可用类目，请刷新或检查登录状态</option>}
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
          <button onClick={saveBank} disabled={saving || !effectiveCategoryId} className="self-end rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-slate-950/15 hover:bg-slate-800 disabled:bg-slate-300">
            {saving ? '保存中...' : '保存关键词库'}
          </button>
          <button onClick={deleteBank} disabled={saving || !currentBank} className="self-end rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:border-slate-200 disabled:text-slate-300">
            删除库
          </button>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <section className="space-y-5">
            <div className="rounded-[1.4rem] border border-blue-200/80 bg-blue-50/55 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.04)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">AI 生成关键词建议</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                    根据当前类目、语言、规则模板和你补充的商品方向，自动生成一组可编辑关键词。它借鉴的是 SEOToolSuite 的“关键词研究/建议”思路，但先不接付费数据源。
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button onClick={() => suggestKeywords('replace')} disabled={suggesting || !effectiveCategoryId} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:bg-slate-300">
                    {suggesting ? '生成中...' : 'AI 生成并覆盖'}
                  </button>
                  <button onClick={() => suggestKeywords('append')} disabled={suggesting || !effectiveCategoryId} className="rounded-2xl border border-blue-200 bg-white px-5 py-3 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-50 disabled:text-slate-300">
                    追加建议
                  </button>
                </div>
              </div>
              <textarea value={seedText} onChange={(event) => setSeedText(event.target.value)} rows={3} className="mt-4 w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="可选：写一些该类目的商品例子、目标市场、你想主推的搜索词。例如：eye cream for dark circles, hydrating, anti-aging wording should be conservative." />
              <p className="mt-2 text-xs leading-5 text-blue-700">
                注意：AI 生成后只是填到当前页面，还没有保存。你确认关键词合理后，需要点击上方“保存关键词库”。
              </p>
            </div>

            <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
              <h2 className="text-lg font-semibold text-slate-950">新增关键词</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_170px_120px]">
                <input value={draft.keyword} onChange={(event) => setDraft({ ...draft, keyword: event.target.value })} className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="输入关键词，如 facial cleanser / moisturizing lotion" />
                <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as SeoKeywordType })} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
                  {SEO_KEYWORD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <input type="number" min={1} max={5} value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value || 3) })} className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="备注，可写适用场景、不要过度承诺等" />
                <button onClick={addKeyword} className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700">添加关键词</button>
              </div>
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-700">批量导入</div>
                <textarea value={bulkText} onChange={(event) => setBulkText(event.target.value)} rows={3} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="一行一个，或用逗号分隔。会按上面选择的类型和优先级导入。" />
                <button onClick={importBulk} className="mt-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">批量添加</button>
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
            <section className="rounded-[1.4rem] border border-blue-200/80 bg-blue-50/55 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.04)]">
              <h2 className="text-lg font-semibold text-slate-950">生成时如何使用</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                商品生成时会根据商品类目和副本语言读取这里的关键词库，连同原标题、原描述、卖点、属性、Shopee规则一起投给 Gemini。核心词会被要求靠前，长尾词和场景词会在不同副本中轮换，禁用词会被强制避开。
              </p>
            </section>

            <section className="rounded-[1.4rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)]">
              <h2 className="text-lg font-semibold text-slate-950">SEO 评分预览</h2>
              <p className="mt-1 text-sm text-slate-500">把生成后的标题和描述粘进来，可以快速检查关键词覆盖和禁词风险。</p>
              <input value={previewTitle} onChange={(event) => setPreviewTitle(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="商品标题" />
              <textarea value={previewDescription} onChange={(event) => setPreviewDescription(event.target.value)} rows={6} className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="商品描述" />
              <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-white">
                <div className="text-sm text-slate-300">当前评分</div>
                <div className="mt-1 text-4xl font-semibold">{score.score}</div>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <div className="font-semibold text-slate-900">已命中关键词</div>
                <div className="flex flex-wrap gap-2">
                  {score.matched_keywords.length ? score.matched_keywords.map((item) => <span key={item} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{item}</span>) : <span className="text-slate-500">暂无</span>}
                </div>
                {score.forbidden_keywords.length > 0 && (
                  <>
                    <div className="font-semibold text-red-700">禁用词风险</div>
                    <div className="flex flex-wrap gap-2">
                      {score.forbidden_keywords.map((item) => <span key={item} className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">{item}</span>)}
                    </div>
                  </>
                )}
                {score.suggestions.length > 0 && (
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
