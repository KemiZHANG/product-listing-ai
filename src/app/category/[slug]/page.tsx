'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'
import Navbar from '@/components/Navbar'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { Category, CategoryPrompt, CategoryImage } from '@/lib/types'

interface CategoryDetail extends Category {
  prompts: CategoryPrompt[]
  images: CategoryImage[]
}

export default function CategoryDetailPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [category, setCategory] = useState<CategoryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})

  // Prompt editing state
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null)
  const [editingPromptText, setEditingPromptText] = useState('')
  const [addingPrompt, setAddingPrompt] = useState(false)
  const [newPromptText, setNewPromptText] = useState('')

  // Expanded prompts (for long text)
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set())

  // Image upload state
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Image name editing
  const [editingImageId, setEditingImageId] = useState<string | null>(null)
  const [editingImageName, setEditingImageName] = useState('')

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  // Job running state
  const [runningJob, setRunningJob] = useState(false)

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push('/login')
        return
      }
      setUserId(data.user.id)
    })
  }, [router])

  // Fetch category data
  const fetchCategory = useCallback(async () => {
    if (!userId) return
    const cacheKey = `nano-banana:category:${slug}`
    const cached = window.sessionStorage.getItem(cacheKey)
    let hasCachedCategory = false
    if (cached) {
      try {
        const cachedDetail: CategoryDetail = JSON.parse(cached)
        setCategory(cachedDetail)
        setLoading(false)
        hasCachedCategory = true
      } catch {
        window.sessionStorage.removeItem(cacheKey)
      }
    }

    if (!hasCachedCategory) {
      setLoading(true)
    }
    try {
      const detailRes = await apiFetch(`/api/categories/slug/${slug}`)
      if (detailRes.status === 404) {
        router.push('/')
        return
      }
      if (!detailRes.ok) throw new Error('Failed to fetch category detail')
      const detail: CategoryDetail = await detailRes.json()
      setCategory(detail)
      window.sessionStorage.setItem(cacheKey, JSON.stringify(detail))
      const signedUrls = await Promise.all(
        detail.images.map(async (image) => {
          const { data } = await supabase.storage
            .from('images')
            .createSignedUrl(image.storage_path, 60 * 60)
          return [image.storage_path, data?.signedUrl ?? ''] as const
        })
      )
      setImageUrls(Object.fromEntries(signedUrls))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [userId, slug, router])

  useEffect(() => {
    fetchCategory()
  }, [fetchCategory])

  // --- Prompt operations ---

  const handleAddPrompt = async () => {
    if (!category || !newPromptText.trim()) return
    try {
      const res = await apiFetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: category.id, prompt_text: newPromptText.trim() }),
      })
      if (!res.ok) throw new Error('Failed to add prompt')
      setNewPromptText('')
      setAddingPrompt(false)
      window.sessionStorage.removeItem(`nano-banana:category:${slug}`)
      await fetchCategory()
    } catch (err) {
      console.error(err)
    }
  }

  const handleUpdatePrompt = async (promptId: string) => {
    if (!editingPromptText.trim()) return
    try {
      const res = await apiFetch(`/api/prompts/${promptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_text: editingPromptText.trim() }),
      })
      if (!res.ok) throw new Error('Failed to update prompt')
      setEditingPromptId(null)
      setEditingPromptText('')
      window.sessionStorage.removeItem(`nano-banana:category:${slug}`)
      await fetchCategory()
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeletePrompt = (prompt: CategoryPrompt) => {
    setConfirmDialog({
      isOpen: true,
      title: '删除提示词',
      message: `确定要删除 P${prompt.prompt_number} 吗？此操作不可撤销。`,
      onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/prompts/${prompt.id}`, { method: 'DELETE' })
          if (!res.ok) throw new Error('Failed to delete prompt')
          window.sessionStorage.removeItem(`nano-banana:category:${slug}`)
          await fetchCategory()
        } catch (err) {
          console.error(err)
        }
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
      },
    })
  }

  const startEditPrompt = (prompt: CategoryPrompt) => {
    setEditingPromptId(prompt.id)
    setEditingPromptText(prompt.prompt_text)
  }

  const cancelEditPrompt = () => {
    setEditingPromptId(null)
    setEditingPromptText('')
  }

  const togglePromptExpand = (id: string) => {
    setExpandedPrompts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // --- Image operations ---

  const handleUpload = async (files: FileList | File[]) => {
    if (!category || files.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('category_id', category.id)
        const res = await apiFetch('/api/images', { method: 'POST', body: formData })
        if (!res.ok) {
          const err = await res.json()
          console.error('Upload failed for', file.name, err.error)
        }
      }
      window.sessionStorage.removeItem(`nano-banana:category:${slug}`)
      await fetchCategory()
    } catch (err) {
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files)
    }
  }

  const handleFileBrowse = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files)
      e.target.value = ''
    }
  }

  const handleUpdateImageName = async (imageId: string) => {
    if (!editingImageName.trim()) return
    try {
      const res = await apiFetch(`/api/images/${imageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: editingImageName.trim() }),
      })
      if (!res.ok) throw new Error('Failed to update image')
      setEditingImageId(null)
      setEditingImageName('')
      window.sessionStorage.removeItem(`nano-banana:category:${slug}`)
      await fetchCategory()
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteImage = (image: CategoryImage) => {
    setConfirmDialog({
      isOpen: true,
      title: '删除图片',
      message: `确定要删除 "${image.display_name}" 吗？此操作不可撤销。`,
      onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/images/${image.id}`, { method: 'DELETE' })
          if (!res.ok) throw new Error('Failed to delete image')
          window.sessionStorage.removeItem(`nano-banana:category:${slug}`)
          await fetchCategory()
        } catch (err) {
          console.error(err)
        }
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
      },
    })
  }

  const startEditImage = (image: CategoryImage) => {
    setEditingImageId(image.id)
    setEditingImageName(image.display_name)
  }

  const cancelEditImage = () => {
    setEditingImageId(null)
    setEditingImageName('')
  }

  // Get signed URL for image thumbnail
  const getImageUrl = (storagePath: string) => {
    return imageUrls[storagePath] || ''
  }

  // --- Run job ---

  const handleRunCategory = async () => {
    if (!category) return
    setRunningJob(true)
    try {
      const res = await apiFetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_ids: [category.id] }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || '创建任务失败')
        return
      }
      router.push('/jobs')
    } catch (err) {
      console.error(err)
      alert('创建任务失败')
    } finally {
      setRunningJob(false)
    }
  }

  // --- Render ---

  if (loading || !category) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="text-gray-500">加载中...</div>
        </div>
      </div>
    )
  }

  const prompts = category.prompts || []
  const images = category.images || []

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Header */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            &larr; 返回仪表盘
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column - Prompt Management */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                提示词管理
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                共 {prompts.length} 个提示词
              </p>
            </div>

            <div className="p-4 space-y-3 max-h-[calc(100vh-320px)] overflow-y-auto">
              {prompts.map((prompt) => (
                <div
                  key={prompt.id}
                  className="rounded-lg border border-gray-200 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      P{prompt.prompt_number}
                    </span>
                    <div className="flex gap-1">
                      {editingPromptId === prompt.id ? (
                        <>
                          <button
                            onClick={() => handleUpdatePrompt(prompt.id)}
                            className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 transition-colors"
                          >
                            保存
                          </button>
                          <button
                            onClick={cancelEditPrompt}
                            className="rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEditPrompt(prompt)}
                            className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDeletePrompt(prompt)}
                            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                          >
                            删除
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {editingPromptId === prompt.id ? (
                    <textarea
                      value={editingPromptText}
                      onChange={(e) => setEditingPromptText(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-y min-h-[80px]"
                      rows={3}
                      autoFocus
                    />
                  ) : (
                    <div>
                      <p
                        className={`text-sm text-gray-700 whitespace-pre-wrap ${
                          !expandedPrompts.has(prompt.id) && prompt.prompt_text.length > 120
                            ? 'line-clamp-3'
                            : ''
                        }`}
                      >
                        {prompt.prompt_text}
                      </p>
                      {prompt.prompt_text.length > 120 && (
                        <button
                          onClick={() => togglePromptExpand(prompt.id)}
                          className="mt-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          {expandedPrompts.has(prompt.id) ? '收起' : '展开全部'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {prompts.length === 0 && !addingPrompt && (
                <div className="py-8 text-center text-sm text-gray-400">
                  暂无提示词
                </div>
              )}

              {/* Add prompt form */}
              {addingPrompt ? (
                <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-blue-600">
                      新提示词 (P{prompts.length + 1})
                    </span>
                  </div>
                  <textarea
                    value={newPromptText}
                    onChange={(e) => setNewPromptText(e.target.value)}
                    placeholder="输入提示词内容..."
                    className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-y min-h-[80px]"
                    rows={3}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddPrompt}
                      disabled={!newPromptText.trim()}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => {
                        setAddingPrompt(false)
                        setNewPromptText('')
                      }}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingPrompt(true)}
                  className="w-full rounded-lg border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  + 添加提示词
                </button>
              )}
            </div>
          </div>

          {/* Middle Column - Image Management */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                图片管理
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                共 {images.length} 张图片
              </p>
            </div>

            <div className="p-4 space-y-4 max-h-[calc(100vh-320px)] overflow-y-auto">
              {/* Upload zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                  dragOver
                    ? 'border-blue-400 bg-blue-50'
                    : uploading
                      ? 'border-gray-200 bg-gray-50'
                      : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileBrowse}
                  className="hidden"
                />
                {uploading ? (
                  <div className="text-sm text-gray-500">
                    <div className="mb-1 inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                    <div>上传中...</div>
                  </div>
                ) : (
                  <>
                    <div className="mb-1 text-2xl">📷</div>
                    <div className="text-sm font-medium text-gray-700">
                      拖拽图片到此处或点击上传
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      支持 JPG、PNG、WebP 等格式，可多选
                    </div>
                  </>
                )}
              </div>

              {/* Image list */}
              {images.map((image) => (
                <div
                  key={image.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 p-3"
                >
                  {/* Thumbnail */}
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-gray-100">
                    <img
                      src={getImageUrl(image.storage_path)}
                      alt={image.display_name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-gray-400 truncate" title={image.original_filename}>
                      {image.original_filename}
                    </div>
                    {editingImageId === image.id ? (
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          type="text"
                          value={editingImageName}
                          onChange={(e) => setEditingImageName(e.target.value)}
                          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateImageName(image.id)
                            if (e.key === 'Escape') cancelEditImage()
                          }}
                        />
                        <button
                          onClick={() => handleUpdateImageName(image.id)}
                          className="rounded px-1.5 py-1 text-xs text-green-600 hover:bg-green-50"
                        >
                          保存
                        </button>
                        <button
                          onClick={cancelEditImage}
                          className="rounded px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-100"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <div className="mt-0.5 flex items-center gap-1">
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {image.display_name}
                        </span>
                        <button
                          onClick={() => startEditImage(image)}
                          className="shrink-0 text-xs text-blue-600 hover:text-blue-800"
                        >
                          编辑
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteImage(image)}
                    className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="删除图片"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}

              {images.length === 0 && (
                <div className="py-8 text-center text-sm text-gray-400">
                  暂无图片，请上传
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Stats & Actions */}
          <div className="space-y-6">
            {/* Category info */}
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-5 py-4">
                <h2 className="text-base font-semibold text-gray-900">
                  分类信息
                </h2>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{category.icon}</span>
                  <div>
                    <div className="text-lg font-semibold text-gray-900">
                      {category.name_zh}
                    </div>
                    <div className="text-sm text-gray-500">
                      {category.slug}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-gray-50 p-3 text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {prompts.length}
                    </div>
                    <div className="text-xs text-gray-500">提示词</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {images.length}
                    </div>
                    <div className="text-xs text-gray-500">图片</div>
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {prompts.length * images.length}
                  </div>
                  <div className="text-xs text-gray-500">任务总数 (提示词 x 图片)</div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-5 py-4">
                <h2 className="text-base font-semibold text-gray-900">
                  操作
                </h2>
              </div>
              <div className="p-5 space-y-3">
                <button
                  onClick={handleRunCategory}
                  disabled={runningJob || prompts.length === 0 || images.length === 0}
                  className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {runningJob ? '创建中...' : '运行此分类'}
                </button>
                {prompts.length === 0 && (
                  <p className="text-xs text-amber-600 text-center">
                    请先添加至少一个提示词
                  </p>
                )}
                {images.length === 0 && prompts.length > 0 && (
                  <p className="text-xs text-amber-600 text-center">
                    请先上传至少一张图片
                  </p>
                )}
                <Link
                  href="/"
                  className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  返回仪表盘
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}
