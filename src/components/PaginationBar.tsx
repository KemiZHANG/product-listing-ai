'use client'

import { pickText, useUiLanguage } from '@/lib/ui-language'

type PaginationBarProps = {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  totalLabel?: string
}

export default function PaginationBar({
  page,
  totalPages,
  onPageChange,
  totalLabel,
}: PaginationBarProps) {
  const { language } = useUiLanguage()

  if (totalPages <= 1) {
    return null
  }

  return (
    <div className="mt-5 flex flex-col gap-3 rounded-[1.1rem] border border-slate-200 bg-white/85 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-500">
        {totalLabel || pickText(language, {
          zh: `第 ${page} / ${totalPages} 页`,
          en: `Page ${page} / ${totalPages}`,
        })}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pickText(language, { zh: '上一页', en: 'Previous' })}
        </button>
        <span className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pickText(language, { zh: '下一页', en: 'Next' })}
        </button>
      </div>
    </div>
  )
}
