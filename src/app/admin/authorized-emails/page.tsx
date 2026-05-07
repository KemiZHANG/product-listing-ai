'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { isAdminEmail, isPrimaryAdminEmail } from '@/lib/admin'
import { supabase } from '@/lib/supabase'

type Authorization = {
  id: string
  email: string
  active: boolean
  note: string | null
  created_at: string
  updated_at: string
  revoked_at: string | null
}

export default function AuthorizedEmailsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authorizations, setAuthorizations] = useState<Authorization[]>([])
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const fetchAuthorizations = useCallback(async () => {
    const res = await apiFetch('/api/admin/authorized-emails')
    const data = await res.json()

    if (!res.ok) {
      setMessage({
        type: 'error',
        text: data.migrationRequired
          ? '授权邮箱数据表还没有安装。请先在 Supabase SQL Editor 执行 supabase/builtin_key_authorizations.sql。'
          : data.error || '加载授权邮箱失败',
      })
      setAuthorizations([])
      return
    }

    setAuthorizations(data.authorizations || [])
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const userEmail = data.user?.email || null
      if (!data.user) {
        router.replace('/login')
        return
      }

      if (!isAdminEmail(userEmail)) {
        router.replace('/')
        return
      }

      await fetchAuthorizations()
      setLoading(false)
    })
  }, [fetchAuthorizations, router])

  const handleAdd = async () => {
    if (!email.trim()) {
      setMessage({ type: 'error', text: '请输入员工邮箱。' })
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      const res = await apiFetch('/api/admin/authorized-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, note }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '保存授权失败' })
        return
      }

      setEmail('')
      setNote('')
      setMessage({ type: 'success', text: '授权邮箱已保存。' })
      await fetchAuthorizations()
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (item: Authorization, active: boolean) => {
    setPendingId(item.id)
    setMessage(null)
    try {
      const res = await apiFetch(`/api/admin/authorized-emails/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '更新授权失败' })
        return
      }

      setMessage({ type: 'success', text: active ? '授权已恢复。' : '授权已取消。' })
      await fetchAuthorizations()
    } finally {
      setPendingId(null)
    }
  }

  const handleSaveNote = async (item: Authorization, nextNote: string) => {
    const res = await apiFetch(`/api/admin/authorized-emails/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: nextNote }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMessage({ type: 'error', text: data.error || '备注保存失败' })
      return
    }

    setMessage({ type: 'success', text: '备注已保存。' })
    await fetchAuthorizations()
  }

  const handleDelete = async (item: Authorization) => {
    const confirmed = window.confirm(`确定要删除 ${item.email} 吗？删除后会同时取消授权，该邮箱之后不能登录公司站。`)
    if (!confirmed) return

    setPendingId(item.id)
    setMessage(null)
    try {
      const res = await apiFetch(`/api/admin/authorized-emails/${item.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '删除邮箱失败' })
        return
      }

      setMessage({ type: 'success', text: '员工邮箱已删除，授权也已取消。' })
      await fetchAuthorizations()
    } finally {
      setPendingId(null)
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

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Admin Access</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">员工登录授权管理</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-500">
            只有这里处于“已授权”的邮箱才能注册、登录和使用公司站。删除邮箱会同时取消授权；
            员工离职后建议直接删除。主账号 links358p@gmail.com 是最高权限账号，不能被取消授权或删除。
          </p>
        </div>

        {message && (
          <div className={`mb-4 rounded-2xl border p-4 text-sm font-medium ${
            message.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-gray-900">添加或恢复授权</h3>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="employee@company.com"
              className="rounded-xl border border-gray-300 px-3 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="备注，例如姓名 / 部门 / 职位"
              className="rounded-xl border border-gray-300 px-3 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <button
              onClick={handleAdd}
              disabled={saving}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存授权'}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">邮箱</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">备注</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">更新时间</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {authorizations.map((item) => {
                const primary = isPrimaryAdminEmail(item.email)
                const disabled = pendingId === item.id

                return (
                  <tr key={item.id}>
                    <td className="px-4 py-4 text-sm font-semibold text-gray-900">
                      <div>{item.email}</div>
                      {primary && <div className="mt-1 text-xs font-medium text-blue-600">最高权限主账号</div>}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {item.active ? '已授权' : '已取消'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <input
                        defaultValue={item.note || ''}
                        onBlur={(event) => {
                          if (event.target.value !== (item.note || '')) {
                            handleSaveNote(item, event.target.value)
                          }
                        }}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {new Date(item.updated_at).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        {primary ? (
                          <span className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                            受保护
                          </span>
                        ) : item.active ? (
                          <button
                            onClick={() => handleToggle(item, false)}
                            disabled={disabled}
                            className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
                          >
                            取消授权
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggle(item, true)}
                            disabled={disabled}
                            className="rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50"
                          >
                            恢复授权
                          </button>
                        )}
                        {!primary && (
                          <button
                            onClick={() => handleDelete(item)}
                            disabled={disabled}
                            className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                          >
                            删除邮箱
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}

              {authorizations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                    暂无授权邮箱。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
