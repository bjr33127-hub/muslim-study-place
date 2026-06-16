import type { UploadedBackgroundRecord } from '../types/app'
import { BACKGROUND_UPLOADS_STORE, openAppDb } from './appDb'

function createId() {
  if ('randomUUID' in crypto) {
    return `upload-${crypto.randomUUID()}`
  }

  return `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function listUploadedBackgrounds() {
  const db = await openAppDb()

  return new Promise<UploadedBackgroundRecord[]>((resolve, reject) => {
    const tx = db.transaction(BACKGROUND_UPLOADS_STORE, 'readonly')
    const request = tx.objectStore(BACKGROUND_UPLOADS_STORE).getAll()

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
  const db = await openAppDb()

  return new Promise<UploadedBackgroundRecord>((resolve, reject) => {
    const tx = db.transaction(BACKGROUND_UPLOADS_STORE, 'readwrite')
    const request = tx.objectStore(BACKGROUND_UPLOADS_STORE).put(record)

    request.onsuccess = () => resolve(record)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function deleteUploadedBackground(id: string) {
  const db = await openAppDb()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BACKGROUND_UPLOADS_STORE, 'readwrite')
    const request = tx.objectStore(BACKGROUND_UPLOADS_STORE).delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}
