import type { MemoryStatus } from '../types/app'
import { DURABLE_STATE_STORE, openAppDb } from './appDb'

export const STORAGE_PREFIX = 'muslim-study-place:'

type DurableRecord = {
  key: string
  value: unknown
  updatedAt: number
}

export const DURABLE_STORAGE_KEYS = [
  'settings:language',
  'widgetLayouts',
  'layoutVersion',
  'selectedBackground',
  'settings:backgroundDim',
  'settings:particlesEnabled',
  'taskWindows',
  'taskWindowLayouts',
  'todos',
  'timer:mode',
  'timer:remaining',
  'timer:running',
  'timerSettings',
  'pomodoroRun',
  'taskPomodoroMemory',
  'streak',
  'flameEvolution',
  'youtube:url',
  'youtube:playlistOrder',
  'quran:selectedReciter',
  'quran:selectedChapter',
  'quran:volume',
] as const

export type DurableStorageKey = (typeof DURABLE_STORAGE_KEYS)[number]

export type DurableSnapshot = {
  app: 'muslim-study-place'
  version: 1
  exportedAt: string
  values: Partial<Record<DurableStorageKey, unknown>>
}

export function fullStorageKey(key: string) {
  return STORAGE_PREFIX + key
}

export function isDurableStorageKey(key: string): key is DurableStorageKey {
  return (DURABLE_STORAGE_KEYS as readonly string[]).includes(key)
}

function parseRaw<T>(raw: string | null): T | undefined {
  if (!raw) {
    return undefined
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

export function hasUsableStorageValue(key: string) {
  return parseRaw(window.localStorage.getItem(fullStorageKey(key))) !== undefined
}

export function readStorage<T>(key: string, fallback: T): T {
  return parseRaw<T>(window.localStorage.getItem(fullStorageKey(key))) ?? fallback
}

export function writeStorage<T>(key: string, value: T) {
  let changed = true

  try {
    const storageKey = fullStorageKey(key)
    const serializedValue = JSON.stringify(value)

    changed = window.localStorage.getItem(storageKey) !== serializedValue

    if (changed) {
      window.localStorage.setItem(storageKey, serializedValue)
    }
  } catch {
    // Browsers can reject storage in private modes; the app should still run.
  }

  const durable = isDurableStorageKey(key)

  if (changed && durable) {
    window.dispatchEvent(
      new CustomEvent('msp:durable-storage-change', { detail: { key } }),
    )
  }

  if (durable) {
    void writeDurableStorage(key, value)
  }
}

export async function writeDurableStorage<T>(key: string, value: T) {
  if (!isDurableStorageKey(key)) {
    return
  }

  const db = await openAppDb()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DURABLE_STATE_STORE, 'readwrite')
    const record: DurableRecord = {
      key,
      value,
      updatedAt: Date.now(),
    }
    const request = tx.objectStore(DURABLE_STATE_STORE).put(record)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  }).catch(() => undefined)
}

async function deleteDurableStorage(key: DurableStorageKey) {
  const db = await openAppDb()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DURABLE_STATE_STORE, 'readwrite')
    const request = tx.objectStore(DURABLE_STATE_STORE).delete(key)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  }).catch(() => undefined)
}

export async function readDurableStorage<T>(key: string) {
  if (!isDurableStorageKey(key)) {
    return null
  }

  const db = await openAppDb()

  return new Promise<{ value: T; updatedAt: number } | null>((resolve, reject) => {
    const tx = db.transaction(DURABLE_STATE_STORE, 'readonly')
    const request = tx.objectStore(DURABLE_STATE_STORE).get(key)

    request.onsuccess = () => {
      const record = request.result as DurableRecord | undefined
      resolve(record ? { value: record.value as T, updatedAt: record.updatedAt } : null)
    }
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  }).catch(() => null)
}

async function listDurableRecords() {
  const db = await openAppDb()

  return new Promise<DurableRecord[]>((resolve, reject) => {
    const tx = db.transaction(DURABLE_STATE_STORE, 'readonly')
    const request = tx.objectStore(DURABLE_STATE_STORE).getAll()

    request.onsuccess = () => resolve(request.result as DurableRecord[])
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function getDurableStorageStatus(
  restored = false,
): Promise<MemoryStatus> {
  try {
    const records = await listDurableRecords()
    const updatedAt = records.reduce<number | null>(
      (latest, record) =>
        latest === null ? record.updatedAt : Math.max(latest, record.updatedAt),
      null,
    )

    return {
      available: true,
      keyCount: records.length,
      updatedAt,
      restored,
    }
  } catch (error) {
    return {
      available: false,
      keyCount: 0,
      updatedAt: null,
      restored,
      error: error instanceof Error ? error.message : 'Storage unavailable.',
    }
  }
}

export async function buildDurableSnapshot(): Promise<DurableSnapshot> {
  const records = await listDurableRecords().catch(() => [])
  const durableValues = new Map(records.map((record) => [record.key, record.value]))
  const values: Partial<Record<DurableStorageKey, unknown>> = {}

  DURABLE_STORAGE_KEYS.forEach((key) => {
    const localValue = parseRaw(window.localStorage.getItem(fullStorageKey(key)))

    if (localValue !== undefined) {
      values[key] = localValue
      return
    }

    if (durableValues.has(key)) {
      values[key] = durableValues.get(key)
    }
  })

  return {
    app: 'muslim-study-place',
    version: 1,
    exportedAt: new Date().toISOString(),
    values,
  }
}

export async function importDurableSnapshot(payload: unknown) {
  const snapshot = payload as Partial<DurableSnapshot>

  if (
    snapshot.app !== 'muslim-study-place' ||
    snapshot.version !== 1 ||
    !snapshot.values ||
    typeof snapshot.values !== 'object'
  ) {
    throw new Error('Invalid Muslim Study Place backup.')
  }

  const entries = Object.entries(snapshot.values).filter(([key]) =>
    isDurableStorageKey(key),
  ) as Array<[DurableStorageKey, unknown]>
  const importedKeys = new Set(entries.map(([key]) => key))

  await Promise.all(
    DURABLE_STORAGE_KEYS.map((key) => {
      const entry = entries.find(([entryKey]) => entryKey === key)

      if (!entry || !importedKeys.has(key)) {
        try {
          window.localStorage.removeItem(fullStorageKey(key))
        } catch {
          // Keep importing into IndexedDB even if localStorage refuses the write.
        }

        return deleteDurableStorage(key)
      }

      const [, value] = entry

      try {
        window.localStorage.setItem(fullStorageKey(key), JSON.stringify(value))
      } catch {
        // Keep importing into IndexedDB even if localStorage refuses the write.
      }

      return writeDurableStorage(key, value)
    }),
  )

  return entries.length
}
