import { useSyncExternalStore } from 'react'
import { en, ru } from './translations'

export type Lang = 'ru' | 'en'
export const LANGS: readonly Lang[] = ['ru', 'en']

const STORAGE_KEY = 'qfc:lang'
const dictionaries: Record<Lang, Record<string, string>> = { ru, en }

function detectInitialLang(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'ru' || saved === 'en') return saved
  } catch {
    /* ignore storage errors */
  }
  try {
    if ((navigator.language ?? '').toLowerCase().startsWith('en')) return 'en'
  } catch {
    /* ignore */
  }
  return 'ru'
}

let currentLang: Lang = detectInitialLang()
const listeners = new Set<() => void>()

if (typeof document !== 'undefined') {
  document.documentElement.lang = currentLang
}

export function getLang(): Lang {
  return currentLang
}

export function setLang(lang: Lang): void {
  if (lang === currentLang) return
  currentLang = lang
  try {
    window.localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Translate a UI-chrome key, with optional {name} interpolation. */
export function t(key: string, params?: Record<string, string | number>): string {
  let value = dictionaries[currentLang][key] ?? dictionaries.ru[key] ?? key
  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      value = value.replaceAll(`{${name}}`, String(replacement))
    }
  }
  return value
}

/** Pick between a Russian and an English literal by current language. */
export function pick(ru: string, en: string): string {
  return currentLang === 'en' ? en : ru
}

/** Current language, re-rendering the component when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang)
}

/** `t` bound to re-render the calling component whenever the language changes. */
export function useT(): typeof t {
  useSyncExternalStore(subscribe, getLang, getLang)
  return t
}
