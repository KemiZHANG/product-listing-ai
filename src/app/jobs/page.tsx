'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'
import type { Job, JobSnapshot, JobItem } from '@/lib/types'
import Navbar from '@/components/Navbar'
import ConfirmDialog from '@/components/ConfirmDialog'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  queued: { label: '排队中', color: 'text-yellow-800', bg: 'bg-yellow-100' },
  running: { label: '运行中', color: 'text-blue-800', bg: 'bg-blue-100' },
  completed: { label: '已完成', color: 'text-green-800', bg: 'bg-green-100' },
  failed: { label: '已失败', color: 'text-red-800', bg: 'bg-red-100' },
  partial_success: { label: '部分成功', color: 'text-orange-800', bg: 'bg-orange-100' },
  cancelled: { label: '已取消', color: 'text-gray-800', bg: 'bg-gray-100' },
  idle: { label: '空闲', color: 'text-gray-600', bg: 'bg-gray-50' },
}

const ITEM_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'text-yellow-700' },
  running: { label: '运行中', color: 'text-blue-700' },
  completed: { label: '已完成', color: 'text-green-700' },
  failed: { label: '失败', color: 'text-red-700' },
  cancelled: { label: '已取消', color: 'text-gray-500' },
}

function shortId(id: string) {
  return id.slice(0, 8)
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.color}`}>
      {config.label}
    </span>
  )
}

function ItemStatusBadge({ status }: { status: string }) {
  const config = ITEM_STATUS_CONFIG[status] ?? ITEM_STATUS_CONFIG.pending
  return (
    <span className={`text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  )
}

function isBatchMetaMessage(message: string | null | undefined) {
  return Boolean(message?.startsWith('__GEMINI_BATCH__'))
}

