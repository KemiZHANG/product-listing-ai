'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'

type DashboardData = {
  stats: {
    today_products: number
    today_copy_success: number
    today_copy_failed: number
    image_failed: number
    not_listed: number
    listed: number
  }
  progress: Record<string, Record<string, number>>
  active_copies: Array<{
    id: string
    sku: string
    status: string
    language_label?: string
    copy_index?: number
    created_at: string
  }>
  failed_copies: Array<{
    id: string
    sku: string
    language_label?: string
    copy_index?: number
    error_message?: string | null
  }>
  failed_images: Array<{
    id: string
    copy_id: string
    prompt_number: number
    prompt_role: string
    error_message?: string | null
    product_copies?: { sku?: string } | null
  }>
}

const statCards = [
  { key: 'today_products', label: '今日新增商品', hint: '今天录入的新 SKU', accent: 'from-sky-500 to-blue-600' },
  { key: 'today_copy_success', label: '今日生成成功', hint: '今天完成的副本', accent: 'from-emerald-500 to-teal-600' },
  { key: 'today_copy_failed', label: '今日生成失败', hint: '需要重试或检查', accent: 'from-red-500 to-rose-600' },
  { key: 'image_failed', label: '图片失败', hint: '可批量重试', accent: 'from-orange-500 to-red-500' },
  { key: 'not_listed', label: '待上品', hint: '员工下一步要处理', accent: 'from-amber-400 to-yellow-600' },
  { key: 'listed', label: '已上品', hint: '已标记上架', accent: 'from-indigo-500 to-slate-700' },
] as const

const statusLabels: Record<string, string> = {
  queued: '排队中',
  generating: '生成中',
  completed: '已完成',
  failed: '失败',
  needs_review: '待确认',
}

const progressLabels: Record<string, string> = {
  products: '商品',
  copies: '副本',
  images: '图片任务',
}

const progressHints: Record<string, string> = {
  products: '按商品 SKU 统计',
  copies: '按生成出来的商品副本统计',
  images: '按实际图片任务统计：每个副本会根据勾选生成 1 到 3 张图，旧数据可能仍包含历史 6 图任务',
}

function statusTone(status: string) {
  if (status === 'failed') return 'bg-red-50 text-red-700 ring-red-100'
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 ring-emerald-100'
  if (status === 'generating') return 'bg-blue-50 text-blue-700 ring-blue-100'
  return 'bg-amber-50 text-amber-700 ring-amber-100'
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-slate-50/80 p-4 text-sm text-slate-500 ring-1 ring-slate-200/70">{children}</div>
}

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: authData }) => {
      if (!authData.user) router.replace('/login')
      else setLoading(false)
    })
  }, [router])

  const fetchDashboard = useCallback(async () => {
    setError(null)
    const res = await apiFetch('/api/dashboard')
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      setError(json?.error || '工作台加载失败')
      return
    }
    setData(json)
  }, [])

  useEffect(() => {
    if (!loading) fetchDashboard()
  }, [loading, fetchDashboard])

  if (loading) {
    return <div className="app-shell flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>
  }

  return (
    <div className="app-shell min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-[1700px] px-4 py-6 sm:px-6">
        <section className="hero-panel mb-5 rounded-[1.75rem] p-5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="hero-kicker text-sm font-semibold uppercase">Operations dashboard</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">运营工作台总览</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
                一页看清今天新增、生成状态、失败图片和上品进度。员工进来先处理失败和待上品，不用在多个页面来回找。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={fetchDashboard} className="command-card rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5">
                刷新数据
              </button>
              <Link href="/product-outputs" className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-black/20 transition duration-200 hover:-translate-y-0.5 hover:bg-sky-50">
                去处理副本
              </Link>
            </div>
          </div>
        </section>

        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 shadow-sm">{error}</div>}

        {data && (
          <>
            <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              {statCards.map((card) => (
                <div key={card.key} className="glass-surface soft-lift rounded-[1.15rem] p-4">
                  <div className={`mb-3 h-1.5 w-10 rounded-full bg-gradient-to-r ${card.accent}`} />
                  <div className="text-sm font-semibold text-slate-500">{card.label}</div>
                  <div className="metric-number mt-2 text-3xl font-semibold tracking-tight text-slate-950">{data.stats[card.key]}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{card.hint}</div>
                </div>
              ))}
            </section>

            <section className="mb-4 grid gap-4 xl:grid-cols-3">
              {Object.entries(data.progress).map(([group, values]) => (
                <div key={group} className="glass-surface soft-lift rounded-[1.15rem] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">{progressLabels[group] || group}生成进度</h2>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{progressHints[group]}</p>
                    </div>
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">Live</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {Object.entries(values).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between rounded-2xl bg-slate-50/90 px-4 py-3 ring-1 ring-slate-200/70">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusTone(status)}`}>{statusLabels[status] || status}</span>
                        <span className="metric-number text-xl font-semibold text-slate-950">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <div className="glass-surface rounded-[1.15rem] p-4">
                <h2 className="text-lg font-semibold text-slate-950">正在生成</h2>
                <div className="mt-4 space-y-3">
                  {data.active_copies.length === 0 && <EmptyState>暂无排队或生成中的副本。</EmptyState>}
                  {data.active_copies.map((copy) => (
                    <Link key={copy.id} href={`/product-outputs/${copy.id}`} className="soft-lift block rounded-2xl border border-slate-200 bg-slate-50/90 p-4 hover:bg-blue-50/50">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-sm font-semibold text-slate-900">{copy.sku}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusTone(copy.status)}`}>{statusLabels[copy.status] || copy.status}</span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">{copy.language_label}{copy.copy_index} · {new Date(copy.created_at).toLocaleString()}</div>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="glass-surface rounded-[1.15rem] p-4">
                <h2 className="text-lg font-semibold text-slate-950">失败副本</h2>
                <div className="mt-4 space-y-3">
                  {data.failed_copies.length === 0 && <EmptyState>暂无失败副本。</EmptyState>}
                  {data.failed_copies.map((copy) => (
                    <Link key={copy.id} href={`/product-outputs/${copy.id}`} className="soft-lift block rounded-2xl border border-red-100 bg-red-50/70 p-4 hover:border-red-300">
                      <div className="font-mono text-sm font-semibold text-slate-900">{copy.sku} · {copy.language_label}{copy.copy_index}</div>
                      <div className="mt-2 line-clamp-2 text-xs leading-5 text-red-700">{copy.error_message || '未记录失败原因'}</div>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="glass-surface rounded-[1.15rem] p-4">
                <h2 className="text-lg font-semibold text-slate-950">失败图片</h2>
                <div className="mt-4 space-y-3">
                  {data.failed_images.length === 0 && <EmptyState>暂无失败图片。</EmptyState>}
                  {data.failed_images.map((image) => (
                    <Link key={image.id} href={`/product-outputs/${image.copy_id}`} className="soft-lift block rounded-2xl border border-red-100 bg-red-50/70 p-4 hover:border-red-300">
                      <div className="font-mono text-sm font-semibold text-slate-900">{image.product_copies?.sku || image.copy_id}</div>
                      <div className="mt-1 text-xs text-slate-500">P{image.prompt_number} · {image.prompt_role}</div>
                      <div className="mt-2 line-clamp-2 text-xs leading-5 text-red-700">{image.error_message || '未记录失败原因'}</div>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
