export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
export type Bounds = Point & Size

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export function fitPosition(point: Point, size: Size, area: Size): Point {
  return {
    x: clamp(point.x, 0, area.width - size.width),
    y: clamp(point.y, 0, area.height - size.height),
  }
}
