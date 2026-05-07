'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type UiLanguage = 'zh' | 'en'

type UiLanguageContextValue = {
  edition: 'company' | 'resume'
  language: UiLanguage
  canToggleLanguage: boolean
  setLanguage: (language: UiLanguage) => void
}

const STORAGE_KEY = 'product-listing-ai-ui-language'

const UiLanguageContext = createContext<UiLanguageContextValue | null>(null)

function getEdition() {
  return process.env.NEXT_PUBLIC_APP_EDITION === 'resume' ? 'resume' : 'company'
}

export function UiLanguageProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const edition = getEdition()
  const canToggleLanguage = edition === 'resume'
  const [language, setLanguageState] = useState<UiLanguage>('zh')

  useEffect(() => {
    if (!canToggleLanguage) {
      setLanguageState('zh')
      return
    }

    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'zh' || saved === 'en') {
      setLanguageState(saved)
    }
  }, [canToggleLanguage])

  const setLanguage = useCallback((nextLanguage: UiLanguage) => {
    const resolved = canToggleLanguage ? nextLanguage : 'zh'
    setLanguageState(resolved)

    if (canToggleLanguage) {
      window.localStorage.setItem(STORAGE_KEY, resolved)
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [canToggleLanguage])

  const value = useMemo<UiLanguageContextValue>(() => ({
    edition,
    language: canToggleLanguage ? language : 'zh',
    canToggleLanguage,
    setLanguage,
  }), [canToggleLanguage, edition, language, setLanguage])

  return (
    <UiLanguageContext.Provider value={value}>
      {children}
    </UiLanguageContext.Provider>
  )
}

export function useUiLanguage() {
  const context = useContext(UiLanguageContext)
  if (!context) {
    throw new Error('useUiLanguage must be used within UiLanguageProvider')
  }
  return context
}

export function pickText<T>(language: UiLanguage, text: { zh: T; en: T }) {
  return language === 'en' ? text.en : text.zh
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function getCategoryDisplayName(
  category: { name_zh?: string | null; slug?: string | null },
  language: UiLanguage
) {
  if (language === 'zh') {
    return String(category.name_zh || category.slug || '').trim()
  }

  const slug = String(category.slug || '').trim()
  if (slug) {
    return titleCaseWords(slug.replace(/[-_]+/g, ' '))
  }

  return String(category.name_zh || '').trim()
}
