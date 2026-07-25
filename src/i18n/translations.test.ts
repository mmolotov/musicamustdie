import { describe, expect, it } from 'vitest'
import { en, ru } from './translations'
import { getLang, setLang, t } from './index'

describe('translations', () => {
  it('English covers every Russian key and vice versa', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort())
  })

  it('has no empty strings', () => {
    for (const [key, value] of Object.entries(ru)) expect(value, `ru:${key}`).not.toBe('')
    for (const [key, value] of Object.entries(en)) expect(value, `en:${key}`).not.toBe('')
  })

  it('t() interpolates params and switches by language', () => {
    const previous = getLang()
    try {
      setLang('en')
      expect(t('ws.found', { count: 3 })).toBe('Found: 3')
      setLang('ru')
      expect(t('ws.found', { count: 3 })).toBe('Найдено: 3')
    } finally {
      setLang(previous)
    }
  })

  it('falls back to the key when it is unknown', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key')
  })
})
