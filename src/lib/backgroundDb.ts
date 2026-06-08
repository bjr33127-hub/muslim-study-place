import type { UploadedBackgroundRecord } from '../types/app'

const DB_NAME = 'muslim-study-place'
const STORE_NAME = 'backgroundUploads'
const DB_VERSION = 1

function openBackgroundDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function createId() {
  if ('randomUUID' in crypto) {
    return `upload-${crypto.randomUUID()}`
  }

  return `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function listUploadedBackgrounds() {
  const db = await openBackgroundDb()

  return new Promise<UploadedBackgroundRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()

    request.onsuccess = () => resolve(request.result as UploadedBackgroundRecord[])
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function saveUploadedBackground(file: File) {
  const kind = file.type.startsWith('video') ? 'video' : 'image'
  const record: UploadedBackgroundRecord = {
    id: createId(),
    label: file.name.replace(/\.[^.]+$/, '') || 'Uploaded background',
    kind,
    blob: file,
    mimeType: file.type,
    createdAt: Date.now(),
  }
  const db = await openBackgroundDb()

  return new Promise<UploadedBackgroundRecord>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const request = tx.objectStore(STORE_NAME).put(record)

    request.onsuccess = () => resolve(record)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function deleteUploadedBackground(id: string) {
  const db = await openBackgroundDb()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const request = tx.objectStore(STORE_NAME).delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}
