import * as THREE from 'three'
import design from './assets/product-design.json' with { type: 'json' }

// X/Z are the exact normalized Image B front silhouette. Y is the soft volume
// from Image A. Keeping 260×66 preserves the existing physics contact envelope.
export const CUSHION = {
  width: 260, height: 66,
  depth: 260 * design.reference.bounds[3] / design.reference.bounds[2],
  maxEdge: 5.5,
} as const
export const PRODUCT_PROFILE = design.reference

const contours = [PRODUCT_PROFILE.outer, ...PRODUCT_PROFILE.holes].map(loop =>
  loop.map(([u, v]) => new THREE.Vector2((u - .5) * CUSHION.width, (v - .5) * CUSHION.depth)))

function boundaryDistance(x: number, z: number) {
  let closest = Infinity
  for (const loop of contours) for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length]
    const dx = b.x - a.x, dz = b.y - a.y
    const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.y) * dz) / Math.max(1e-9, dx * dx + dz * dz), 0, 1)
    closest = Math.min(closest, Math.hypot(x - a.x - t * dx, z - a.y - t * dz))
  }
  return closest
}

function heightAt(x: number, z: number, front: boolean) {
  const v = z / CUSHION.depth + .5
  const distance = boundaryDistance(x, z)
  const inflated = Math.pow(Math.sin(Math.min(1, distance / 39) * Math.PI / 2), .7)
  const half = front ? 34.2 : 31.4
  // The lid is its own smooth section. The measured split runs across v=.39.
  const split = .39 + .013 * Math.max(0, 1 - Math.pow(x / 61, 2))
  const lidGroove = front ? Math.exp(-Math.pow((v - split) * CUSHION.depth / .95, 2)) * 2.2 : 0
  const cap = front && v < split ? .92 : 1
  // Preserve the pressed center and gathered shoulders; don't run a generic
  // vertical crease through the lid or through the printed triangle.
  const lowerMask = THREE.MathUtils.smoothstep(v, .41, .49)
  const bottomCrease = .11 * Math.exp(-Math.pow(x / 6, 2)) * THREE.MathUtils.smoothstep(v, .76, .97)
  const leftFold = Math.exp(-Math.pow((x + 38 + (v - .69) * 105) / 4, 2))
  const rightFold = Math.exp(-Math.pow((x - 38 - (v - .69) * 105) / 4, 2))
  const gathered = (leftFold + rightFold) * .07 * Math.exp(-Math.pow((v - .70) / .15, 2)) * lowerMask
  const tiny = Math.sin(x * .24 + z * .11) * Math.exp(-distance / 12) * .38
  const h = half * inflated * cap * (1 - bottomCrease - gathered) - lidGroove * inflated + tiny * inflated
  return front ? h : -h
}

/** Refine the actual outline triangulation. Shared edge midpoints keep the
 * cap watertight, including the hole, instead of leaving alpha-only fake cuts. */
