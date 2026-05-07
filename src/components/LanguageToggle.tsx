'use client'

import { useUiLanguage } from '@/lib/ui-language'

export default function LanguageToggle() {
  const { canToggleLanguage, language, setLanguage } = useUiLanguage()

  if (!canToggleLanguage) {
    return null
  }

  return (
    <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white/90 p-1 shadow-sm">
      <button
        type="button"
        onClick={() => setLanguage('zh')}
        className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
          language === 'zh'
            ? 'bg-slate-950 text-white'
            : 'text-slate-500 hover:text-slate-900'
        }`}
      >
        中文
      </button>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
          language === 'en'
            ? 'bg-slate-950 text-white'
            : 'text-slate-500 hover:text-slate-900'
        }`}
      >
        English
      </button>
    </div>
  )
}
