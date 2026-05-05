'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { sanitizeListingText } from '@/lib/listing-text'
import type { ProductCopy, ProductCopyImage } from '@/lib/types'

const REGENERATION_PRESETS = ['更清晰', '更像主图', '不要改包装', '背景更干净']

type FileWritableLike = {
  write: (data: Blob) => Promise<void>
  close: () => Promise<void>
}

type FileHandleLike = {
  createWritable: () => Promise<FileWritableLike>
}

type DirectoryHandleLike = {
  getFileHandle: (name: string, options: { create: boolean }) => Promise<FileHandleLike>
}

type FilePickerWindow = Window & typeof globalThis & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: Array<{
      description: string
      accept: Record<string, string[]>
    }>
  }) => Promise<FileHandleLike>
  showDirectoryPicker?: () => Promise<DirectoryHandleLike>
}

function appendPreset(current: string, preset: string) {
  if (!current.trim()) return preset
  if (current.includes(preset)) return current
  return `${current.trim()}；${preset}`
}

function safeFilename(filename: string) {
  const cleaned = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
  return cleaned || 'output.png'
}

function imageStatusText(image: ProductCopyImage) {
  if (image.pending_storage_path) return '待确认新图'
  if (image.status === 'completed') return '已完成'
  if (image.status === 'generating') return '生成中'
  if (image.status === 'queued') return '排队中'
  if (image.status === 'failed') return '失败'
  return '需检查'
}

function imageStatusTone(image: ProductCopyImage) {
  if (image.pending_storage_path) return 'bg-amber-50 text-amber-700 ring-amber-100'
  if (image.status === 'completed') return 'bg-emerald-50 text-emerald-700 ring-emerald-100'
  if (image.status === 'failed') return 'bg-red-50 text-red-700 ring-red-100'
  return 'bg-blue-50 text-blue-700 ring-blue-100'
}

