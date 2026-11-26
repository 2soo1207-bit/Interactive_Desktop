import type { Layout } from './config.ts'

const overlays = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>()

// Some test artwork includes opaque, light photo placeholders. Cut out just the
// connected neutral backgrounds inside the declared windows, preserving colored
// tape, dark outlines and the character overlapping the bottom photograph.
// This prepares the rendering layer; the supplied PNG is never edited.
export function cutoutFrameWindows(image: HTMLImageElement, layout: Layout) {
  const key = JSON.stringify(layout)
  let cached = overlays.get(image)
  if (!cached) { cached = new Map(); overlays.set(image, cached) }
  const previous = cached.get(key)
  if (previous) return previous
  const canvas = document.createElement('canvas')
  const width = canvas.width = image.naturalWidth, height = canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('프레임을 준비할 수 없습니다. 다른 프레임을 선택해 주세요.')
  ctx.drawImage(image, 0, 0)
  const pixels = ctx.getImageData(0, 0, width, height), rgba = pixels.data
  const seen = new Uint8Array(width * height)
  const scaleX = width / layout.width, scaleY = height / layout.height
  for (const slot of layout.slots) {
    const left = Math.max(0, Math.floor(slot.x * scaleX)), top = Math.max(0, Math.floor(slot.y * scaleY))
    const right = Math.min(width, Math.ceil((slot.x + slot.width) * scaleX))
    const bottom = Math.min(height, Math.ceil((slot.y + slot.height) * scaleY))
    if (right <= left || bottom <= top) continue
    const queue = new Uint32Array((right - left) * (bottom - top))
    let head = 0, tail = 0
    const offer = (x: number, y: number) => {
      if (x < left || x >= right || y < top || y >= bottom) return
      const index = y * width + x, offset = index * 4
      if (seen[index]) return
      seen[index] = 1
      const r = rgba[offset]!, g = rgba[offset + 1]!, b = rgba[offset + 2]!
      if (rgba[offset + 3] && Math.min(r, g, b) >= 196 && Math.max(r, g, b) - Math.min(r, g, b) <= 22) queue[tail++] = index
    }
    offer(Math.floor((left + right) / 2), Math.floor((top + bottom) / 2))
    while (head < tail) {
      const index = queue[head++]!, x = index % width, y = Math.floor(index / width)
      rgba[index * 4 + 3] = 0
      offer(x - 1, y); offer(x + 1, y); offer(x, y - 1); offer(x, y + 1)
    }
  }
  ctx.putImageData(pixels, 0, 0)
  cached.set(key, canvas)
  return canvas
}
