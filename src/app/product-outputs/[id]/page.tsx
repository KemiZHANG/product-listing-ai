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

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading...</div>
  }

  const product = copy?.products
  const category = product?.categories

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/product-outputs" className="mb-4 inline-block text-sm font-medium text-blue-600">返回副本列表</Link>

        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {!copy ? (
          <div className="border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm">未找到副本。</div>
        ) : (
          <>
            <section className="mb-5 border-b border-slate-200 pb-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Listing copy detail</p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold text-slate-950">{copy.sku}</h1>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{copy.language_label}{copy.copy_index}</span>
                <span className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{copy.status}</span>
              </div>
              <p className="mt-2 text-sm text-slate-500">{category ? `${category.icon} ${category.name_zh}` : '未关联类目'} · {new Date(copy.created_at).toLocaleString()}</p>
            </section>

            <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
              <section className="space-y-4">
                <div className="border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">生成标题</h2>
                    <button onClick={() => copyText(copy.generated_title)} className="text-xs font-medium text-blue-600">复制</button>
                  </div>
                  <p className="rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">{copy.generated_title || '待生成'}</p>
                </div>

                <div className="border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">生成描述</h2>
                    <button onClick={() => copyText(copy.generated_description)} className="text-xs font-medium text-blue-600">复制</button>
                  </div>
                  <pre className="max-h-[520px] whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">{copy.generated_description || '待生成'}</pre>
                </div>

                <div className="border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold text-slate-900">原始参考图</h2>
                  <div className="grid grid-cols-4 gap-2">
                    {(product?.images || []).map((image) => (
                      <img key={image.id} src={sourceUrls[image.storage_path]} alt={image.display_name} className="aspect-square rounded border border-slate-200 object-cover" />
                    ))}
                  </div>
                </div>
              </section>

              <section className="border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold text-slate-900">生成图片</h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {(copy.product_copy_images || []).sort((a, b) => a.prompt_number - b.prompt_number).map((image) => (
                    <article key={image.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="aspect-square overflow-hidden rounded bg-white">
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
