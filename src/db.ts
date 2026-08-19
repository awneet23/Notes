import type { BoardDocument, NoteMeta } from './types'

const DB_NAME = 'stillboard-local'
const STORE = 'boards'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveDocument(doc: BoardDocument): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(doc)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function getDocument(id: string): Promise<BoardDocument | undefined> {
  const db = await openDb()
  const result = await new Promise<BoardDocument | undefined>((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return result
}

export async function listDocuments(): Promise<NoteMeta[]> {
  const db = await openDb()
  const docs = await new Promise<BoardDocument[]>((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return docs.map(({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt, updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}
