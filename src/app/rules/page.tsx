'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { apiFetch } from '@/lib/api'
import { subscribeToTableChanges } from '@/lib/client-realtime'
import { supabase } from '@/lib/supabase'
import type { RuleTemplate } from '@/lib/types'
import { pickText, useUiLanguage } from '@/lib/ui-language'

const defaultForm = {
  name: '',
  scope: 'general',
  content: '',
  active: true,
}

function scopeLabel(scope: RuleTemplate['scope'], language: 'zh' | 'en') {
  const labels = {
    general: { zh: '通用', en: 'General' },
    title_description: { zh: '标题/描述', en: 'Title / Description' },
    image: { zh: '图片', en: 'Image' },
    platform: { zh: '平台规则', en: 'Platform' },
  }
  return language === 'en' ? labels[scope].en : labels[scope].zh
}

export default function RulesPage() {
  const router = useRouter()
  const { language } = useUiLanguage()
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState<RuleTemplate[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [error, setError] = useState<string | null>(null)

  const text = {
    loading: pickText(language, { zh: '加载中...', en: 'Loading...' }),
    eyebrow: pickText(language, { zh: '规则模板库', en: 'Rule library' }),
    title: pickText(language, { zh: '规则模板', en: 'Rules' }),
    description: pickText(language, {
      zh: '这里存放标题、描述、图片和平台红线规则。生成时会把启用的规则合并进 prompt。',
      en: 'Store title, description, image, and platform rules here. Enabled rules are merged into the generation prompt.',
    }),
    loadError: pickText(language, { zh: '规则加载失败', en: 'Failed to load rules' }),
    saveError: pickText(language, { zh: '保存规则失败', en: 'Failed to save rule' }),
    deleteError: pickText(language, { zh: '删除规则失败', en: 'Failed to delete rule' }),
    editRule: pickText(language, { zh: '编辑规则', en: 'Edit rule' }),
    createRule: pickText(language, { zh: '新增规则', en: 'Create rule' }),
    name: pickText(language, { zh: '名称', en: 'Name' }),
    scope: pickText(language, { zh: '范围', en: 'Scope' }),
    content: pickText(language, { zh: '规则内容', en: 'Rule content' }),
    active: pickText(language, { zh: '启用', en: 'Enabled' }),
    save: pickText(language, { zh: '保存规则', en: 'Save rule' }),
    cancel: pickText(language, { zh: '取消', en: 'Cancel' }),
    list: pickText(language, { zh: '规则列表', en: 'Rule list' }),
    count: (count: number) => pickText(language, {
      zh: `${count} 条规则`,
      en: `${count} rules`,
    }),
    empty: pickText(language, { zh: '暂无规则。', en: 'No rules yet.' }),
    edit: pickText(language, { zh: '编辑', en: 'Edit' }),
    delete: pickText(language, { zh: '删除', en: 'Delete' }),
    enabled: pickText(language, { zh: '启用', en: 'Enabled' }),
    disabled: pickText(language, { zh: '停用', en: 'Disabled' }),
    deleteConfirm: (name: string) => pickText(language, {
      zh: `确定删除规则“${name}”吗？`,
      en: `Delete rule "${name}"?`,
    }),
  }

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
      setError(data?.error || text.loadError)
      return
    }
    setRules(data || [])
  }, [text.loadError])

  useEffect(() => {
    if (!loading) void fetchRules()
  }, [loading, fetchRules])

  useEffect(() => {
    if (loading) return
    return subscribeToTableChanges(
      'rules-page-realtime',
      [{ table: 'rule_templates' }],
      () => {
        void fetchRules()
      },
      { debounceMs: 500 }
    )
  }, [fetchRules, loading])

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
      setError(data?.error || text.saveError)
      return
    }
    resetForm()
    await fetchRules()
  }

  const deleteRule = async (rule: RuleTemplate) => {
    if (!window.confirm(text.deleteConfirm(rule.name))) return
    const res = await apiFetch(`/api/rules/${rule.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || text.deleteError)
      return
    }
    await fetchRules()
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">{text.loading}</div>
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(250,204,21,0.16),transparent_30%),radial-gradient(circle_at_88%_8%,rgba(37,99,235,0.12),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_46%,#eef2f7_100%)]">
      <Navbar />
      <main className="mx-auto max-w-[1600px] px-5 py-10 sm:px-8">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{text.eyebrow}</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">{text.title}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">{text.description}</p>
        </div>
        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 shadow-sm">{error}</div>}

        <div className="grid gap-6 lg:grid-cols-[480px_1fr]">
          <form onSubmit={saveRule} className="rounded-[1.4rem] border border-slate-200/80 bg-white/88 p-6 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
            <h2 className="text-xl font-semibold text-slate-950">{editingId ? text.editRule : text.createRule}</h2>
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold text-slate-600">{text.name}</span>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="mt-3 block">
              <span className="mb-2 block text-sm font-semibold text-slate-600">{text.scope}</span>
              <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as RuleTemplate['scope'] })} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
                <option value="general">{scopeLabel('general', language)}</option>
                <option value="title_description">{scopeLabel('title_description', language)}</option>
                <option value="image">{scopeLabel('image', language)}</option>
                <option value="platform">{scopeLabel('platform', language)}</option>
              </select>
            </label>
            <label className="mt-3 block">
              <span className="mb-2 block text-sm font-semibold text-slate-600">{text.content}</span>
              <textarea required rows={16} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50" />
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              {text.active}
            </label>
            <div className="mt-4 flex gap-2">
              <button className="rounded-2xl bg-[linear-gradient(135deg,#071228,#0f172a)] px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-slate-950/18 hover:bg-slate-800">
                {text.save}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {text.cancel}
                </button>
              )}
            </div>
          </form>

          <section className="rounded-[1.4rem] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] backdrop-blur">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-950">{text.list}</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">{text.count(rules.length)}</span>
            </div>
            <div className="space-y-3">
              {rules.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">{text.empty}</div>
              ) : rules.map((rule) => (
                <article key={rule.id} className={`rounded-2xl border bg-white/92 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 ${editingId === rule.id ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-slate-950">{rule.name}</h2>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          rule.scope === 'image'
                            ? 'bg-emerald-50 text-emerald-700'
                            : rule.scope === 'title_description'
                              ? 'bg-blue-50 text-blue-700'
                              : rule.scope === 'platform'
                                ? 'bg-violet-50 text-violet-700'
                                : 'bg-slate-100 text-slate-600'
                        }`}>{scopeLabel(rule.scope, language)}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${rule.active ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
                          {rule.active ? text.enabled : text.disabled}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => editRule(rule)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-50">{text.edit}</button>
                      <button onClick={() => deleteRule(rule)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50">{text.delete}</button>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{rule.content}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
