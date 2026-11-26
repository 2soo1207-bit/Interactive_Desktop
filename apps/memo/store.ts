export const pageSize = 30
export const maxNickname = 24
export const maxMessage = 1_000

export interface Draft {
  id: string
  nickname: string
  message: string
}

export interface Memo extends Draft {
  createdAt: string
}

interface MemoStore {
  shared: boolean
  list(before: Memo | undefined, signal: AbortSignal): Promise<Memo[]>
  save(draft: Draft, signal: AbortSignal): Promise<Memo>
  close?(): void
}

function browserStore(): MemoStore {
  let connection: Promise<IDBDatabase> | undefined

  function open() {
    return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('3ce-guestbook', 1)
      request.onupgradeneeded = () => {
        const entries = request.result.createObjectStore('entries', { keyPath: 'id' })
        entries.createIndex('chronology', ['createdAt', 'id'])
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Browser storage is busy'))
    }).catch((error) => {
      connection = undefined
      throw error
    })
  }

  return {
    shared: false,
    async list(before, signal) {
      const db = await open()
      signal.throwIfAborted()
      return new Promise<Memo[]>((resolve, reject) => {
        const tx = db.transaction('entries')
        const range = before ? IDBKeyRange.upperBound([before.createdAt, before.id], true) : null
        const request = tx.objectStore('entries').index('chronology').openCursor(range, 'prev')
        const page: Memo[] = []
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor || page.length > pageSize) return
          page.push(cursor.value as Memo)
          if (page.length <= pageSize) cursor.continue()
        }
        tx.oncomplete = () => resolve(page)
        tx.onabort = () => reject(tx.error)
      })
    },
    async save(draft, signal) {
      const db = await open()
      signal.throwIfAborted()
      return new Promise<Memo>((resolve, reject) => {
        const tx = db.transaction('entries', 'readwrite')
        const entries = tx.objectStore('entries')
        const found = entries.get(draft.id)
        let memo = { ...draft, createdAt: new Date().toISOString() }
        found.onsuccess = () => {
          if (found.result) memo = found.result as Memo
          else entries.add(memo)
        }
        tx.oncomplete = () => resolve(memo)
        tx.onabort = () => reject(tx.error)
      })
    },
    close() { void connection?.then((db) => db.close(), () => {}) },
  }
}

const uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/

function parseMemos(value: unknown): Memo[] {
  if (!Array.isArray(value)) throw new Error('Invalid guestbook response')
  return value.flatMap((row) => {
    if (typeof row?.id !== 'string' || !uuidPattern.test(row.id)
      || typeof row.nickname !== 'string' || typeof row.message !== 'string'
      || typeof row.created_at !== 'string' || !timestampPattern.test(row.created_at)
      || !Number.isFinite(Date.parse(row.created_at))) return []
    return [{ id: row.id, nickname: row.nickname, message: row.message, createdAt: row.created_at }]
  })
}

function supabaseStore(base: string, publishableKey: string): MemoStore {
  const endpoint = new URL('/rest/v1/guestbook_entries', base)
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password
    || !publishableKey.startsWith('sb_publishable_')) throw new Error('Invalid Supabase configuration')

  async function request(url: URL, signal: AbortSignal, options?: RequestInit) {
    const headers = new Headers(options?.headers)
    headers.set('apikey', publishableKey)
    const response = await fetch(url, { ...options, headers, signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) })
    if (!response.ok) throw new Error('Shared guestbook unavailable')
    return parseMemos(await response.json())
  }

  const select = 'id,nickname,message,created_at'
  return {
    shared: true,
    list(before, signal) {
      const url = new URL(endpoint)
      url.search = new URLSearchParams({
        select, order: 'created_at.desc,id.desc', limit: String(pageSize + 1),
      }).toString()
      if (before) {
        const { createdAt, id } = before
        url.searchParams.set('or', `(created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id}))`)
      }
      return request(url, signal)
    },
    async save(draft, signal) {
      const insert = new URL(endpoint)
      insert.search = new URLSearchParams({ select, on_conflict: 'id' }).toString()
      const [inserted] = await request(insert, signal, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates,return=representation',
        },
        body: JSON.stringify(draft),
      })
      if (inserted) return inserted

      // A response may have been lost after a successful write. Read back the same ID.
      const lookup = new URL(endpoint)
      lookup.search = new URLSearchParams({ select, id: `eq.${draft.id}` }).toString()
      const [previous] = await request(lookup, signal)
      if (!previous || previous.nickname !== draft.nickname || previous.message !== draft.message) {
        throw new Error('Guestbook submission could not be confirmed')
      }
      return previous
    },
  }
}

export function memoStore(url?: string, key?: string): MemoStore {
  if (!url && !key) return browserStore()
  if (!url || !key) throw new Error('Missing Supabase configuration')
  return supabaseStore(url, key)
}
