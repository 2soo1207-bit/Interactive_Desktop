import { clamp } from '../ui/geometry.ts'
import type { Bounds, Point, Size } from '../ui/geometry.ts'

const preferred = { width: 150, height: 128 }

export interface ShortcutLayout {
  area: Size
  box: Size
  margin: number
  gap: number
  positions: Point[]
}

export function planShortcuts(area: Size, groups: readonly number[]): ShortcutLayout {
  const shortSide = Math.min(area.width, area.height)
  const margin = Math.min(28, Math.floor(shortSide * .045))
  const gap = Math.min(22, Math.floor(shortSide * .055))
  const largestGroup = Math.max(...groups)
  const groupSpacing = gap * Math.max(0, groups.length - 1)
  let best = { across: largestGroup, sideBySide: false, scale: -Infinity }

  // Prefer columns from the upper-right corner. Short screens can stack rows instead.
  for (const sideBySide of [true, false]) {
    for (let across = largestGroup; across >= 1; across--) {
      const lines = groups.reduce((sum, count) => sum + Math.ceil(count / across), 0)
      const columns = sideBySide ? lines : across
      const rows = sideBySide ? across : lines
      const width = area.width - 2 * margin - (columns - 1) * gap - (sideBySide ? groupSpacing : 0)
      const height = area.height - 2 * margin - (rows - 1) * gap - (sideBySide ? 0 : groupSpacing)
      const scale = Math.min(1, width / (columns * preferred.width), height / (rows * preferred.height))
      if (scale > best.scale) best = { across, sideBySide, scale }
    }
  }

  const box = {
    width: Math.max(1, Math.floor(preferred.width * best.scale)),
    height: Math.max(1, Math.floor(preferred.height * best.scale)),
  }
  let offset = margin
  const positions = groups.flatMap((count) => {
    const start = offset
    const lines = Math.ceil(count / best.across)
    offset += lines * ((best.sideBySide ? box.width : box.height) + gap) + gap
    return Array.from({ length: count }, (_, index) => {
      const line = Math.floor(index / best.across)
      const slot = index % best.across
      const column = best.sideBySide ? start + line * (box.width + gap) : margin + slot * (box.width + gap)
      return {
        x: area.width - box.width - column,
        y: best.sideBySide ? margin + slot * (box.height + gap) : start + line * (box.height + gap),
      }
    })
  })
  return { area, box, margin, gap, positions }
}

function limits({ area, box, margin }: ShortcutLayout): Point {
  return { x: area.width - box.width - margin, y: area.height - box.height - margin }
}

export function fitShortcut(point: Point, layout: ShortcutLayout): Point {
  const end = limits(layout)
  return { x: clamp(point.x, layout.margin, end.x), y: clamp(point.y, layout.margin, end.y) }
}

export function separateShortcuts(a: Point, b: Point, { box, gap }: ShortcutLayout) {
  return Math.abs(a.x - b.x) >= box.width + gap || Math.abs(a.y - b.y) >= box.height + gap
}

export function resizeShortcuts(points: Point[], before: ShortcutLayout, after: ShortcutLayout) {
  const from = limits(before)
  const to = limits(after)
  const resized = points.map((point) => fitShortcut({
    x: after.margin + (point.x - before.margin) / Math.max(1, from.x - before.margin) * (to.x - after.margin),
    y: after.margin + (point.y - before.margin) / Math.max(1, from.y - before.margin) * (to.y - after.margin),
  }, after))
  if (resized.every((point, index) => resized.slice(0, index).every((other) => separateShortcuts(point, other, after)))) {
    return resized
  }
}


/** Find space beside or below the right-aligned shortcut groups. */
export function spaceForWindow({ area, box, positions, gap }: ShortcutLayout, size: Size): Bounds {
  const right = Math.max(0, Math.min(...positions.map(({ x }) => x)) - gap)
  const bottom = Math.min(area.height, Math.max(...positions.map(({ y }) => y + box.height)) + gap)
  const beside = { x: 0, y: 0, width: right, height: area.height }
  const below = { x: 0, y: bottom, width: area.width, height: area.height - bottom }
  const scale = (bounds: Bounds) => Math.min(1, bounds.width / size.width, bounds.height / size.height)
  return scale(beside) >= scale(below) ? beside : below
}
