/** Ending-only catalogue. IDs/names come from the actual 00_Name.png files.
 * Products and Texture are deliberately case-sensitive, separate directories.
 * No colour guesses, marketing descriptions or CSV are used here.
 */
export interface ShowroomShade {
  id: number
  number: string
  name: string
  product: string | null
  texture: string | null
  thumbnail: string | null
}

type Images = Record<string, string>
const filename = /(?:^|\/)(\d{2})_([^/]+)\.png$/i

export function pairShowroomShades(products: Images, textures: Images, thumbnails: Images = {}): ShowroomShade[] {
  const read = (images: Images) => {
    const entries = new Map<number, { name: string; url: string }>()
    for (const [path, url] of Object.entries(images).sort(([a], [b]) => a.localeCompare(b))) {
      const match = path.match(filename)
      if (!match || Number(match[1]) > 12) continue
      const id = Number(match[1])
      if (entries.has(id)) throw new Error(`[Pillow showroom] Duplicate shade number ${match[1]}: ${path}`)
      entries.set(id, { name: match[2], url })
    }
    return entries
  }
  const p = read(products), t = read(textures), thumbs = read(thumbnails)
  return [...new Set([...p.keys(), ...t.keys()])].sort((a, b) => a - b).map(id => {
    const product = p.get(id), texture = t.get(id), thumb = thumbs.get(id)
    // A differently named texture for the same number must not be silently paired.
    const name = product?.name ?? texture!.name
    return {
      id, number: String(id).padStart(2, '0'), name,
      product: product?.url ?? null,
      texture: texture?.name === name ? texture.url : null,
      thumbnail: thumb?.name === name ? thumb.url : null,
    }
  })
}

// Keep the full-resolution showroom originals alongside this app.
// In Node, the guard keeps the pure matching function usable by static tests.
const products = typeof window !== 'undefined'
  ? import.meta.glob<string>('./assets/showroom/Products/*.png', { eager: true, query: '?url', import: 'default' }) : {}
const textures = typeof window !== 'undefined'
  ? import.meta.glob<string>('./assets/showroom/Texture/*.png', { eager: true, query: '?url', import: 'default' }) : {}
const thumbnails = typeof window !== 'undefined'
  ? import.meta.glob<string>('./assets/showroom-thumbnails/*.png', { eager: true, query: '?url', import: 'default' }) : {}

export const SHOWROOM_SHADES: readonly ShowroomShade[] = pairShowroomShades(products, textures, thumbnails)
export const SHOWROOM_PRODUCT_NAME = '3CE LIP PILLOW'
