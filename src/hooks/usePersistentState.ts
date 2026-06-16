import { useEffect, useState } from 'react'
import {
  hasUsableStorageValue,
  isDurableStorageKey,
  readDurableStorage,
  readStorage,
  writeStorage,
} from '../lib/storage'

export function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStorage(key, fallback))
  const [hydrated, setHydrated] = useState(
    () => !isDurableStorageKey(key) || hasUsableStorageValue(key),
  )

  useEffect(() => {
    let cancelled = false

    if (!isDurableStorageKey(key) || hasUsableStorageValue(key)) {
      return () => {
        cancelled = true
      }
    }

    readDurableStorage<T>(key)
      .then((record) => {
        if (cancelled) {
          return
        }

        if (record) {
          setValue(record.value)
        }

        setHydrated(true)
      })
      .catch(() => {
        if (!cancelled) {
          setHydrated(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [key])

  useEffect(() => {
    if (!hydrated) {
      return
    }

    writeStorage(key, value)
  }, [hydrated, key, value])

  return [value, setValue] as const
}
