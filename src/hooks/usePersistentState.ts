import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

export function usePersistentState<T>(
  key: string,
  fallback: T,
  validate: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) return fallback
      const parsed: unknown = JSON.parse(raw)
      return validate(parsed) ? parsed : fallback
    } catch {
      return fallback
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Private mode and full storage should not make the app unusable.
    }
  }, [key, value])

  return [value, setValue]
}
