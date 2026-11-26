type Vector = readonly [number, number, number]

const resolution = 224
const fieldWidth = 2.36
const artwork = new Map<string, HTMLCanvasElement>()
const surfaces = new Map<number, Float32Array>()
export const TTEOK_VARIANTS = 6

const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
function unit(vector: Vector): Vector {
  const length = Math.sqrt(dot(vector, vector))
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

const up: Vector = [0, 1, 0]
const view = unit([.16, 1.42, 1])
const horizontal = unit(cross(up, view))
const vertical = cross(view, horizontal)
const key = unit([-.83, 1.11, .58])
const bounce = unit([.34, -.16, 1])
const rim = unit([.77, .48, -.6])
const halfRim = unit([view[0] + rim[0], view[1] + rim[1], view[2] + rim[2]])
const softboxRight = unit(cross(up, key))
const softboxUp = cross(key, softboxRight)
const worldBounds = [1.30, .88, 1.23] as const
const rayDirection: Vector = [view[0] / worldBounds[0], view[1] / worldBounds[1], view[2] / worldBounds[2]]
const rayLength = dot(rayDirection, rayDirection)

function surfaceField(x: number, y: number, z: number, variant: number) {
  // A pinched top gathers uneven pleats around the central dimple.
  const phase = variant * 2.39996
  const folds = 5 + variant % 3
  const u = (x + Math.sin(phase) * .038 - .046 * z * z) / (1.035 + .043 * Math.sin(phase))
  const v = (z + .042 * x - Math.cos(phase) * .034) / (.94 + .055 * Math.cos(phase))
  const r = Math.hypot(u, v)
  const angle = Math.atan2(v, u)
  const irregular = .24 * Math.sin(angle * 2 + phase) + .12 * Math.cos(angle * 3 - phase)
  const foldedAngle = angle * folds + phase + irregular + .56 * (1 - r) + .19 * Math.sin(angle + r * 7)
  const crease = (.5 + .5 * Math.cos(foldedAngle)) ** 6
  const lobe = .55 + .45 * Math.sin(angle * 3 + phase)
  const gathered = (1 - Math.exp(-70 * r * r)) * Math.exp(-((r - .39) ** 2) / .17)
  const dimple = .172 * Math.exp(-r * r / .026)
  const top = .64 - dimple - (.11 + .115 * lobe) * crease * gathered
    + .035 * Math.sin(angle * 2 - phase) * Math.min(r, 1)
  const height = Math.max(.29, y >= 0 ? top : .48)
  const h = (y + .052 * u - .029 * v) / height
  const edge = 1 + .032 * Math.cos(angle * 3 + phase) + .020 * Math.sin(angle * 2 - phase)
    - (.026 + .032 * lobe) * crease * Math.min(r, 1) * Math.max(0, Math.min(h + .45, 1))
  return (r / edge) ** 2 + Math.abs(h) ** 2.48 - 1
}

function trace(origin: Vector, variant: number): Vector | undefined {
  // Intersect a loose ellipsoid first, then find the visible surface inside it.
  const p: Vector = [origin[0] / worldBounds[0], origin[1] / worldBounds[1], origin[2] / worldBounds[2]]
  const b = dot(rayDirection, p)
  const discriminant = b * b - rayLength * (dot(p, p) - 1)
  if (discriminant <= 0) return
  const radius = Math.sqrt(discriminant)
  const near = (-b + radius) / rayLength
  const far = (-b - radius) / rayLength
  const at = (distance: number): Vector => [
    origin[0] + distance * view[0],
    origin[1] + distance * view[1],
    origin[2] + distance * view[2],
  ]

  let outside = near
  const steps = Math.ceil((near - far) / .086)
  for (let index = 1; index <= steps; index++) {
    const inside = near + (far - near) * index / steps
    if (surfaceField(...at(inside), variant) <= 0) {
      let lower = inside
      let upper = outside
      for (let iteration = 0; iteration < 7; iteration++) {
        const mid = (upper + lower) / 2
        if (surfaceField(...at(mid), variant) > 0) upper = mid
        else lower = mid
      }
      return at((lower + upper) / 2)
    }
    outside = inside
  }
}

function lightSurface(point: Vector, variant: number): Vector {
  const [x, y, z] = point
  const epsilon = .0025
  const normal = unit([
    surfaceField(x + epsilon, y, z, variant) - surfaceField(x - epsilon, y, z, variant),
    surfaceField(x, y + epsilon, z, variant) - surfaceField(x, y - epsilon, z, variant),
    surfaceField(x, y, z + epsilon, variant) - surfaceField(x, y, z - epsilon, variant),
  ])
  const facing = Math.max(0, dot(normal, view))
  const reflected: Vector = [
    2 * facing * normal[0] - view[0],
    2 * facing * normal[1] - view[1],
    2 * facing * normal[2] - view[2],
  ]
  const softboxX = dot(reflected, softboxRight) / .45
  const softboxY = dot(reflected, softboxUp) / .52
  const keyReflected = Math.max(0, dot(reflected, key))
  const sheen = Math.exp(-Math.pow(softboxX, 4) - Math.pow(softboxY, 4)) * Math.pow(keyReflected, 5)
  const light = .44 + .53 * Math.max(0, dot(normal, key)) + .18 * Math.max(0, dot(normal, bounce))
    + .11 * Math.max(0, dot(normal, rim))
  const wisps = .992 + .009 * Math.sin(x * 56 + y * 33 + Math.sin(z * 49) + variant)
    + .01 * Math.sin(z * 38 + x * 29 + Math.cos(y * 65))
  const edgeGlow = Math.pow(1 - facing, 2.15) * (.023 + .125 * Math.max(0, dot(normal, rim)))
  const gloss = .36 * sheen + .11 * Math.pow(keyReflected, 15)
    + .105 * Math.pow(Math.max(0, dot(normal, halfRim)), 46)
  return [light * wisps, edgeGlow, gloss]
}

function project(column: number, row: number, variant: number) {
  const x = ((column + .5) / resolution - .5) * fieldWidth
  const y = (.5 - (row + .5) / resolution) * fieldWidth
  return trace([
    x * horizontal[0] + y * vertical[0],
    x * horizontal[1] + y * vertical[1],
    x * horizontal[2] + y * vertical[2],
  ], variant)
}

function renderSurface(variant: number) {
  const surface = new Float32Array(resolution * resolution * 4)
  const covered = new Uint8Array(resolution * resolution)
  for (let row = 0; row < resolution; row++) {
    for (let column = 0; column < resolution; column++) {
      const point = project(column, row, variant)
      if (!point) continue
      const index = row * resolution + column
      const [body, edge, gloss] = lightSurface(point, variant)
      surface.set([body, edge, gloss, 1], index * 4)
      covered[index] = 1
    }
  }

  // Supersample only the perimeter. The transparent silhouette remains smooth at preview size.
  for (let row = 1; row < resolution - 1; row++) {
    for (let column = 1; column < resolution - 1; column++) {
      const index = row * resolution + column
      const center = covered[index]
      if (center === covered[index - 1] && center === covered[index + 1]
        && center === covered[index - resolution] && center === covered[index + resolution]) continue
      const samples = [
        project(column - .25, row - .25, variant), project(column + .25, row - .25, variant),
        project(column - .25, row + .25, variant), project(column + .25, row + .25, variant),
      ].filter((sample) => sample !== undefined)
      const offset = index * 4
      if (!center && samples.length) surface.set(lightSurface(samples[0], variant), offset)
      surface[offset + 3] = samples.length / 4
    }
  }
  return surface
}

const linearize = (byte: number) => {
  const value = byte / 255
  return value < .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4)
}