export default function ProductOutputDetailPage() {
  const params = useParams()
  const router = useRouter()
  const copyId = params.id as string
  const [loading, setLoading] = useState(true)
  const [copy, setCopy] = useState<ProductCopy | null>(null)
  const [outputUrls, setOutputUrls] = useState<Record<string, string>>({})
  const [sourceUrls, setSourceUrls] = useState<Record<string, string>>({})
  const [regenerationNotes, setRegenerationNotes] = useState<Record<string, string>>({})
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login')
      else setLoading(false)
    })
  }, [router])

  const fetchCopy = useCallback(async () => {
    const res = await apiFetch(`/api/product-copies/${copyId}`)
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '副本加载失败')
      return
    }

    setCopy(data)

    const outputPaths: string[] = Array.from(new Set<string>(
      (data.product_copy_images || []).flatMap((image: ProductCopyImage) => [
        image.output_storage_path,
        image.pending_storage_path,
        image.previous_storage_path,
      ].filter(Boolean) as string[])
    ))

    const outputSigned = await Promise.all(
      outputPaths.map(async (path) => {
        const { data: signed } = await supabase.storage.from('outputs').createSignedUrl(path, 60 * 60)
        return [path, signed?.signedUrl || ''] as const
      })
    )
    setOutputUrls(Object.fromEntries(outputSigned))

    const sourcePaths = (data.products?.images || [])
      .map((image: { storage_path?: string | null }) => image.storage_path)
      .filter(Boolean) as string[]

    const sourceSigned = await Promise.all(
      sourcePaths.map(async (path) => {
        const { data: signed } = await supabase.storage.from('images').createSignedUrl(path, 60 * 60)
        return [path, signed?.signedUrl || ''] as const
      })
    )
    setSourceUrls(Object.fromEntries(sourceSigned))
  }, [copyId])

  useEffect(() => {
    if (!loading) fetchCopy()
  }, [loading, fetchCopy])

  const images = useMemo(
    () => (copy?.product_copy_images || []).slice().sort((a, b) => a.prompt_number - b.prompt_number),
    [copy?.product_copy_images]
  )

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setNotice('已复制到剪贴板。')
  }

  const getOutputBlob = async (path: string) => {
    const { data } = await supabase.storage.from('outputs').createSignedUrl(path, 60 * 60)
    const signedUrl = data?.signedUrl || outputUrls[path]
    if (!signedUrl) throw new Error('图片下载链接生成失败')

    const response = await fetch(signedUrl)
    if (!response.ok) throw new Error('图片下载失败')
    return response.blob()
  }

  const triggerBrowserDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const downloadImage = async (path: string | null, filename: string | null) => {
    if (!path) return
    setError(null)
    setNotice(null)

    const resolvedFilename = safeFilename(filename || path.split('/').pop() || 'output.png')
    try {
      const blob = await getOutputBlob(path)
      const pickerWindow = window as FilePickerWindow

      if (pickerWindow.showSaveFilePicker) {
        try {
          const handle = await pickerWindow.showSaveFilePicker({
            suggestedName: resolvedFilename,
            types: [{ description: 'Image', accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'] } }],
          })
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
          setNotice('图片已保存到你选择的位置。')
          return
        } catch (pickerError) {
          if (pickerError instanceof DOMException && pickerError.name === 'AbortError') return
        }
      }

      triggerBrowserDownload(blob, resolvedFilename)
      setNotice('图片已开始下载；如果没有弹出选择位置，会保存到浏览器默认下载目录。')
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : '图片下载失败')
    }
  }

  const downloadAllImages = async () => {
    const completedImages = images.filter((image) => image.output_storage_path)
    if (completedImages.length === 0) return

    setError(null)
    setNotice(null)
    setDownloadingAll(true)
    try {
      const pickerWindow = window as FilePickerWindow

      if (pickerWindow.showDirectoryPicker) {
        try {
          const directory = await pickerWindow.showDirectoryPicker()
          for (const image of completedImages) {
            const path = image.output_storage_path
            if (!path) continue
            const filename = safeFilename(image.output_filename || `${copy?.sku || 'product'}_${copy?.language_label || ''}${copy?.copy_index || ''}_P${image.prompt_number}.png`)
            const blob = await getOutputBlob(path)
            const handle = await directory.getFileHandle(filename, { create: true })
            const writable = await handle.createWritable()
            await writable.write(blob)
            await writable.close()
          }
          setNotice(`已保存 ${completedImages.length} 张图片到你选择的文件夹。`)
          return
        } catch (pickerError) {
          if (pickerError instanceof DOMException && pickerError.name === 'AbortError') return
        }
      }

      for (const image of completedImages) {
        const path = image.output_storage_path
        if (!path) continue
        const filename = safeFilename(image.output_filename || `${copy?.sku || 'product'}_${copy?.language_label || ''}${copy?.copy_index || ''}_P${image.prompt_number}.png`)
        const blob = await getOutputBlob(path)
        triggerBrowserDownload(blob, filename)
        await new Promise((resolve) => setTimeout(resolve, 220))
      }
      setNotice('图片已开始下载；当前浏览器不支持直接选择文件夹，所以会保存到默认下载目录。')
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : '图片下载失败')
    } finally {
      setDownloadingAll(false)
    }
  }

  const retryImage = async (imageId: string) => {
    setBusyKey(`image-${imageId}`)
    setError(null)
    setNotice(null)

    const res = await apiFetch('/api/product-copy-images/retry', {
      method: 'POST',
      body: JSON.stringify({
        image_ids: [imageId],
        failed_only: false,
        regeneration_note: regenerationNotes[imageId] || '',
      }),
    })
    const data = await res.json().catch(() => null)

    if (!res.ok) {
      setError(data?.error || '图片重生失败')
    } else {
      setNotice('已提交单张图片重生任务，生成完成后会显示为待确认新图。')
      await fetchCopy()
    }
    setBusyKey(null)
  }

  const confirmPendingImage = async (imageId: string, action: 'accept' | 'discard') => {
    setBusyKey(`${action}-${imageId}`)
    setError(null)
    setNotice(null)

    const res = await apiFetch('/api/product-copy-images/confirm', {
      method: 'POST',
      body: JSON.stringify({ image_id: imageId, action }),
    })
    const data = await res.json().catch(() => null)

    if (!res.ok) {
      setError(data?.error || '图片确认失败')
    } else {
      setNotice(action === 'accept' ? '已保留新图。' : '已恢复旧图。')
      await fetchCopy()
    }
    setBusyKey(null)
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading...</div>
  }

  const product = copy?.products
  const category = product?.categories
  const cleanTitle = sanitizeListingText(copy?.generated_title)
  const cleanDescription = sanitizeListingText(copy?.generated_description)

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(250,204,21,0.14),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(37,99,235,0.12),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_46%,#eef2f7_100%)]">
      <Navbar />
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        <Link href="/product-outputs" className="mb-5 inline-flex rounded-2xl border border-slate-200 bg-white/85 px-4 py-2 text-sm font-semibold text-blue-600 shadow-sm hover:bg-white">返回副本列表</Link>

        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
        {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{notice}</div>}

        {!copy ? (
          <div className="rounded-[1.4rem] border border-slate-200 bg-white/88 p-12 text-center text-sm text-slate-500 shadow-sm">未找到副本。</div>
        ) : (
          <>
            <section className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Listing copy detail</p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <h1 className="text-4xl font-semibold tracking-tight text-slate-950">{copy.sku}</h1>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">{copy.language_label}{copy.copy_index}</span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">{copy.status}</span>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">SEO {copy.seo_score ?? 0}</span>
                </div>
                <p className="mt-2 text-sm text-slate-500">{category ? `${category.icon} ${category.name_zh}` : '未关联类目'} · {new Date(copy.created_at).toLocaleString()}</p>
              </div>
              <button
                onClick={downloadAllImages}
                disabled={downloadingAll || images.every((image) => !image.output_storage_path)}
                className="w-fit rounded-2xl bg-[linear-gradient(135deg,#071228,#0f172a)] px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-slate-950/18 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-300 disabled:shadow-none"
              >
                {downloadingAll ? '下载中...' : '下载全部图片'}
              </button>
            </section>

            <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
              <section className="space-y-4">
                <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">生成标题</h2>
                    <button onClick={() => copyText(cleanTitle)} className="text-xs font-medium text-blue-600">复制</button>
                  </div>
                  <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{cleanTitle || '待生成'}</p>
                </div>

                <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">生成描述</h2>
                    <button onClick={() => copyText(cleanDescription)} className="text-xs font-medium text-blue-600">复制</button>
                  </div>
                  <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{cleanDescription || '待生成'}</pre>
                </div>

                <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
                  <h2 className="mb-3 text-sm font-semibold text-slate-900">原始参考图</h2>
                  <div className="grid grid-cols-4 gap-2">
                    {(product?.images || []).map((image) => (
                      <img key={image.id} src={sourceUrls[image.storage_path]} alt={image.display_name} className="aspect-square rounded-xl border border-slate-200 object-cover shadow-sm" />
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-[1.4rem] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">生成图片</h2>
                    <p className="mt-1 text-xs text-slate-500">单张重生会先生成待确认新图，员工确认后才替换当前图。</p>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {images.map((image) => {
                    const note = regenerationNotes[image.id] || ''
                    return (
                      <article key={image.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-slate-800">P{image.prompt_number} · {image.prompt_role}</span>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${imageStatusTone(image)}`}>{imageStatusText(image)}</span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div>
                            <div className="mb-1 text-xs font-semibold text-slate-500">当前图</div>
                            <div className="aspect-square overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
                              {image.output_storage_path ? (
                                <img src={outputUrls[image.output_storage_path]} alt={image.output_filename || `P${image.prompt_number}`} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-400">暂无当前图</div>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="mb-1 text-xs font-semibold text-amber-600">待确认新图</div>
                            <div className="aspect-square overflow-hidden rounded-2xl bg-white ring-1 ring-amber-200">
                              {image.pending_storage_path ? (
                                <img src={outputUrls[image.pending_storage_path]} alt={`待确认 P${image.prompt_number}`} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-400">未生成新图</div>
                              )}
                            </div>
                          </div>
                        </div>

                        {image.error_message && <p className="mt-3 rounded-xl bg-red-50 p-2 text-xs leading-5 text-red-600">{image.error_message}</p>}

                        {image.pending_storage_path && (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              onClick={() => confirmPendingImage(image.id, 'accept')}
                              disabled={busyKey === `accept-${image.id}`}
                              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
                            >
                              保留新图
                            </button>
                            <button
                              onClick={() => confirmPendingImage(image.id, 'discard')}
                              disabled={busyKey === `discard-${image.id}`}
                              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:text-slate-300"
                            >
                              恢复旧图
                            </button>
                          </div>
                        )}

                        <div className="mt-4 space-y-2">
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
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-5 outline-none focus:border-blue-500"
                            placeholder="本次重生要求，例如：背景更干净，不要改包装，产品文字更清晰"
                          />
                          <div className="flex items-center justify-between gap-3">
                            <button
                              onClick={() => retryImage(image.id)}
                              disabled={busyKey === `image-${image.id}`}
                              className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 disabled:text-slate-300"
                            >
                              {busyKey === `image-${image.id}` ? '排队中...' : '只重生这一张'}
                            </button>
                            <button
                              onClick={() => downloadImage(image.output_storage_path, image.output_filename)}
                              disabled={!image.output_storage_path}
                              className="text-xs font-semibold text-blue-600 disabled:text-slate-300"
                            >
                              下载当前图
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
