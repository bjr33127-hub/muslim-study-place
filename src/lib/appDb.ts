export const APP_DB_NAME = 'muslim-study-place'
export const APP_DB_VERSION = 2
export const BACKGROUND_UPLOADS_STORE = 'backgroundUploads'
export const DURABLE_STATE_STORE = 'durableState'

export function openAppDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not available.'))
      return
    }

    const request = window.indexedDB.open(APP_DB_NAME, APP_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(BACKGROUND_UPLOADS_STORE)) {
        db.createObjectStore(BACKGROUND_UPLOADS_STORE, { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains(DURABLE_STATE_STORE)) {
        db.createObjectStore(DURABLE_STATE_STORE, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