const encode = (value: number) => (
  255 * (value < .00313 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - .055)
)

function renderColor(color: string, variant: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = resolution
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return canvas

  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue] = [...context.getImageData(0, 0, 1, 1).data].map(linearize)
  let surface = surfaces.get(variant)
  if (!surface) {
    surface = renderSurface(variant)
    surfaces.set(variant, surface)
  }
  const frame = context.createImageData(resolution, resolution)
  for (let index = 0; index < surface.length; index += 4) {
    if (!surface[index + 3]) continue
    const body = surface[index]
    const glow = surface[index + 1]
    const gloss = surface[index + 2]
    frame.data[index] = encode(red * body + glow + gloss)
    frame.data[index + 1] = encode(green * body + glow * .68 + gloss * .97)
    frame.data[index + 2] = encode(blue * body + glow * .44 + gloss * .91)
    frame.data[index + 3] = 255 * surface[index + 3]
  }
  context.putImageData(frame, 0, 0)
  return canvas
}

/** Organic three-dimensional surfaces rendered once as transparent, reusable sprites. */
export function createTteokArtwork(colors: readonly string[], variant = 0): Map<string, HTMLCanvasElement> {
  const result = new Map<string, HTMLCanvasElement>()
  for (const color of colors) {
    const key = `${color}:${variant}`
    if (!artwork.has(key)) artwork.set(key, renderColor(color, variant))
    result.set(color, artwork.get(key)!)
  }
  return result
}
