'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { RuleTemplate } from '@/lib/types'

const defaultForm = {
  name: '',
  scope: 'general',
  content: '',
  active: true,
}

export default function RulesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState<RuleTemplate[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login')
      else setLoading(false)
    })
  }, [router])

  const fetchRules = useCallback(async () => {
    const res = await apiFetch('/api/rules')
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '规则加载失败')
      return
    }
    setRules(data || [])
  }, [])

  useEffect(() => {
    if (!loading) fetchRules()
  }, [loading, fetchRules])

  const editRule = (rule: RuleTemplate) => {
    setEditingId(rule.id)
    setForm({
      name: rule.name,
      scope: rule.scope,
      content: rule.content,
      active: rule.active,
    })
  }

  const resetForm = () => {
    setEditingId(null)
    setForm(defaultForm)
  }

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    const res = await apiFetch(editingId ? `/api/rules/${editingId}` : '/api/rules', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '保存规则失败')
      return
    }
    resetForm()
    await fetchRules()
  }

  const deleteRule = async (rule: RuleTemplate) => {
    if (!window.confirm(`确定删除规则「${rule.name}」吗？`)) return
    const res = await apiFetch(`/api/rules/${rule.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || '删除规则失败')
      return
    }
    await fetchRules()
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 border-b border-slate-200 pb-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Editable skills</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">规则模板</h1>
          <p className="mt-2 text-sm text-slate-500">这里存放标题、描述、图片和平台红线规则。生成时会把启用的规则合并进 prompt。</p>
        </div>
        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
          <form onSubmit={saveRule} className="border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">{editingId ? '编辑规则' : '新增规则'}</h2>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium text-slate-500">名称</span>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-slate-500">范围</span>
              <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="general">通用</option>
                <option value="title_description">标题/描述</option>
                <option value="image">图片</option>
                <option value="platform">平台规则</option>
              </select>
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-slate-500">规则内容</span>
              <textarea required rows={16} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-6" />
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              启用
            </label>
            <div className="mt-4 flex gap-2">
              <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                保存规则
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  取消
                </button>
              )}
            </div>
          </form>

          <section className="space-y-3">
            {rules.length === 0 ? (
              <div className="border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm">暂无规则。</div>
            ) : rules.map((rule) => (
              <article key={rule.id} className="border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-950">{rule.name}</h2>
                    <div className="mt-1 flex gap-2 text-xs text-slate-500">
                      <span>{rule.scope}</span>
                      <span>{rule.active ? '启用' : '停用'}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => editRule(rule)} className="text-sm font-medium text-blue-600">编辑</button>
                    <button onClick={() => deleteRule(rule)} className="text-sm font-medium text-red-600">删除</button>
                  </div>
                </div>
                <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{rule.content}</p>
              </article>
            ))}
          </section>
        </div>
      </main>
    </div>
  )
}
