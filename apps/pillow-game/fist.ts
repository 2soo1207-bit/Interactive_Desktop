/** Raw landmark geometry and a camera-frame-timestamped, edge-triggered fist. */
export type HandPoint = { x: number; y: number; z: number }
export type FistPose = 'fist' | 'open' | 'neutral'
const distance = (a: HandPoint, b: HandPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const valid = (points: HandPoint[]) => points.length === 21 && points.every(p => [p.x, p.y, p.z].every(Number.isFinite))

function angle(a: HandPoint, b: HandPoint, c: HandPoint) {
  const u = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
  const v = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z }
  const length = Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z)
  return length < 1e-9 ? 180 : Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / length))) * 180 / Math.PI
}

/** World coordinates remove image aspect distortion; image landmarks are the fallback. */
export function fistPose(points: HandPoint[], aspect = 1, world?: HandPoint[]): FistPose {
  if (!valid(points)) return 'neutral'
  const p = world && valid(world) ? world : points.map(point => ({ x: point.x * aspect, y: point.y, z: point.z * aspect }))
  const size = distance(p[0], p[9])
  if (size < 1e-5) return 'neutral'
  const palm = [5, 9, 13, 17].reduce((sum, index) => ({ x: sum.x + p[index].x / 4, y: sum.y + p[index].y / 4, z: sum.z + p[index].z / 4 }), { x: 0, y: 0, z: 0 })
  const fingers = [5, 9, 13, 17].map(index => ({
    bend: angle(p[index], p[index + 1], p[index + 2]),
    tipBend: angle(p[index + 1], p[index + 2], p[index + 3]),
    reach: distance(p[0], p[index + 3]) / size,
    toPalm: distance(p[index + 3], palm) / size,
  }))
  // Require all four fingers to be compact, and three unambiguously curled.
  // A pinch, V sign, or one/two bent fingers must not become a drop.
  const compact = fingers.every(finger => finger.bend < 148 && finger.reach < 1.52 && finger.toPalm < 1.03)
  if (compact && fingers.filter(finger => finger.bend < 132 && finger.toPalm < .88).length >= 3) return 'fist'
  // Deliberately require extended fingers to rearm. Missing/uncertain landmarks
  // are never interpreted as opening a fist.
  if (fingers.every(finger => finger.bend > 143 && finger.tipBend > 135 && finger.reach > 1.28)
    && fingers.filter(finger => finger.bend > 154 && finger.reach > 1.48).length >= 3) return 'open'
  return 'neutral'
}

export const FIST_TIMING = { confirmMs: 38, confirmFrames: 2, releaseMs: 65, releaseFrames: 2, maxFrameGapMs: 230 } as const

export class FistTrigger {
  private candidate: number | null = null
  private frames = 0
  private release: number | null = null
  private releaseFrames = 0
  private lastFrame: number | null = null
  private held = false
  get latched() { return this.held }
  get firstDetectedTime() { return this.candidate }

  /** Loss clears confirmation, but cannot release an already confirmed fist. */
  lost() {
    this.candidate = null; this.frames = 0
    this.release = null; this.releaseFrames = 0; this.lastFrame = null
  }

  reset() { this.lost(); this.held = false }

  update(pose: FistPose, frameTime: number): number | null {
    if (!Number.isFinite(frameTime) || (this.lastFrame !== null && frameTime <= this.lastFrame)) return null
    if (this.lastFrame !== null && frameTime - this.lastFrame > FIST_TIMING.maxFrameGapMs) this.lost()
    this.lastFrame = frameTime
    if (pose === 'fist') {
      this.release = null; this.releaseFrames = 0
      if (this.held) return null
      this.candidate ??= frameTime; this.frames++
      if (this.frames >= FIST_TIMING.confirmFrames && frameTime - this.candidate >= FIST_TIMING.confirmMs) {
        this.held = true
        return this.candidate
      }
      return null
    }
    this.candidate = null; this.frames = 0
    if (pose === 'open') {
      this.release ??= frameTime; this.releaseFrames++
      if (this.releaseFrames >= FIST_TIMING.releaseFrames && frameTime - this.release >= FIST_TIMING.releaseMs) this.held = false
    } else { this.release = null; this.releaseFrames = 0 }
    return null
  }
}

/** Keeps the first visible hand instead of trusting MediaPipe's Left/Right label. */
export class ActivePillowHand {
  private wrist: HandPoint | null = null
  private seen = 0
  update(hands: HandPoint[][], now: number): number {
    const candidates = hands.map((points, index) => ({ points, index })).filter(entry => valid(entry.points))
    if (this.wrist && now - this.seen >= 900) this.wrist = null
    let selected = candidates[0]
    if (this.wrist) {
      const wrist = this.wrist
      selected = candidates.toSorted((a, b) => distance(a.points[0], wrist) - distance(b.points[0], wrist))[0]
      if (!selected || distance(selected.points[0], wrist) > .32) return -1
    }
    if (!selected) return -1
    this.wrist = { ...selected.points[0] }; this.seen = now
    return selected.index
  }
  reset() { this.wrist = null; this.seen = 0 }
}
