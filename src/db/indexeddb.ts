import type { GameDoc } from '../types'

const DB_NAME = 'xiangqi-arena'
const DB_VERSION = 1
const STORE = 'games'

// 手写轻量 Promise 封装，避免引入第三方依赖。
// DB 结构：object store `games`，keyPath `id`，索引 `updatedAt` 用于排序。

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getAllGames(): Promise<GameDoc[]> {
  const db = await openDB()
  const tx = db.transaction(STORE, 'readonly')
  const req = tx.objectStore(STORE).index('updatedAt').getAll()
  const docs = await requestToPromise(req)
  // 按 updatedAt 降序（最新在前）
  return docs.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getGame(id: string): Promise<GameDoc | undefined> {
  const db = await openDB()
  const tx = db.transaction(STORE, 'readonly')
  const req = tx.objectStore(STORE).get(id)
  return requestToPromise(req)
}

export async function putGame(doc: GameDoc): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE, 'readwrite')
  await requestToPromise(tx.objectStore(STORE).put(doc))
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteGame(id: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE, 'readwrite')
  await requestToPromise(tx.objectStore(STORE).delete(id))
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}