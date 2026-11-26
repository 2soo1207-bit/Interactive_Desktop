import productDesign from './assets/product-design.json' with { type: 'json' }

/** Used only on the unphotographed side/back; the front uses source RGB pixels. */
export const PILLOW_COLORS = productDesign.shades.map(shade => shade.color)
const photographs = [
  new URL('./assets/product-front-00.png', import.meta.url).href,
  new URL('./assets/product-front-01.png', import.meta.url).href,
  new URL('./assets/product-front-02.png', import.meta.url).href,
  new URL('./assets/product-front-03.png', import.meta.url).href,
  new URL('./assets/product-front-04.png', import.meta.url).href,
  new URL('./assets/product-front-05.png', import.meta.url).href,
  new URL('./assets/product-front-06.png', import.meta.url).href,
  new URL('./assets/product-front-07.png', import.meta.url).href,
  new URL('./assets/product-front-08.png', import.meta.url).href,
  new URL('./assets/product-front-09.png', import.meta.url).href,
  new URL('./assets/product-front-10.png', import.meta.url).href,
  new URL('./assets/product-front-11.png', import.meta.url).href,
  new URL('./assets/product-front-12.png', import.meta.url).href,
]

export interface Shade {
  id: number
  name: string
  color: string
  front: string
  width: number
  height: number
  bounds: number[]
}

/** Exact public/products files paired to the actual 00–12 PACKSHOT names.
 * Preserve IDs so existing collection progress remains valid.
 */
export const SHADES: readonly Shade[] = productDesign.shades.map((shade, index) => ({
  id: shade.id, name: shade.name, color: shade.color, front: photographs[index],
  width: shade.width, height: shade.height, bounds: shade.bounds,
}))

export const DESIGN = {
  background: new URL('./assets/bedroom.jpg', import.meta.url).href,
  cat: new URL('./assets/cat.png', import.meta.url).href,
  bed: new URL('./assets/bed.png', import.meta.url).href,
} as const

