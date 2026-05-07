'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import SignedImage from '@/components/SignedImage'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { signStorageUrls } from '@/lib/signed-storage'
import { DEFAULT_PROMPT_ROLES } from '@/lib/types'
import type { Category, CategoryImage, CategoryPrompt } from '@/lib/types'
import { getCategoryDisplayName, pickText, useUiLanguage } from '@/lib/ui-language'

type CategoryDetail = Category & {
  prompts: CategoryPrompt[]
  images: CategoryImage[]
}

const roleLabelMap = {
  main: { zh: '主图', en: 'Main' },
  scene: { zh: '场景图', en: 'Scene' },
  detail: { zh: '详情图', en: 'Detail' },
  custom: { zh: '自定义', en: 'Custom' },
} as const

function promptRoleLabel(role: string | null | undefined, language: 'zh' | 'en') {
  const key = String(role || 'custom') as keyof typeof roleLabelMap
  const target = roleLabelMap[key] || roleLabelMap.custom
  return language === 'en' ? target.en : target.zh
}

export default function CategoryPromptPage() {
  const params = useParams()
  const router = useRouter()
  const { language } = useUiLanguage()
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
  const [aiImageType, setAiImageType] = useState('main')
  const [aiStyle, setAiStyle] = useState('')
  const [aiPeople, setAiPeople] = useState('')
  const [aiScene, setAiScene] = useState('')
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const text = {
    loading: pickText(language, { zh: '加载中...', en: 'Loading...' }),
    back: pickText(language, { zh: '返回类目列表', en: 'Back to categories' }),
    eyebrow: pickText(language, { zh: '类目指令', en: 'Category prompts' }),
    titleFallback: pickText(language, { zh: '类目指令', en: 'Category prompts' }),
    description: pickText(language, {
      zh: '商品生成时会按图片角色调用这里的指令。建议至少维护主图、场景图、详情图 3 类基础指令。',
      en: 'Product generation reads these prompts by image role. Keep at least the main, scene, and detail prompt groups.',
    }),
    referenceTitle: pickText(language, { zh: '类目参考图', en: 'Category reference images' }),
    referenceDescription: pickText(language, {
      zh: '只用于“单纯图片生成”。商品生成不会读取这里的图片，只读取商品行里的原始参考图。',
      en: 'These are only used for image-only generation. Product generation still reads the product-level source images.',
    }),
    upload: pickText(language, { zh: '上传图片', en: 'Upload images' }),
    uploading: pickText(language, { zh: '上传中...', en: 'Uploading...' }),
    uploadHintTitle: pickText(language, {
      zh: '拖入类目参考图，或点击从本地选择',
      en: 'Drag category reference images here or choose from your computer',
    }),
    uploadHintBody: pickText(language, {
      zh: '这些图片会和本类目的指令交叉生成：图片数量 × 指令数量。',
      en: 'These images are combined with this category’s prompts: image count × prompt count.',
    }),
    noImages: pickText(language, { zh: '暂无类目参考图。', en: 'No category reference images yet.' }),
    delete: pickText(language, { zh: '删除', en: 'Delete' }),
    edit: pickText(language, { zh: '编辑', en: 'Edit' }),
    save: pickText(language, { zh: '保存', en: 'Save' }),
    cancel: pickText(language, { zh: '取消', en: 'Cancel' }),
    addPrompt: pickText(language, { zh: '新增指令', en: 'Add prompt' }),
    addPromptButton: pickText(language, { zh: '添加指令', en: 'Add prompt' }),
    addPromptPlaceholder: pickText(language, { zh: '输入新图片指令', en: 'Enter a new image prompt' }),
    aiTitle: pickText(language, { zh: 'AI 自动生成新指令', en: 'Generate a new prompt with AI' }),
    aiDescription: pickText(language, {
      zh: '输入大致需求和图片类型，系统会结合类目特征与已有结构生成一条可直接保存的新指令。',
      en: 'Describe the target and image type, and the system will draft a new prompt that you can save directly.',
    }),
    imageType: pickText(language, { zh: '图片类型', en: 'Image type' }),
    style: pickText(language, { zh: '风格要求', en: 'Style notes' }),
    people: pickText(language, { zh: '人物要求', en: 'People notes' }),
    scene: pickText(language, { zh: '展示方式/场景', en: 'Scene / display notes' }),
    need: pickText(language, { zh: '大致需求', en: 'Prompt brief' }),
    stylePlaceholder: pickText(language, { zh: '如高级、干净、详情页排版', en: 'For example: premium, clean, ecommerce layout' }),
    peoplePlaceholder: pickText(language, { zh: '如不要人物 / 可出手模 / 可出模特', en: 'For example: no model, hand-only, lifestyle model allowed' }),
    scenePlaceholder: pickText(language, { zh: '如浴室台面、水感背景、成分卖点布局', en: 'For example: bathroom counter, watery background, ingredient-led layout' }),
    needPlaceholder: pickText(language, { zh: '写下你想新增的指令方向。', en: 'Describe the new prompt you want to add.' }),
    aiGenerate: pickText(language, { zh: 'AI 生成并保存指令', en: 'Generate and save prompt' }),
    aiGenerating: pickText(language, { zh: 'AI 生成并保存中...', en: 'Generating and saving...' }),
    updateError: pickText(language, { zh: '更新指令失败', en: 'Failed to update prompt' }),
    addError: pickText(language, { zh: '新增指令失败', en: 'Failed to add prompt' }),
    deleteError: pickText(language, { zh: '删除指令失败', en: 'Failed to delete prompt' }),
    loadError: pickText(language, { zh: '类目加载失败', en: 'Failed to load category' }),
    uploadError: pickText(language, { zh: '上传类目参考图失败', en: 'Failed to upload category images' }),
    deleteImageError: pickText(language, { zh: '删除图片失败', en: 'Failed to delete image' }),
    aiError: pickText(language, { zh: 'AI 生成指令失败', en: 'Failed to generate prompt with AI' }),
    uploadNotice: (count: number) => pickText(language, {
      zh: `已上传 ${count} 张类目参考图。`,
      en: `${count} category reference images uploaded.`,
    }),
    aiNotice: pickText(language, { zh: 'AI 已生成并保存一条新指令。', en: 'A new AI prompt has been generated and saved.' }),
    deletePromptConfirm: (number: number) => pickText(language, {
      zh: `确定删除 P${number} 吗？`,
      en: `Delete P${number}?`,
    }),
    deleteImageConfirm: (name: string) => pickText(language, {
      zh: `确定删除图片“${name}”吗？`,
      en: `Delete image "${name}"?`,
    }),
  }

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
      setError(data?.error || text.loadError)
      return
    }
    setCategory(data)
    setImageUrls(
      await signStorageUrls('images', (data.images || []).map((image: CategoryImage) => image.storage_path))
    )
  }, [categoryId, text.loadError])

  useEffect(() => {
    if (!loading) void fetchCategory()
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
      setError(data?.error || text.updateError)
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
      setError(data?.error || text.addError)
      return
    }
    setNewText('')
    setNewRole('custom')
    await fetchCategory()
  }

  const deletePrompt = async (prompt: CategoryPrompt) => {
    if (!window.confirm(text.deletePromptConfirm(prompt.prompt_number))) return
    const res = await apiFetch(`/api/prompts/${prompt.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || text.deleteError)
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
        if (!res.ok) throw new Error(data?.error || `${file.name} upload failed`)
      }
      setNotice(text.uploadNotice(imageFiles.length))
      await fetchCategory()
    } catch (err) {
      setError(err instanceof Error ? err.message : text.uploadError)
    } finally {
      setUploading(false)
    }
  }

  const deleteImage = async (image: CategoryImage) => {
    if (!window.confirm(text.deleteImageConfirm(image.display_name))) return
    const res = await apiFetch(`/api/images/${image.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || text.deleteImageError)
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
      const roleLabel = promptRoleLabel(aiImageType, 'en')
      const res = await apiFetch('/api/prompts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: category.id,
          product_type: getCategoryDisplayName(category, 'en'),
          image_style: `${roleLabel} ${aiStyle}`.trim(),
          people_mode: aiPeople,
          display_method: aiScene,
          extra_info: aiNeed,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || text.aiError)

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
      if (!saveRes.ok) throw new Error(saveData?.error || text.aiError)

      setAiNeed('')
      setAiStyle('')
      setAiPeople('')
      setAiScene('')
      setNotice(text.aiNotice)
      await fetchCategory()
    } catch (err) {
      setError(err instanceof Error ? err.message : text.aiError)
    } finally {
      setGeneratingPrompt(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">{text.loading}</div>
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(250,204,21,0.14),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(37,99,235,0.12),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_46%,#eef2f7_100%)]">
      <Navbar />
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        <Link href="/categories" className="mb-5 inline-flex rounded-2xl border border-slate-200 bg-white/85 px-4 py-2 text-sm font-semibold text-blue-600 shadow-sm hover:bg-white">
          {text.back}
        </Link>
        <div className="mb-6 border-b border-slate-200 pb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{text.eyebrow}</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">
            {category ? `${category.icon} ${getCategoryDisplayName(category, language)}` : text.titleFallback}
          </h1>
          <p className="mt-2 text-sm text-slate-500">{text.description}</p>
        </div>

        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}
        {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">{notice}</div>}

        <section className="mb-5 rounded-[1.4rem] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">{text.referenceTitle}</h2>
              <p className="mt-1 text-sm text-slate-500">{text.referenceDescription}</p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800 disabled:bg-slate-300"
            >
              {uploading ? text.uploading : text.upload}
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
              void uploadImages(Array.from(event.dataTransfer.files || []))
            }}
            className={`mb-4 cursor-pointer rounded-2xl border-2 border-dashed p-7 text-center transition-colors ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-blue-300 bg-blue-50/40 hover:bg-white'}`}
          >
            <div className="text-base font-semibold text-slate-900">{text.uploadHintTitle}</div>
            <p className="mt-2 text-xs text-slate-500">{text.uploadHintBody}</p>
          </div>
          {(category?.images || []).length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">{text.noImages}</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {(category?.images || []).map((image) => (
                <article key={image.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <SignedImage src={imageUrls[image.storage_path]} alt={image.display_name} width={320} height={320} className="aspect-square w-full rounded-xl object-cover" />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-slate-600" title={image.display_name}>{image.display_name}</p>
                    <button onClick={() => deleteImage(image)} className="text-xs font-semibold text-red-600 hover:text-red-800">{text.delete}</button>
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
                    {promptRoleLabel(prompt.prompt_role, language)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(prompt)} className="text-sm font-medium text-blue-600">{text.edit}</button>
                  <button onClick={() => deletePrompt(prompt)} className="text-sm font-medium text-red-600">{text.delete}</button>
                </div>
              </div>
              {editingId === prompt.id ? (
                <div className="space-y-3">
                  <select value={editingRole} onChange={(e) => setEditingRole(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                    {DEFAULT_PROMPT_ROLES.map((role) => (
                      <option key={role.value} value={role.value}>{promptRoleLabel(role.value, language)}</option>
                    ))}
                    <option value="custom">{promptRoleLabel('custom', language)}</option>
                  </select>
                  <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} rows={8} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-6" />
                  <div className="flex gap-2">
                    <button onClick={updatePrompt} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">{text.save}</button>
                    <button onClick={() => setEditingId(null)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">{text.cancel}</button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{prompt.prompt_text}</p>
              )}
            </article>
          ))}
        </section>

        <section className="mt-5 rounded-[1.4rem] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
          <h2 className="text-sm font-semibold text-slate-900">{text.addPrompt}</h2>
          <div className="mt-3 space-y-3">
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              {DEFAULT_PROMPT_ROLES.map((role) => (
                <option key={role.value} value={role.value}>{promptRoleLabel(role.value, language)}</option>
              ))}
              <option value="custom">{promptRoleLabel('custom', language)}</option>
            </select>
            <textarea value={newText} onChange={(e) => setNewText(e.target.value)} rows={6} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-6" placeholder={text.addPromptPlaceholder} />
            <button onClick={addPrompt} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              {text.addPromptButton}
            </button>
          </div>
        </section>

        <section className="mt-5 rounded-[1.4rem] border border-blue-200/80 bg-blue-50/50 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.04)]">
          <h2 className="text-lg font-semibold text-slate-950">{text.aiTitle}</h2>
          <p className="mt-1 text-sm text-slate-600">{text.aiDescription}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">{text.imageType}</span>
              <select value={aiImageType} onChange={(event) => setAiImageType(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
                {DEFAULT_PROMPT_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>{promptRoleLabel(role.value, language)}</option>
                ))}
                <option value="custom">{promptRoleLabel('custom', language)}</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">{text.style}</span>
              <input value={aiStyle} onChange={(event) => setAiStyle(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder={text.stylePlaceholder} />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">{text.people}</span>
              <input value={aiPeople} onChange={(event) => setAiPeople(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder={text.peoplePlaceholder} />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">{text.scene}</span>
              <input value={aiScene} onChange={(event) => setAiScene(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder={text.scenePlaceholder} />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-semibold text-slate-700">{text.need}</span>
              <textarea value={aiNeed} onChange={(event) => setAiNeed(event.target.value)} rows={4} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" placeholder={text.needPlaceholder} />
            </label>
          </div>
          <button onClick={generatePromptWithAi} disabled={generatingPrompt} className="mt-4 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:bg-slate-300">
            {generatingPrompt ? text.aiGenerating : text.aiGenerate}
          </button>
        </section>
      </main>
    </div>
  )
}