export default function JobsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<Job[]>([])
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [jobDetail, setJobDetail] = useState<Job | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [confirmJobId, setConfirmJobId] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const syncingRef = useRef(false)

  // Auth check
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/login')
      } else {
        setLoading(false)
      }
    })
  }, [router])

  // Fetch jobs list
  const syncActiveEngines = useCallback(async (activeJobs: Job[]) => {
    if (syncingRef.current || activeJobs.length === 0) return
    syncingRef.current = true
    try {
      await Promise.all(
        activeJobs.map((job) =>
          apiFetch('/api/engine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: job.id }),
          }).catch(() => null)
        )
      )
    } finally {
      syncingRef.current = false
    }
  }, [])

  const fetchJobs = useCallback(async (syncEngine = true) => {
    try {
      const res = await apiFetch('/api/jobs')
      if (res.ok) {
        const data = await res.json()
        setJobs(data)
        const activeJobs = data.filter((job: Job) => job.status === 'running' || job.status === 'queued')
        if (syncEngine && activeJobs.length > 0) {
          await syncActiveEngines(activeJobs)
          const refreshed = await apiFetch('/api/jobs')
          if (refreshed.ok) {
            setJobs(await refreshed.json())
          }
        }
      }
    } catch {
      // silent
    }
  }, [syncActiveEngines])

  useEffect(() => {
    if (!loading) {
      fetchJobs()
    }
  }, [loading, fetchJobs])

  // Fetch job detail
  const fetchJobDetail = useCallback(async (jobId: string) => {
    setDetailLoading(true)
    try {
      const res = await apiFetch(`/api/jobs/${jobId}`)
      if (res.ok) {
        const data = await res.json()
        setJobDetail(data)
      }
    } catch {
      // silent
    } finally {
      setDetailLoading(false)
    }
  }, [])

  // Auto-refresh when any job is running or queued
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'running' || j.status === 'queued')
    if (hasActive && !intervalRef.current) {
      intervalRef.current = setInterval(() => {
        fetchJobs()
        // Also refresh expanded detail if open
        if (expandedJobId) {
          fetchJobDetail(expandedJobId)
        }
      }, 10000)
    }
    if (!hasActive && intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [jobs, expandedJobId, fetchJobDetail, fetchJobs])

  const toggleExpand = (jobId: string) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null)
      setJobDetail(null)
    } else {
      setExpandedJobId(jobId)
      fetchJobDetail(jobId)
    }
  }

  // Cancel job
  const handleCancel = async () => {
    if (!confirmJobId) return
    setCancelling(confirmJobId)
    try {
      const res = await apiFetch(`/api/jobs/${confirmJobId}`, { method: 'DELETE' })
      if (res.ok) {
        await fetchJobs()
        if (expandedJobId === confirmJobId) {
          await fetchJobDetail(confirmJobId)
        }
      }
    } catch {
      // silent
    } finally {
      setCancelling(null)
      setConfirmJobId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-xl font-semibold text-gray-900">任务中心</h2>

        {jobs.length === 0 ? (
          <div className="rounded-lg bg-white p-12 text-center shadow-sm">
            <p className="text-gray-500">暂无任务。请在首页勾选类目后点击&quot;运行&quot;来创建任务。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const isExpanded = expandedJobId === job.id
              return (
                <div key={job.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  {/* Job header row */}
                  <button
                    onClick={() => toggleExpand(job.id)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-sm text-gray-500">#{shortId(job.id)}</span>
                      <StatusBadge status={job.status} />
                      <span className="text-sm text-gray-500">
                        {new Date(job.created_at).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-600">
                        进度: {job.completed_items}/{job.total_items}
                        {job.failed_items > 0 && (
                          <span className="ml-1 text-red-600">({job.failed_items} 失败)</span>
                        )}
                      </span>
                      <svg
                        className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 py-4">
                      {detailLoading ? (
                        <p className="py-4 text-center text-sm text-gray-500">加载详情中...</p>
                      ) : jobDetail ? (
                        <div className="space-y-6">
                          {/* Error message */}
                          {jobDetail.error_message && !isBatchMetaMessage(jobDetail.error_message) && (
                            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                              错误: {jobDetail.error_message}
                            </div>
                          )}

                          {/* Cancel button for active jobs */}
                          {(jobDetail.status === 'running' || jobDetail.status === 'queued') && (
                            <button
                              onClick={() => setConfirmJobId(job.id)}
                              disabled={cancelling === job.id}
                              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                              {cancelling === job.id ? '取消中...' : '取消任务'}
                            </button>
                          )}

                          {/* Snapshots */}
                          {jobDetail.snapshots && jobDetail.snapshots.length > 0 && (
                            <div>
                              <h4 className="mb-3 text-sm font-semibold text-gray-700">快照信息</h4>
                              <div className="space-y-4">
                                {jobDetail.snapshots.map((snap: JobSnapshot) => (
                                  <div key={snap.id} className="rounded-md border border-gray-200 p-4">
                                    <h5 className="mb-2 text-sm font-medium text-gray-900">
                                      {snap.category_name_zh} <span className="text-xs text-gray-400">({snap.category_slug})</span>
                                    </h5>
                                    {/* Frozen prompts */}
                                    <div className="mb-3">
                                      <p className="mb-1 text-xs font-medium text-gray-500">冻结 Prompts:</p>
                                      <ul className="space-y-1">
                                        {snap.snapshot_prompts.map((p) => (
                                          <li key={p.number} className="text-xs text-gray-600">
                                            <span className="font-medium">P{p.number}:</span> {p.text}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                    {/* Images */}
                                    <div>
                                      <p className="mb-1 text-xs font-medium text-gray-500">图片:</p>
                                      <div className="flex flex-wrap gap-2">
                                        {snap.snapshot_images.map((img) => (
                                          <span
                                            key={img.id}
                                            className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                                          >
                                            {img.display_name}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Job Items */}
                          {jobDetail.items && jobDetail.items.length > 0 && (
                            <div>
                              <h4 className="mb-3 text-sm font-semibold text-gray-700">
                                任务项 ({jobDetail.items.length})
                              </h4>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                  <thead>
                                    <tr className="border-b border-gray-200 text-xs text-gray-500">
                                      <th className="pb-2 pr-4 font-medium">状态</th>
                                      <th className="pb-2 pr-4 font-medium">图片</th>
                                      <th className="pb-2 pr-4 font-medium">Prompt</th>
                                      <th className="pb-2 font-medium">错误信息</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {jobDetail.items.map((item: JobItem) => (
                                      <tr key={item.id}>
                                        <td className="py-2 pr-4">
                                          <ItemStatusBadge status={item.status} />
                                        </td>
                                        <td className="py-2 pr-4 text-gray-700">{item.image_display_name}</td>
                                        <td className="py-2 pr-4 text-gray-600">P{item.prompt_number}</td>
                                        <td className="py-2 text-xs text-red-600">
                                          {item.error_message ?? '-'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="py-4 text-center text-sm text-gray-500">无法加载详情</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Cancel confirmation */}
      <ConfirmDialog
        isOpen={confirmJobId !== null}
        title="取消任务"
        message="确定要取消此任务吗？未处理的任务项将被标记为已取消。"
        onConfirm={handleCancel}
        onCancel={() => setConfirmJobId(null)}
      />
    </div>
  )
}
