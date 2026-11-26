import { desktopIcons } from './desktop-icons'
import type { DesktopApp } from './runtime'
import { youtubePlayerOrigin } from '../../apps/youtube/channel'

const motionLab: readonly DesktopApp[] = [
  {
    id: 'i-love-3ce',
    name: 'I LOVE 3CE',
    glyph: 'motion',
    surface: 'tile',
    color: 'ink',
    entry: 'apps/i-love-3ce/index.html',
    usesCamera: true,
    usesAudio: true,
  },
]

const games: readonly DesktopApp[] = [
  {
    id: 'pillow-game',
    name: 'Pillow Game',
    glyph: 'game',
    surface: 'tile',
    color: 'rose',
    entry: 'apps/pillow-game/index.html',
    usesCamera: true,
    usesAudio: true,
  },
  {
    id: 'honey-tteok',
    name: 'HONEY TTEOK',
    glyph: 'tteok',
    surface: 'tile',
    color: 'gloss',
    entry: 'apps/honey-tteok/index.html',
    usesCamera: true,
    usesAudio: true,
  },
]

export const apps: readonly DesktopApp[] = [
  {
    id: 'motion-lab',
    ...desktopIcons.motionLab,
    glyph: 'motion',
    surface: 'folder',
    color: 'ink',
    items: motionLab,
  },
  {
    id: 'games',
    ...desktopIcons.games,
    glyph: 'game',
    surface: 'folder',
    color: 'rose',
    items: games,
  },
  {
    id: 'photo-booth',
    ...desktopIcons.photoBooth,
    menuName: 'Photo Booth',
    glyph: 'photo',
    surface: 'tile',
    color: 'gloss',
    entry: 'apps/photo-booth/index.html',
    usesCamera: true,
    usesAudio: true,
  },
  {
    id: 'gallery',
    ...desktopIcons.gallery,
    menuName: 'Gallery',
    glyph: 'photo',
    surface: 'folder',
    color: 'lavender',
    emptyMessage: '아직 전시된 작품이 없습니다.',
  },
  {
    id: 'youtube',
    ...desktopIcons.youtube,
    glyph: 'video',
    surface: 'tile',
    color: 'rose',
    entry: 'apps/youtube/index.html',
    autoplayOrigins: [youtubePlayerOrigin],
  },
  {
    id: 'memo',
    ...desktopIcons.memo,
    menuName: 'MEMO',
    glyph: 'files',
    surface: 'tile',
    color: 'lavender',
    entry: 'apps/memo/index.html',
    windowSize: { width: 1000, height: 650 },
  },
]
