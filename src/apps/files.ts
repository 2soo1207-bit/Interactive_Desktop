interface SavedFile {
  id: string
  file: File
  savedAt: number
}

export class FileLibrary {
  #connection: Promise<IDBDatabase> | undefined
  #listeners = new Set<() => void>()

  #open() {
    this.#connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('3ce-playground', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' })
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }).catch((error: unknown) => {
      this.#connection = undefined
      throw error
    })
    return this.#connection
  }

  async save(file: File) {
    const database = await this.#open()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('files', 'readwrite')
      const entry: SavedFile = { id: crypto.randomUUID(), file, savedAt: Date.now() }
      transaction.objectStore('files').put(entry)
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
    for (const notify of this.#listeners) notify()
  }

  async list() {
    const database = await this.#open()
    return new Promise<SavedFile[]>((resolve, reject) => {
      const request = database.transaction('files').objectStore('files').getAll()
      request.onsuccess = () => {
        const files = request.result as SavedFile[]
        resolve(files.sort((a, b) => b.savedAt - a.savedAt))
      }
      request.onerror = () => reject(request.error)
    })
  }

  subscribe(listener: () => void) {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }
}
