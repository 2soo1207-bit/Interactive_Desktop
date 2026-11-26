import { levelDifficulty, PILLOW_TUNING as T } from './tuning.ts'

export type GamePhase = 'ready' | 'moving' | 'dropping' | 'settling' | 'collapsing' | 'lost' | 'won'
export interface PillowBody {
  id: number
  shade: number
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  angularVelocity: number
  compression: number
  lay: number
  side: 1 | -1
  width: number
  height: number
}
export interface GameEvent {
  type: 'land' | 'perfect' | 'collapse' | 'win'
  shade?: number
  score: number
}
interface Contact {
  offset: number
  compressionVelocity: number
  slideVelocity: number
  bounce: number
  bounceVelocity: number
}
interface Sample { time: number; id: number; x: number; y: number }
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value))
const smoothstep = (a: number, b: number, value: number) => {
  const t = clamp((value - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * A small deterministic, fixed-step stack solver. A cushion has a damped
 * compression spring and a frictional support contact. Every contact carries
 * the mass of the entire sub-stack above it; its center of mass must remain
 * within the overlapping support interval. Unsupported stacks become free
 * rigid bodies with gravity, edge torque, restitution and friction.
 *
 * Rendering is deliberately independent: no DOM, canvas or Three.js here.
 * Public timestamps use performance.now() milliseconds; simulation uses seconds.
 */
export class PillowGame {
  phase: GamePhase = 'ready'
  bodies: PillowBody[] = []
  active: PillowBody | null = null
  score = 0
  now: number
  private order: number[]
  private nextId = 1
  private contacts: Contact[] = []
  private events: GameEvent[] = []
  private history: Sample[] = []
  private accumulator = 0
  private elapsed = 0
  private phaseAge = 0
  private oscillator = 0
  private supportBadFor = 0
  private dropStartY = 0
  private paused = false
  private inputEpoch = 0

  constructor(order: number[], now = 0) {
    if (order.length < T.target || order.some(value => !Number.isFinite(value))) {
      throw new Error('Pillow TOWER needs an order containing 13 valid shade indices.')
    }
    this.order = [...order].slice(0, T.target)
    this.now = now
  }

  start(now: number) {
    if (this.phase !== 'ready') return
    this.now = now
    this.spawn()
    this.record(now)
  }

  /** At most one drop per pillow, even if several input sources fire together. */
  drop(atTime = this.now): boolean {
    if (this.paused || this.phase !== 'moving' || !this.active) return false
    if (!Number.isFinite(atTime) || atTime < this.inputEpoch || atTime < this.now - T.historyMs) return false
    const active = this.active
    if (Number.isFinite(atTime) && atTime >= this.now - T.historyMs && atTime <= this.now) {
      const samples = this.history.filter(sample => sample.id === active.id)
      let before: Sample | undefined
      let after: Sample | undefined
      for (const sample of samples) {
        if (sample.time <= atTime) before = sample
        if (sample.time >= atTime) { after = sample; break }
      }
      // Do not rewind a newly spawned pillow using a previous pillow's gesture.
      if (before) {
        const p = after && after.time > before.time ? (atTime - before.time) / (after.time - before.time) : 0
        active.x = before.x + ((after?.x ?? before.x) - before.x) * p
        active.y = before.y + ((after?.y ?? before.y) - before.y) * p
      }
    }
    active.vx = 0
    active.vy = -18
    this.dropStartY = active.y
    this.changePhase('dropping')
    return true
  }

  pause(now = this.now) {
    this.step(now)
    this.paused = true
  }

  /** Rebase wall-clock timestamps; a paused/background page never catches up. */
  resume(now: number) {
    this.now = now
    this.accumulator = 0
    this.paused = false
    this.inputEpoch = now
    this.history = []
    if (this.phase === 'moving') this.record(now)
  }

  step(now: number) {
    if (!Number.isFinite(now) || now < this.now) return
    const delta = Math.min((now - this.now) / 1000, T.maxFrameTime)
    this.now = now
    if (this.paused || this.phase === 'ready' || this.phase === 'lost') return
    this.accumulator += delta
    while (this.accumulator + 1e-9 >= T.fixedStep) {
      this.tick(T.fixedStep)
      this.accumulator -= T.fixedStep
    }
    if (this.phase === 'moving') this.record(now)
  }

  drainEvents(): GameEvent[] {
    return this.events.splice(0)
  }

  private changePhase(phase: GamePhase) {
    this.phase = phase
    this.phaseAge = 0
  }

  private record(time: number) {
    if (!this.active) return
    this.history.push({ time, id: this.active.id, x: this.active.x, y: this.active.y })
    while (this.history.length > 2 && this.history[1].time < time - T.historyMs) this.history.shift()
  }

  private top() {
    const top = this.bodies.at(-1)
    return top ? top.y + top.height * (1 - top.compression) / 2 : 0
  }

  private spawn() {
    this.oscillator = this.score % 2 === 0 ? -Math.PI / 2 : Math.PI / 2
    const difficulty = levelDifficulty(this.score + 1)
    this.active = {
      id: this.nextId++, shade: this.order[this.score],
      x: Math.sin(this.oscillator) * difficulty.amplitude,
      y: this.top() + T.dropHeight, vx: 0, vy: 0,
      angle: 0, angularVelocity: 0, compression: 0, lay: 0,
      side: this.score % 2 === 0 ? 1 : -1, width: T.width, height: T.height,
    }
    this.history = []
    this.inputEpoch = this.now
    this.changePhase('moving')
    this.record(this.now)
  }

  private tick(dt: number) {
    this.elapsed += dt
    this.phaseAge += dt
    if (this.phase === 'collapsing') {
      this.freeFall(dt)
      if (this.phaseAge >= T.collapseTime) this.changePhase('lost')
      return
    }
    if (this.solveStack(dt)) return
    const active = this.active
    if (this.phase === 'moving' && active) {
      const difficulty = levelDifficulty(this.score + 1)
      this.oscillator += difficulty.angularSpeed * dt
      active.x = Math.sin(this.oscillator) * difficulty.amplitude
      active.vx = Math.cos(this.oscillator) * difficulty.amplitude * difficulty.angularSpeed
      active.y = this.top() + T.dropHeight + Math.sin(this.elapsed * 1.65) * 3
      active.angle = Math.sin(this.elapsed * 1.35) * 0.025
    } else if (this.phase === 'dropping' && active) {
      active.vy -= T.gravity * dt
      active.y += active.vy * dt
      const landingY = this.top() + active.height / 2
      const p = (this.dropStartY - active.y) / Math.max(1, this.dropStartY - landingY)
      active.lay = smoothstep(0.12, 0.88, p)
      active.angle *= Math.exp(-dt * 8)
      if (active.y <= landingY) this.land(active, landingY)
    } else if (this.phase === 'settling' && this.phaseAge >= T.settleTime) {
      if (this.score >= T.target) {
        this.changePhase('won')
        this.events.push({ type: 'win', score: this.score })
      } else {
        this.spawn()
      }
    }
  }

  private land(body: PillowBody, y: number) {
    const lower = this.bodies.at(-1)
    const offset = body.x - (lower?.x ?? 0)
    const impact = Math.abs(body.vy)
    body.y = y
    body.lay = 1
    body.vy = 0
    body.compression = 0.045
    body.vx = offset * 0.055
    body.angularVelocity = offset * 0.0024
    const contact = { offset, compressionVelocity: Math.min(2.6, impact * 0.0026),
      slideVelocity: lower ? offset * .10 : 0, bounce: 0, bounceVelocity: impact * T.impactRebound }
    this.bodies.push(body)
    this.contacts.push(contact)
    this.active = null
    // An impact travels down through the stack, with progressively less energy.
    for (let index = this.bodies.length - 2; index >= 0; index--) {
      const distance = this.bodies.length - 1 - index
      this.contacts[index].compressionVelocity += impact * 0.0021 * Math.exp(-distance * 0.48)
      this.bodies[index].vx += offset * 0.045 * Math.exp(-distance * 0.45)
    }
    if (this.supportError().excess > 0) {
      this.collapse(offset < 0 ? -1 : 1)
      return
    }
    this.score++
    this.events.push({ type: 'land', shade: body.shade, score: this.score })
    if (Math.abs(offset) <= levelDifficulty(this.score).perfectDistance) {
      this.events.push({ type: 'perfect', shade: body.shade, score: this.score })
    }
    this.changePhase('settling')
  }

  private solveStack(dt: number) {
    const count = this.bodies.length
    const difficulty = levelDifficulty(Math.max(1, this.score))
    for (let index = 0; index < count; index++) {
      const body = this.bodies[index]
      const contact = this.contacts[index]
      const lower = this.bodies[index - 1]
      // Static weight gently compresses lower cushions, without crushing them.
      const restingCompression = Math.min(0.105, (count - index - 1) * 0.007)
      contact.compressionVelocity += ((restingCompression - body.compression) * T.compressionStiffness - contact.compressionVelocity * T.compressionDamping) * dt
      body.compression = clamp(body.compression + contact.compressionVelocity * dt, -0.07, 0.31)
      const baseY = lower ? lower.y + lower.height * (1 - lower.compression) / 2 : 0
      const targetY = baseY + body.height * (1 - body.compression) / 2
      if (contact.bounce > 0 || contact.bounceVelocity > 0) {
        contact.bounceVelocity -= T.gravity * .75 * dt
        contact.bounce = Math.max(0, contact.bounce + contact.bounceVelocity * dt)
        if (contact.bounce === 0) contact.bounceVelocity = 0
      }
      body.vy = (targetY + contact.bounce - body.y) / dt
      body.y = targetY + contact.bounce
      const wind = Math.sin(this.elapsed * 1.13 + index * 0.35) * difficulty.wind * index / Math.max(1, count - 1)
      if (lower) {
        // Rounded fabric shoulders slope away from the center. Static friction
        // holds a careful landing; off-center load overcomes it and permanently
        // moves the support contact instead of springing back to the drop spot.
        const slope = lower.angle + Math.pow(contact.offset / (T.width / 2), 3) * T.shoulderSlope
        const friction = difficulty.staticFriction * (contact.bounce > .2 ? .15 : 1)
        if (Math.abs(slope) > friction || Math.abs(contact.slideVelocity) > .6) {
          const direction = Math.sign(contact.slideVelocity || slope)
          const acceleration = T.gravity * T.slideGravity * (Math.sin(slope) - direction * friction * T.kineticFrictionRatio)
          const previous = contact.slideVelocity
          contact.slideVelocity += acceleration * dt
          if (previous * contact.slideVelocity < 0 && Math.abs(slope) < friction) contact.slideVelocity = 0
          contact.offset += contact.slideVelocity * dt
        } else contact.slideVelocity = 0
      }
      const targetX = (lower?.x ?? 0) + contact.offset + wind
      body.vx += ((targetX - body.x) * T.lateralStiffness - body.vx * T.lateralDamping) * dt
      body.x += body.vx * dt
      const targetAngle = (lower?.angle ?? 0) * 0.58 + (body.x - (lower?.x ?? body.x)) / T.width * 0.10 + wind * 0.003
      body.angularVelocity += ((targetAngle - body.angle) * T.angularStiffness - body.angularVelocity * T.angularDamping) * dt
      body.angle += body.angularVelocity * dt
    }
    const error = this.supportError()
    this.supportBadFor = error.excess > 0 ? this.supportBadFor + dt : Math.max(0, this.supportBadFor - dt * 2)
    if (this.supportBadFor >= T.supportFailureTime) this.collapse(error.direction)
    return this.phase === 'collapsing'
  }

  private supportError(): { excess: number; direction: number } {
    let maxExcess = 0
    let direction = 1
    let sum = 0
    const count = this.bodies.length
    const inset = levelDifficulty(Math.max(1, count)).supportInset
    // Each contact supports the entire mass above it, not just the next pillow.
    for (let index = count - 1; index >= 0; index--) {
      const body = this.bodies[index]
      const lower = this.bodies[index - 1]
      sum += body.x
      const centerOfMass = sum / (count - index)
      const half = body.width * 0.49
      const lowerHalf = lower ? lower.width * 0.49 : T.platformHalfWidth
      const left = Math.max(body.x - half, (lower?.x ?? 0) - lowerHalf) + inset
      const right = Math.min(body.x + half, (lower?.x ?? 0) + lowerHalf) - inset
      const excess = Math.max(left - centerOfMass, centerOfMass - right, 0)
      if (excess > maxExcess) {
        maxExcess = excess
        direction = centerOfMass < (left + right) / 2 ? -1 : 1
      }
    }
    return { excess: maxExcess, direction }
  }

  private collapse(direction: number) {
    if (this.phase === 'collapsing' || this.phase === 'lost') return
    this.active = null
    this.changePhase('collapsing')
    this.events.push({ type: 'collapse', score: this.score })
    const count = this.bodies.length
    this.bodies.forEach((body, index) => {
      // Taller/unsupported cushions inherit greater outward torque and velocity.
      const height = (index + 1) / Math.max(1, count)
      body.vx += direction * (26 + height * 80)
      body.vy += 8 + height * 12
      body.angularVelocity += direction * (0.2 + height * 1.1)
    })
  }

  private freeFall(dt: number) {
    for (const body of this.bodies) {
      body.vy -= T.gravity * dt
      body.x += body.vx * dt
      body.y += body.vy * dt
      body.angle += body.angularVelocity * dt
      body.compression *= Math.exp(-dt * 7)
      const extentY = Math.abs(Math.sin(body.angle)) * body.width / 2 + Math.abs(Math.cos(body.angle)) * body.height / 2
      if (body.y < extentY) {
        body.y = extentY
        if (body.vy < -26) {
          body.compression = Math.min(0.23, Math.abs(body.vy) * 0.00022)
          body.vy *= -T.floorRestitution
        } else body.vy = 0
        body.vx *= Math.pow(T.floorFriction, dt * 60)
        body.angularVelocity *= Math.exp(-dt * 5)
      }
    }
    // Soft collision impulses between falling cushions. The rounded pillows
    // use conservative ellipse-like contacts rather than razor-sharp corners.
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i], b = this.bodies[j]
        const dx = b.x - a.x, dy = b.y - a.y
        const rx = (a.width + b.width) * 0.43
        const ry = (a.height + b.height) * 0.43
        const distance = Math.hypot(dx / rx, dy / ry)
        if (distance >= 1 || distance < 0.001) continue
        const nx = dx / (rx * rx), ny = dy / (ry * ry)
        const normalLength = Math.hypot(nx, ny)
        const normalX = nx / normalLength, normalY = ny / normalLength
        const penetration = (1 - distance) * Math.min(rx, ry)
        a.x -= normalX * penetration * 0.5; a.y -= normalY * penetration * 0.5
        b.x += normalX * penetration * 0.5; b.y += normalY * penetration * 0.5
        const closing = (b.vx - a.vx) * normalX + (b.vy - a.vy) * normalY
        if (closing < 0) {
          const impulse = -closing * 0.56
          a.vx -= normalX * impulse; a.vy -= normalY * impulse
          b.vx += normalX * impulse; b.vy += normalY * impulse
          a.angularVelocity -= normalX * 0.025
          b.angularVelocity += normalX * 0.025
        }
      }
    }
  }
}
