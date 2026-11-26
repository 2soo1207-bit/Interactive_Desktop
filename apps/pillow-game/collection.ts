export const COLLECTION_KEY = '3ce.pillow-tower.collection.v1'
export const SHADE_COUNT = 13
type Store = Pick<Storage, 'getItem' | 'setItem'>

export function readCollection(store: Pick<Store, 'getItem'>): Set<number> {
  try {
    const saved: unknown = JSON.parse(store.getItem(COLLECTION_KEY) ?? '[]')
    return new Set(Array.isArray(saved) ? saved.filter((id): id is number =>
      Number.isInteger(id) && id >= 0 && id < SHADE_COUNT) : [])
  } catch { return new Set() }
}

// Merge rather than overwrite: another tab can have collected a different shade.
export function collectShade(store: Store, current: Set<number>, shade: number): boolean {
  if (Number.isInteger(shade) && shade >= 0 && shade < SHADE_COUNT) current.add(shade)
  for (const id of readCollection(store)) current.add(id)
  try { store.setItem(COLLECTION_KEY, JSON.stringify([...current].sort((a, b) => a - b))); return true }
  catch { return false }
}

export function shuffledShades(random = Math.random): number[] {
  const bag = Array.from({ length: SHADE_COUNT }, (_, id) => id)
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}
