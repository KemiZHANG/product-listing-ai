'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PROMPT_ROLES } from '@/lib/types'
import type { Category, CategoryPrompt } from '@/lib/types'

type CategoryDetail = Category & {
  prompts: CategoryPrompt[]
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

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/categories" className="mb-4 inline-block text-sm font-medium text-blue-600">返回类目列表</Link>
        <div className="mb-5 border-b border-slate-200 pb-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Category prompts</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">{category ? `${category.icon} ${category.name_zh}` : '类目指令'}</h1>
          <p className="mt-2 text-sm text-slate-500">商品生成时会按顺序调用这里的指令。前 6 条建议对应主图、场景图、详情图。</p>
        </div>

        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <section className="space-y-3">
          {(category?.prompts || []).map((prompt) => (
            <article key={prompt.id} className="border border-slate-200 bg-white p-4 shadow-sm">
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

        <section className="mt-5 border border-slate-200 bg-white p-4 shadow-sm">
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
      </main>
    </div>
  )
}
