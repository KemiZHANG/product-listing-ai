'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { ProductCopy } from '@/lib/types'

export default function ProductOutputDetailPage() {
  const params = useParams()
  const router = useRouter()
  const copyId = params.id as string
  const [loading, setLoading] = useState(true)
  const [copy, setCopy] = useState<ProductCopy | null>(null)
  const [outputUrls, setOutputUrls] = useState<Record<string, string>>({})
  const [sourceUrls, setSourceUrls] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
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

    const outputPaths = (data.product_copy_images || [])
      .map((image: { output_storage_path?: string | null }) => image.output_storage_path)
      .filter(Boolean)
    const outputSigned = await Promise.all(
      outputPaths.map(async (path: string) => {
        const { data: signed } = await supabase.storage.from('outputs').createSignedUrl(path, 60 * 60)
        return [path, signed?.signedUrl || ''] as const
      })
    )
    setOutputUrls(Object.fromEntries(outputSigned))

    const sourcePaths = (data.products?.images || [])
      .map((image: { storage_path?: string | null }) => image.storage_path)
      .filter(Boolean)
    const sourceSigned = await Promise.all(
      sourcePaths.map(async (path: string) => {
        const { data: signed } = await supabase.storage.from('images').createSignedUrl(path, 60 * 60)
        return [path, signed?.signedUrl || ''] as const
      })
    )
    setSourceUrls(Object.fromEntries(sourceSigned))
  }, [copyId])

  useEffect(() => {
    if (!loading) fetchCopy()
  }, [loading, fetchCopy])

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  const downloadImage = async (path: string | null, filename: string | null) => {
    if (!path) return
    const { data } = await supabase.storage.from('outputs').createSignedUrl(path, 60 * 60)
    const link = document.createElement('a')
    link.href = data?.signedUrl || outputUrls[path] || ''
    link.download = filename || path.split('/').pop() || 'output.png'
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const downloadAllImages = async () => {
    const images = (copy?.product_copy_images || [])
      .filter((image) => image.output_storage_path)
      .sort((a, b) => a.prompt_number - b.prompt_number)

    if (images.length === 0) return

    setDownloadingAll(true)
    try {
      for (const image of images) {
        await downloadImage(
          image.output_storage_path,
          image.output_filename || `${copy?.sku || 'product'}_${copy?.language_label || ''}${copy?.copy_index || ''}_P${image.prompt_number}.png`
        )
        await new Promise((resolve) => setTimeout(resolve, 180))
      }
    } finally {
      setDownloadingAll(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading...</div>
  }

  const product = copy?.products
  const category = product?.categories

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(250,204,21,0.14),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(37,99,235,0.12),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_46%,#eef2f7_100%)]">
      <Navbar />
      <main className="mx-auto max-w-[1500px] px-5 py-10 sm:px-8">
        <Link href="/product-outputs" className="mb-5 inline-flex rounded-2xl border border-slate-200 bg-white/85 px-4 py-2 text-sm font-semibold text-blue-600 shadow-sm hover:bg-white">返回副本列表</Link>

        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
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
                </div>
                <p className="mt-2 text-sm text-slate-500">{category ? `${category.icon} ${category.name_zh}` : '未关联类目'} · {new Date(copy.created_at).toLocaleString()}</p>
              </div>
              <button
                onClick={downloadAllImages}
                disabled={downloadingAll || !(copy.product_copy_images || []).some((image) => image.output_storage_path)}
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
                    <button onClick={() => copyText(copy.generated_title)} className="text-xs font-medium text-blue-600">复制</button>
                  </div>
                  <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{copy.generated_title || '待生成'}</p>
                </div>

                <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">生成描述</h2>
                    <button onClick={() => copyText(copy.generated_description)} className="text-xs font-medium text-blue-600">复制</button>
                  </div>
                  <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{copy.generated_description || '待生成'}</pre>
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
                <h2 className="mb-4 text-sm font-semibold text-slate-900">生成图片</h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {(copy.product_copy_images || []).sort((a, b) => a.prompt_number - b.prompt_number).map((image) => (
                    <article key={image.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 shadow-sm">
                      <div className="aspect-square overflow-hidden rounded-2xl bg-white">
                        {image.output_storage_path ? (
                          <img src={outputUrls[image.output_storage_path]} alt={image.output_filename || `P${image.prompt_number}`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-400">
                            P{image.prompt_number} {image.status}
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-600">P{image.prompt_number} · {image.status}</span>
                        <button
                          onClick={() => downloadImage(image.output_storage_path, image.output_filename)}
                          disabled={!image.output_storage_path}
                          className="text-xs font-medium text-blue-600 disabled:text-slate-300"
                        >
                          下载
                        </button>
                      </div>
                      {image.error_message && <p className="mt-2 text-xs text-red-600">{image.error_message}</p>}
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
