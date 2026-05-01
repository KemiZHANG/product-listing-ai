'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PROMPT_ROLES } from '@/lib/types'
import type { Category, CategoryImage, CategoryPrompt } from '@/lib/types'

type CategoryDetail = Category & {
  prompts: CategoryPrompt[]
  images: CategoryImage[]
}

export default function CategoryPromptPage() {
  const params = useParams()
  const router = useRouter()
  const categoryId = params.id as string
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<CategoryDetail | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [editingRole, setEditingRole] = useState('custom')
  const [newText, setNewText] = useState('')
  const [newRole, setNewRole] = useState('custom')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [aiNeed, setAiNeed] = useState('')
  const [aiImageType, setAiImageType] = useState('main_1')
  const [aiStyle, setAiStyle] = useState('')
  const [aiPeople, setAiPeople] = useState('')
  const [aiScene, setAiScene] = useState('')
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login')
      else setLoading(false)
    })
  }, [router])

  const fetchCategory = useCallback(async () => {
    const res = await apiFetch(`/api/categories/${categoryId}`)
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '类目加载失败')
      return
    }
    setCategory(data)

    const signedUrls = await Promise.all(
      (data.images || []).map(async (image: CategoryImage) => {
        const { data: signed } = await supabase.storage.from('images').createSignedUrl(image.storage_path, 60 * 60)
        return [image.storage_path, signed?.signedUrl || ''] as const
      })
    )
    setImageUrls(Object.fromEntries(signedUrls))
  }, [categoryId])

  useEffect(() => {
    if (!loading) fetchCategory()
  }, [loading, fetchCategory])

  const startEdit = (prompt: CategoryPrompt) => {
    setEditingId(prompt.id)
    setEditingText(prompt.prompt_text)
    setEditingRole(prompt.prompt_role || 'custom')
  }

  const updatePrompt = async () => {
    if (!editingId || !editingText.trim()) return
    const res = await apiFetch(`/api/prompts/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt_text: editingText.trim(), prompt_role: editingRole }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '更新指令失败')
      return
    }
    setEditingId(null)
    setEditingText('')
    await fetchCategory()
  }

  const addPrompt = async () => {
    if (!category || !newText.trim()) return
    const res = await apiFetch('/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: category.id, prompt_text: newText.trim(), prompt_role: newRole }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '新增指令失败')
      return
    }
    setNewText('')
    setNewRole('custom')
    await fetchCategory()
  }

  const deletePrompt = async (prompt: CategoryPrompt) => {
    if (!window.confirm(`确定删除 P${prompt.prompt_number} 吗？`)) return
    const res = await apiFetch(`/api/prompts/${prompt.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '删除指令失败')
      return
    }
    await fetchCategory()
  }

  const uploadImages = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    setUploading(true)
    setError(null)
    setNotice(null)
    try {
      for (const file of imageFiles) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('category_id', categoryId)
        formData.append('display_name', file.name.replace(/\.[^/.]+$/, ''))
        const res = await apiFetch('/api/images', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || `上传 ${file.name} 失败`)
      }
      setNotice(`已上传 ${imageFiles.length} 张类目参考图。`)
      await fetchCategory()
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传类目参考图失败')
    } finally {
      setUploading(false)
    }
  }

  const deleteImage = async (image: CategoryImage) => {
    if (!window.confirm(`确定删除图片「${image.display_name}」吗？`)) return
    const res = await apiFetch(`/api/images/${image.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '删除图片失败')
      return
    }
    await fetchCategory()
  }

  const generatePromptWithAi = async () => {
    if (!category) return
    setGeneratingPrompt(true)
    setError(null)
    setNotice(null)
    try {
      const roleLabel = DEFAULT_PROMPT_ROLES.find((role) => role.value === aiImageType)?.label || aiImageType
      const res = await apiFetch('/api/prompts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: category.id,
          product_type: category.name_zh,
          image_style: `${roleLabel}。${aiStyle}`.trim(),
          people_mode: aiPeople,
          display_method: aiScene,
          extra_info: aiNeed,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'AI 生成指令失败')

      const saveRes = await apiFetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: category.id,
          prompt_role: aiImageType,
          prompt_text: data.prompt_text,
        }),
      })
      const saveData = await saveRes.json().catch(() => null)
      if (!saveRes.ok) throw new Error(saveData?.error || '保存 AI 指令失败')

      setAiNeed('')
      setAiStyle('')
      setAiPeople('')
      setAiScene('')
      setNotice('AI 已生成并保存一条新指令。')
      await fetchCategory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 生成指令失败')
    } finally {
      setGeneratingPrompt(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(250,204,21,0.14),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(37,99,235,0.12),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_46%,#eef2f7_100%)]">
      <Navbar />
      <main className="mx-auto max-w-[1500px] px-5 py-10 sm:px-8">
        <Link href="/categories" className="mb-5 inline-flex rounded-2xl border border-slate-200 bg-white/85 px-4 py-2 text-sm font-semibold text-blue-600 shadow-sm hover:bg-white">返回类目列表</Link>
        <div className="mb-6 border-b border-slate-200 pb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Category prompts</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">{category ? `${category.icon} ${category.name_zh}` : '类目指令'}</h1>
          <p className="mt-2 text-sm text-slate-500">商品生成时会按顺序调用这里的指令。前 6 条建议对应主图、场景图、详情图。</p>
        </div>

        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}
        {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">{notice}</div>}

        <section className="mb-5 rounded-[1.4rem] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">类目参考图</h2>
              <p className="mt-1 text-sm text-slate-500">只用于“单纯图片生成”。商品生成不会读取这里的图片，只读取商品行里的原始参考图。</p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800 disabled:bg-slate-300"
            >
              {uploading ? '上传中...' : '上传图片'}
            </button>
          </div>
          <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(event) => uploadImages(Array.from(event.target.files || []))} />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              setDragActive(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragActive(false)
              uploadImages(Array.from(event.dataTransfer.files || []))
            }}
            className={`mb-4 cursor-pointer rounded-2xl border-2 border-dashed p-7 text-center transition-colors ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-blue-300 bg-blue-50/40 hover:bg-white'}`}
          >
            <div className="text-base font-semibold text-slate-900">拖入类目参考图，或点击从本地选择</div>
            <p className="mt-2 text-xs text-slate-500">这些图片会和本类目的指令交叉生成：图片数量 × 指令数量。</p>
          </div>
          {(category?.images || []).length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">暂无类目参考图。</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {(category?.images || []).map((image) => (
                <article key={image.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <img src={imageUrls[image.storage_path]} alt={image.display_name} className="aspect-square w-full rounded-xl object-cover" />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-slate-600" title={image.display_name}>{image.display_name}</p>
                    <button onClick={() => deleteImage(image)} className="text-xs font-semibold text-red-600 hover:text-red-800">删除</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          {(category?.prompts || []).map((prompt) => (
            <article key={prompt.id} className="rounded-[1.4rem] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-950 px-2 py-1 text-xs font-semibold text-white">P{prompt.prompt_number}</span>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    {DEFAULT_PROMPT_ROLES.find((role) => role.value === prompt.prompt_role)?.label || prompt.prompt_role || '自定义'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(prompt)} className="text-sm font-medium text-blue-600">编辑</button>
                  <button onClick={() => deletePrompt(prompt)} className="text-sm font-medium text-red-600">删除</button>
                </div>
              </div>
              {editingId === prompt.id ? (
                <div className="space-y-3">
                  <select value={editingRole} onChange={(e) => setEditingRole(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                    {DEFAULT_PROMPT_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                    <option value="custom">自定义</option>
                  </select>
                  <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} rows={8} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-6" />
                  <div className="flex gap-2">
                    <button onClick={updatePrompt} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">保存</button>
                    <button onClick={() => setEditingId(null)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">取消</button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{prompt.prompt_text}</p>
              )}
            </article>
          ))}
        </section>

        <section className="mt-5 rounded-[1.4rem] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
          <h2 className="text-sm font-semibold text-slate-900">新增指令</h2>
          <div className="mt-3 space-y-3">
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              {DEFAULT_PROMPT_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              <option value="custom">自定义</option>
            </select>
            <textarea value={newText} onChange={(e) => setNewText(e.target.value)} rows={6} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-6" placeholder="输入新图片指令" />
            <button onClick={addPrompt} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              添加指令
            </button>
          </div>
        </section>

        <section className="mt-5 rounded-[1.4rem] border border-blue-200/80 bg-blue-50/50 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.04)]">
          <h2 className="text-lg font-semibold text-slate-950">AI 自动生成新指令</h2>
          <p className="mt-1 text-sm text-slate-600">输入大致需求和图片类型，系统会结合类目特征、已有指令结构、规则模板和图片限制，让 Gemini 生成一条可直接保存的新指令。</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">图片类型</span>
              <select value={aiImageType} onChange={(event) => setAiImageType(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
                {DEFAULT_PROMPT_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                <option value="custom">自定义图</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">风格要求</span>
              <input value={aiStyle} onChange={(event) => setAiStyle(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="如高级、干净、日常使用场景、详情页排版" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">人物要求</span>
              <input value={aiPeople} onChange={(event) => setAiPeople(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="如不要人物 / 可出现手模 / 可出现模特使用" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">展示方式/场景</span>
              <input value={aiScene} onChange={(event) => setAiScene(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="如浴室台面、水感背景、成分卖点布局" />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-semibold text-slate-700">大致需求</span>
              <textarea value={aiNeed} onChange={(event) => setAiNeed(event.target.value)} rows={4} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder="写你想新增的指令方向，例如：生成一张适合马来市场的洗面奶商品详情图，包含短卖点文字但不要夸大功效。" />
            </label>
          </div>
          <button onClick={generatePromptWithAi} disabled={generatingPrompt} className="mt-4 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:bg-slate-300">
            {generatingPrompt ? 'AI 生成并保存中...' : 'AI 生成并保存指令'}
          </button>
        </section>
      </main>
    </div>
  )
}
