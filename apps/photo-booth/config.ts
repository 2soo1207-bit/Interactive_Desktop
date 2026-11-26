export type Step = 'start' | 'camera' | 'frame' | 'edit' | 'save'
export interface Photo { id: string; canvas: HTMLCanvasElement; thumbnail: string }
export interface Slot { x: number; y: number; width: number; height: number }
export interface Layout { width: number; height: number; slots: readonly Slot[]; footerY: number }
export interface Frame {
  id: string; name: string; description: string; thumbnail: string; image: string | null
  background: string; ink: string; photoBackground: string; radius: number
  border?: string; layout?: Layout; footer?: boolean
  cutoutWindows?: boolean
}
export interface Filter {
  id: string; name: string; brightness: number; contrast: number; saturation: number
  tint: readonly [number, number, number]; fade: number
}
export interface StickerAsset { id: string; name: string; thumbnail: string; image: string; width: number }
export interface Sticker { id: string; assetId: string; x: number; y: number; width: number; rotation: number }

// Exact 2x artwork coordinates. Transparent photo windows are 1266 x 712px.
export const LAYOUT: Layout = {
  width: 1448, height: 4344, footerY: 4200,
  slots: [407, 1179, 1951, 2723].map(y => ({ x: 92, y, width: 1266, height: 712 })),
}

// Original PNGs are copied unchanged into this isolated example so Vite also
// includes them in production (the project disables public-directory copying).
export const FRAMES: readonly Frame[] = [
  {
    id: 'kuromi', name: 'Kuromi', description: '3CE × Kuromi',
    thumbnail: 'frames/Frame_Kuromi.png', image: 'frames/Frame_Kuromi.png',
    background: '#e8e8e9', ink: '#151515', photoBackground: '#e8e8e9', radius: 0,
    footer: false, layout: LAYOUT,
  },
  {
    id: 'pillow', name: 'Pillow', description: '3CE Pillow',
    thumbnail: 'frames/Frame_Pillow.png', image: 'frames/Frame_Pillow.png',
    background: '#e8e8e9', ink: '#151515', photoBackground: '#e8e8e9', radius: 0,
    footer: false,
    layout: {
      width: 1448, height: 4344, footerY: 4200,
      slots: [534, 1306, 2078, 2850].map(y => ({ x: 92, y, width: 1266, height: 712 })),
    },
  },
]

// Natural-strength tones. Edit these numbers to change both preview and export.
export const FILTERS: readonly Filter[] = [
  { id: 'original', name: 'Original', brightness: 1, contrast: 1, saturation: 1, tint: [0, 0, 0], fade: 0 },
  { id: 'bright', name: 'Bright', brightness: 1.1, contrast: .98, saturation: 1.02, tint: [0, 0, 0], fade: 0 },
  { id: 'warm', name: 'Warm', brightness: 1.02, contrast: 1.02, saturation: 1.02, tint: [8, 2, -5], fade: 0 },
  { id: 'cool', name: 'Cool', brightness: 1.03, contrast: .99, saturation: .97, tint: [-5, 1, 8], fade: 0 },
  { id: 'bw', name: 'B&W', brightness: 1.02, contrast: 1.07, saturation: 0, tint: [0, 0, 0], fade: 0 },
  { id: 'vintage', name: 'Vintage', brightness: 1.01, contrast: .92, saturation: .78, tint: [8, 3, -4], fade: .04 },
  { id: 'soft', name: 'Pink / Soft', brightness: 1.06, contrast: .94, saturation: .92, tint: [7, 0, 4], fade: 0 },
  { id: 'contrast', name: 'High Contrast', brightness: 1, contrast: 1.16, saturation: 1.04, tint: [0, 0, 0], fade: 0 },
]

export const STICKERS: readonly StickerAsset[] = [
  { id: 'kuromi-1', name: '쿠로미 이어 로프', thumbnail: 'stickers/Sticker_Kuromi_1.png', image: 'stickers/Sticker_Kuromi_1.png', width: .34 },
  { id: 'kuromi-2', name: '핑크 로프', thumbnail: 'stickers/Sticker_Kuromi_2.png', image: 'stickers/Sticker_Kuromi_2.png', width: .42 },
  { id: 'kuromi-3', name: '쿠로미', thumbnail: 'stickers/Sticker_Kuromi_3.png', image: 'stickers/Sticker_Kuromi_3.png', width: .28 },
  { id: 'kuromi-4', name: 'WANTED', thumbnail: 'stickers/Sticker_Kuromi_4.png', image: 'stickers/Sticker_Kuromi_4.png', width: .4 },
  { id: 'picnic-1', name: '피치', thumbnail: 'stickers/Sticker_Picnic_1.png', image: 'stickers/Sticker_Picnic_1.png', width: .26 },
  { id: 'picnic-2', name: '리프', thumbnail: 'stickers/Sticker_Picnic_2.png', image: 'stickers/Sticker_Picnic_2.png', width: .3 },
  { id: 'picnic-3', name: '스프라우트', thumbnail: 'stickers/Sticker_Picnic_3.png', image: 'stickers/Sticker_Picnic_3.png', width: .28 },
]

const assets = import.meta.glob('./assets/**/*.{png,svg,webp,jpg,jpeg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
export function assetURL(path: string) {
  const url = assets[`./assets/${path}`]
  if (!url) throw new Error(`Photo Booth 에셋을 찾을 수 없습니다: ${path}`)
  return url
}
export const layoutOf = (frame: Frame) => frame.layout ?? LAYOUT
