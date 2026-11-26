const glyphs = {
  apple: '<path fill="currentColor" stroke="none" d="M11.8 8C9.8 8 9 6.8 6.9 7.2 3 8 2.7 12.7 4.6 17c1 2.3 2.5 4 4.1 4 1.2 0 2.2-.7 3.3-.7s2.1.7 3.3.7c1.6 0 3.1-1.7 4.1-4 1.9-4.3 1.6-9-2.3-9.8-2.1-.4-3 1-5.3.8Zm.4-1.5a5.1 5.1 0 0 1 4.7-4.2c-.1 2.3-2 4.2-4.7 4.2Z"/>',
  wifi: '<path d="M2.5 9a14.8 14.8 0 0 1 19 0M5.8 12.6a9.7 9.7 0 0 1 12.4 0M9 16a4.7 4.7 0 0 1 6 0"/><circle cx="12" cy="19.6" r=".9" fill="currentColor" stroke="none"/>',
  wifiOff: '<path d="M2.5 9a15 15 0 0 1 2-1.4M9 5.9A14.7 14.7 0 0 1 21.5 9M5.8 12.6a9.8 9.8 0 0 1 2.7-1.5m6.3-.2c1.2.4 2.4.9 3.4 1.7M9 16a4.7 4.7 0 0 1 4.6-.9M3 3l18 18"/><circle cx="12" cy="19.6" r=".9" fill="currentColor" stroke="none"/>',
  volume: '<path d="M3.5 9v6h4l5 4V5l-5 4Zm12.3-.3a4.8 4.8 0 0 1 0 6.6m2.7-9a8 8 0 0 1 0 11.4"/>',
  volumeOff: '<path d="M3.5 9v6h4l5 4V5l-5 4ZM17 10l4 4m0-4-4 4"/>',
  hand: '<path d="M7 12V6a1.4 1.4 0 0 1 2.8 0v4.6-6a1.4 1.4 0 1 1 2.8 0v6-4.7a1.4 1.4 0 0 1 2.8 0v5.4-3.1a1.4 1.4 0 0 1 2.8 0v5.9a6.6 6.6 0 0 1-6.6 6.6c-2.4 0-4.3-1-5.6-3L3.7 14a1.5 1.5 0 0 1 2.3-1.9l2.2 2.1"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 4v3"/>',
  unlock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 7.5-1.9M12 14v3"/>',
  motion: '<ellipse cx="12" cy="12" rx="4.3" ry="10" transform="rotate(45 12 12)"/><ellipse cx="12" cy="12" rx="4.3" ry="10" transform="rotate(-45 12 12)"/><circle cx="12" cy="12" r="1"/>',
  game: '<path d="M7.2 7.5h9.6c2.2 0 3.8 1.6 4.3 3.8l.7 3c.6 2.5-1.9 4-3.8 2.5l-2.5-2h-7l-2.5 2c-1.9 1.5-4.4 0-3.8-2.5l.7-3c.5-2.2 2.1-3.8 4.3-3.8Z"/><path d="M8 9.7v4M6 11.7h4m5.8-.1h.01m2.3-1.6h.01"/>',
  tteok: '<path d="M3 13c0-4.3 3.7-7 9-7s9 2.7 9 7v1.4c0 2.3-3.7 4.1-9 4.1s-9-1.8-9-4.1z"/><path d="M3 13c1.7 1.9 5 2.8 9 2.8s7.3-.9 9-2.8M8 10.5c1-.7 2.4-1 4-1"/>',
  photo: '<rect x="3.5" y="6.5" width="17" height="13" rx="3"/><path d="M8 6.5l1.6-2h4.8l1.6 2"/><circle cx="12" cy="13" r="3.2"/>',
  files: '<path d="M8 4.5H14l4 4v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z"/><path d="M14 4.5v4h4m-9 4h6m-6 3h5"/>',
  video: '<rect x="3" y="6.5" width="12" height="11" rx="2.5"/><path d="m15 10 4.3-2.3a1 1 0 0 1 1.5.9v6.8a1 1 0 0 1-1.5.9L15 14"/>',
  videoOff: '<path d="M15 10l4.3-2.3a1 1 0 0 1 1.5.9v5.1M3 3l18 18M12 6.5h.5A2.5 2.5 0 0 1 15 9v.5M15 15.5a2.5 2.5 0 0 1-2.5 2h-7A2.5 2.5 0 0 1 3 15V9c0-.5.1-1 .4-1.4"/>',
  close: '<path d="m7 7 10 10M17 7 7 17"/>',
  minimize: '<path d="M6 12h12"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  forward: '<path d="m10 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  grid: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.3"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.3"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.3"/><rect x="14" y="14" width="6.5" height="6.5" rx="1.3"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M3.5 6h.01m-.01 6h.01m-.01 6h.01"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.1 15.1 5 5"/>',
  sidebar: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14M5.7 9h.6m-.6 3h.6m-.6 3h.6"/>',
  folder: '<path d="M3 8a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5v5l3 1.7"/>',
  refresh: '<path d="M19.5 8.5A8 8 0 1 0 20 15m0-10v4h-4"/>',
  maximize: '<path d="M7 10V7h3m4 0h3v3m0 4v3h-3m-4 0H7v-3"/>',
  restore: '<rect x="7" y="9" width="8" height="8" rx="1"/><path d="M10 6h7a1 1 0 0 1 1 1v7"/>',
  resize: '<path d="m7 17 10-10m-5 10 5-5"/>',
} as const

export type Glyph = keyof typeof glyphs

export function icon(name: Glyph) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${glyphs[name]}</svg>`
}
