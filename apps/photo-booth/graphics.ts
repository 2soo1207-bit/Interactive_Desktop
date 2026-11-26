import { uiFont } from '../shared/typography.ts'
import { assetURL, layoutOf, STICKERS } from './config.ts'
import type { Filter, Frame, Photo, Sticker } from './config.ts'
import { cutoutFrameWindows } from './frame-overlay.ts'

export function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}
export function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이 브라우저에서 사진을 처리할 수 없습니다.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return ctx
}
export class Images {
  private pending = new Map<string, Promise<HTMLImageElement>>()
  private decoded = new Map<string, HTMLImageElement>()
  load(path: string) {
    let task = this.pending.get(path)
    if (!task) {
      task = new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.decoding = 'async'
        image.onload = () => { this.decoded.set(path, image); resolve(image) }
        image.onerror = () => { this.pending.delete(path); reject(new Error('꾸미기 이미지를 불러오지 못했습니다.')) }
        image.src = assetURL(path)
      })
      this.pending.set(path, task)
    }
    return task
  }
  get(path: string) { return this.decoded.get(path) }
  clear() { this.pending.clear(); this.decoded.clear() }
}

// Process photo pixels only. The exact same pixels are used in preview and PNG;
// no CSS-only filter or browser-specific Canvas filter implementation is needed.
function applyFilter(canvas: HTMLCanvasElement, filter: Filter) {
  if (filter.id === 'original') return
  const ctx = context(canvas)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = data.data, { brightness: b, contrast: c, saturation: s, tint, fade } = filter
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!, g = pixels[i + 1]!, blue = pixels[i + 2]!
    const luma = r * .2126 + g * .7152 + blue * .0722
    pixels[i] = (((luma + (r - luma) * s) * b - 128) * c + 128 + tint[0]) * (1 - fade) + 255 * fade
    pixels[i + 1] = (((luma + (g - luma) * s) * b - 128) * c + 128 + tint[1]) * (1 - fade) + 255 * fade
    pixels[i + 2] = (((luma + (blue - luma) * s) * b - 128) * c + 128 + tint[2]) * (1 - fade) + 255 * fade
  }
  ctx.putImageData(data, 0, 0)
}
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

export async function composeBase(photos: readonly Photo[], frame: Frame, filter: Filter, images: Images, date: Date) {
  if (photos.length !== 4) throw new Error('사진 네 장을 먼저 촬영해 주세요.')
  const layout = layoutOf(frame)
  const overlay = frame.image ? await images.load(frame.image) : undefined
  if (layout.slots.length !== 4 || layout.width <= 0 || layout.height <= 0) throw new Error('프레임에는 이미지 크기와 사진 영역 네 개가 필요합니다.')
  if (photos.some(photo => !photo.canvas.width || !photo.canvas.height)) throw new Error('촬영된 사진을 다시 확인해 주세요.')
  const canvas = makeCanvas(layout.width, layout.height), ctx = context(canvas)
  ctx.fillStyle = frame.background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < 4; i++) {
    const slot = layout.slots[i]!, photo = photos[i]!.canvas
    const scale = Math.min(slot.width / photo.width, slot.height / photo.height)
    const processed = makeCanvas(photo.width * scale, photo.height * scale)
    context(processed).drawImage(photo, 0, 0, processed.width, processed.height)
    applyFilter(processed, filter)
    ctx.save()
    roundedRect(ctx, slot.x, slot.y, slot.width, slot.height, frame.radius)
    ctx.clip()
    ctx.fillStyle = frame.photoBackground
    ctx.fillRect(slot.x, slot.y, slot.width, slot.height)
    ctx.drawImage(processed, slot.x + (slot.width - processed.width) / 2, slot.y + (slot.height - processed.height) / 2)
    ctx.restore()
    if (frame.border) {
      ctx.strokeStyle = frame.border
      ctx.lineWidth = 3
      roundedRect(ctx, slot.x - 7, slot.y - 7, slot.width + 14, slot.height + 14, frame.radius)
      ctx.stroke()
    }
    processed.width = 0; processed.height = 0
  }
  if (frame.footer !== false) {
    ctx.fillStyle = frame.ink
    ctx.textAlign = 'center'
    ctx.font = `500 40px ${uiFont}`
    ctx.fillText('PHOTO BOOTH', layout.width / 2, layout.footerY)
    ctx.font = `24px ${uiFont}`
    const stamp = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('.')
    ctx.fillText(stamp, layout.width / 2, layout.footerY + 58)
  }
  if (overlay) ctx.drawImage(frame.cutoutWindows ? cutoutFrameWindows(overlay, layout) : overlay, 0, 0, canvas.width, canvas.height)
  return canvas
}

export function stickerAspect(sticker: Sticker, images: Images) {
  const asset = STICKERS.find(item => item.id === sticker.assetId)
  const image = asset && images.get(asset.image)
  return image ? image.naturalWidth / image.naturalHeight : 1
}
export function paintResult(target: HTMLCanvasElement, base: HTMLCanvasElement, stickers: readonly Sticker[], images: Images) {
  if (target.width !== base.width) target.width = base.width
  if (target.height !== base.height) target.height = base.height
  const ctx = context(target)
  ctx.clearRect(0, 0, target.width, target.height)
  ctx.drawImage(base, 0, 0)
  for (const sticker of stickers) {
    const asset = STICKERS.find(item => item.id === sticker.assetId)
    const image = asset && images.get(asset.image)
    if (!image) continue
    const width = sticker.width * target.width, height = width / stickerAspect(sticker, images)
    ctx.save()
    ctx.translate(sticker.x * target.width, sticker.y * target.height)
    ctx.rotate(sticker.rotation * Math.PI / 180)
    ctx.drawImage(image, -width / 2, -height / 2, width, height)
    ctx.restore()
  }
}
export function capturePhoto(video: HTMLVideoElement): Photo {
  if (video.readyState < 2 || !video.videoWidth) throw new Error('카메라가 준비되지 않았습니다. 잠시 후 다시 촬영해 주세요.')
  const canvas = makeCanvas(video.videoWidth, video.videoHeight), ctx = context(canvas)
  ctx.translate(canvas.width, 0); ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0)
  const thumbnail = makeCanvas(320, 320 * canvas.height / canvas.width)
  context(thumbnail).drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height)
  const url = thumbnail.toDataURL('image/jpeg', .9)
  thumbnail.width = 0; thumbnail.height = 0
  return { id: crypto.randomUUID(), canvas, thumbnail: url }
}
export function asPNG(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('이미지 저장에 실패했습니다. 다시 시도해 주세요.')), 'image/png'))
}