function tessellate(points: THREE.Vector2[], initial: number[][]) {
  let triangles = initial
  for (let pass = 0; pass < 10; pass++) {
    const splits = new Map<string, number>()
    const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`
    for (const triangle of triangles) for (let j = 0; j < 3; j++) {
      const a = triangle[j], b = triangle[(j + 1) % 3], id = key(a, b)
      if (!splits.has(id) && points[a].distanceToSquared(points[b]) > CUSHION.maxEdge ** 2) {
        splits.set(id, points.length); points.push(points[a].clone().add(points[b]).multiplyScalar(.5))
      }
    }
    if (!splits.size) break
    const refined: number[][] = []
    for (const [a, b, c] of triangles) {
      const ab = splits.get(key(a, b)), bc = splits.get(key(b, c)), ca = splits.get(key(c, a))
      if (ab !== undefined && bc !== undefined && ca !== undefined) refined.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca])
      else if (ab !== undefined && bc !== undefined) refined.push([a, ab, c], [ab, bc, c], [ab, b, bc])
      else if (bc !== undefined && ca !== undefined) refined.push([b, bc, a], [bc, ca, a], [bc, c, ca])
      else if (ca !== undefined && ab !== undefined) refined.push([c, ca, b], [ca, ab, b], [ca, a, ab])
      else if (ab !== undefined) refined.push([a, ab, c], [ab, b, c])
      else if (bc !== undefined) refined.push([b, bc, a], [bc, c, a])
      else if (ca !== undefined) refined.push([c, ca, b], [ca, a, b])
      else refined.push([a, b, c])
    }
    triangles = refined
  }
  return triangles
}

export function createCushionGeometry() {
  const points = contours.flat().map(point => point.clone())
  const initial = THREE.ShapeUtils.triangulateShape(contours[0], contours.slice(1))
  const triangles = tessellate(points, initial)
  const frontPositions: number[] = [], backPositions: number[] = [], photoUV: number[] = [], clothUV: number[] = []
  for (const p of points) {
    frontPositions.push(p.x, heightAt(p.x, p.y, true), p.y)
    backPositions.push(p.x, heightAt(p.x, p.y, false), p.y)
    // Texture coordinates reproduce the full front photo at its original ratio.
    photoUV.push(p.x / CUSHION.width + .5, .5 - p.y / CUSHION.depth)
    clothUV.push(p.x / CUSHION.width + .5, p.y / CUSHION.depth + .5)
  }
  const frontIndices: number[] = [], backIndices: number[] = []
  for (const [a, b, c] of triangles) {
    const ab = points[b].clone().sub(points[a]), ac = points[c].clone().sub(points[a])
    const up = ab.x * ac.y - ab.y * ac.x < 0 ? [a, b, c] : [a, c, b]
    frontIndices.push(...up); backIndices.push(up[0], up[2], up[1])
  }
  const make = (positions: number[], indices: number[], uv: number[]) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(indices); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere()
    return g
  }
  const front = make(frontPositions, frontIndices, photoUV)
  const back = make(backPositions, backIndices, clothUV)
  // A real tube closes the cloth's perimeter and the ring's inner rim.
  const piping = new THREE.BufferGeometry()
  const seamPositions: number[] = [], seamUV: number[] = [], seamIndices: number[] = []
  for (const loop of contours) {
    const offset = seamPositions.length / 3
    for (let i = 0; i <= loop.length; i++) {
      const point = loop[i % loop.length]
      const tangent = loop[(i + 1) % loop.length].clone().sub(loop[(i + loop.length - 1) % loop.length]).normalize()
      const normal = new THREE.Vector2(-tangent.y, tangent.x)
      for (let j = 0; j <= 8; j++) {
        const angle = j / 8 * Math.PI * 2, r = .48
        seamPositions.push(point.x + normal.x * Math.cos(angle) * r, Math.sin(angle) * r, point.y + normal.y * Math.cos(angle) * r)
        seamUV.push(i / loop.length, j / 8)
        if (i < loop.length && j < 8) {
          const a = offset + i * 9 + j, b = a + 9
          seamIndices.push(a, b, a + 1, a + 1, b, b + 1)
        }
      }
    }
  }
  piping.setAttribute('position', new THREE.Float32BufferAttribute(seamPositions, 3))
  piping.setAttribute('uv', new THREE.Float32BufferAttribute(seamUV, 2))
  piping.setIndex(seamIndices); piping.computeVertexNormals()
  return { front, back, piping }
}

/** Small deterministic non-color weave shared by all thirteen materials. */
export function createSatinWeave() {
  const size = 128, data = new Uint8Array(size * size * 4)
  let seed = 73
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const value = Math.round(190 + Math.sin((x + y) * Math.PI / 2) * 15 + ((seed / 4294967296) - .5) * 14)
    const i = (y * size + x) * 4
    data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255
  }
  const texture = new THREE.DataTexture(data, size, size)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(12, 8); texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

export type ProductPhoto = { width: number; height: number; bounds: number[] }
export function configureProductTexture(texture: THREE.Texture, source: ProductPhoto) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.offset.set(source.bounds[0] / source.width, 1 - (source.bounds[1] + source.bounds[3]) / source.height)
  texture.repeat.set(source.bounds[2] / source.width, source.bounds[3] / source.height)
  texture.needsUpdate = true
}

export function createSatinMaterials(color: string, weave: THREE.Texture, photograph: THREE.Texture) {
  const base = new THREE.Color(color)
  // The photograph already contains the product's real color, logo and satin
  // lighting. No white tint, exposure or ACES pass is added to its front face.
  const front = new THREE.MeshBasicMaterial({ map: photograph, color: 0xffffff, toneMapped: false, alphaTest: .12 })
  // Only a small orientation-dependent darkening is added during the actual 3D
  // turn; source pixels at the front-facing pose keep their unaltered RGB.
  front.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vClothFacing;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvClothFacing = abs(normalize(normalMatrix * vec3(0.0, 1.0, 0.0)).z);')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vClothFacing;')
      .replace('#include <opaque_fragment>', 'outgoingLight *= mix(0.82, 1.0, smoothstep(0.0, 0.95, vClothFacing));\n#include <opaque_fragment>')
  }
  front.customProgramCacheKey = () => 'pillow-photo-color-preserving-v1'
  const cloth = new THREE.MeshPhysicalMaterial({
    color: base, metalness: 0, roughness: .43,
    sheen: .65, sheenRoughness: .62, sheenColor: base,
    anisotropy: .55, anisotropyRotation: Math.PI / 2,
    bumpMap: weave, bumpScale: .12, roughnessMap: weave,
    clearcoat: 0, envMapIntensity: .45, toneMapped: false,
  })
  const piping = cloth.clone()
  piping.color.multiplyScalar(.86); piping.roughness = .5; piping.bumpScale = .07
  for (const material of [cloth, piping]) {
    // Use the woven PBR normal with a broad softbox response in source chroma.
    // Unlike clipping an overbright environment, this keeps rounded gradients,
    // seam gathers and satin highlights visible without bleaching the shade.
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        vec3 clothNormal = normalize(normal);
        float softbox = max(0.0, dot(clothNormal, normalize(vec3(-0.35, 0.75, 1.0))));
        float satinLobe = pow(max(0.0, dot(clothNormal, normalize(vec3(-0.35, 0.75, 2.0)))), 18.0);
        float fabricShade = 0.50 + 0.42 * softbox + 0.12 * satinLobe;
        outgoingLight = diffuseColor.rgb * fabricShade;
        #include <opaque_fragment>`)
    }
    material.customProgramCacheKey = () => 'pillow-satin-source-chroma-v1'
  }
  return { front, cloth, piping }
}
