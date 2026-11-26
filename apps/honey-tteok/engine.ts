import { COLOR_IDS, RULES } from './config.ts'
import type { TteokColor } from './config.ts'

export interface MouthSample {
  x: number
  y: number
  radiusX: number
  radiusY: number
  open: boolean
}

export interface Piece {
  id: number
  color: TteokColor
  x: number
  y: number
  radius: number
  rotation: number
}

export interface BiteEvent extends Piece {
  correct: boolean
  points: number
  multiplier: number
}

interface FallingPiece extends Piece {
  anchorX: number
  amplitude: number
  phase: number
  age: number
  speedScale: number
  sizeScale: number
  spin: number
}

const lanes = 7

function fitWidth(x: number, radius: number, width: number) {
  return Math.max(radius, Math.min(width - radius, x))
}

function boardSize(value: number) {
  return Number.isFinite(value) ? Math.max(1, value) : 1
}

function contactDistance(piece: Piece, mouth: MouthSample, extraY = 0) {
  const x = (piece.x - mouth.x) / (mouth.radiusX + piece.radius)
  const y = (piece.y - mouth.y) / (mouth.radiusY + piece.radius + extraY)
  return x * x + y * y
}

function validMouth(sample: MouthSample) {
  return typeof sample.open === 'boolean' && Number.isFinite(sample.x) && Number.isFinite(sample.y) &&
    Number.isFinite(sample.radiusX) && sample.radiusX > 0 &&
    Number.isFinite(sample.radiusY) && sample.radiusY >= 0
}

export class HoneyTteokGame {
  readonly target: TteokColor
  #width: number
  #height: number
  #random: () => number
  #pieces: FallingPiece[] = []
  #bites: BiteEvent[] = []
  #elapsed = 0
  #score = 0
  #streak = 0
  #nextDrop = 180
  #frenzyStarted = false
  #nextId = 0
  #lastLane = -1
  #lastColor: TteokColor | undefined
  #colorRun = 0
  #wasOpen = false
  #contact: { id: number; at: number; mouth: MouthSample } | undefined
  #mouthX: number | undefined

  constructor(target: TteokColor, width: number, height: number, random = Math.random) {
    this.target = target
    this.#width = boardSize(width)
    this.#height = boardSize(height)
    this.#random = random
  }

  get pieces(): readonly Piece[] { return this.#pieces }
  get score() { return this.#score }
  get streak() { return this.#streak }
  get multiplier() { return this.#streak >= RULES.comboThreshold ? RULES.comboMultiplier : 1 }
  get elapsedMs() { return this.#elapsed }
  get remainingMs() { return Math.max(0, RULES.durationMs - this.#elapsed) }
  get frenzy() { return this.#frenzyStarted && this.#elapsed < RULES.frenzyStartMs + RULES.frenzyDurationMs && !this.finished }
  get finished() { return this.#elapsed >= RULES.durationMs }
  get biteReady() { return Boolean(this.#contact && this.#elapsed - this.#contact.at <= 95) }

  drainBites(): BiteEvent[] {
    return this.#bites.splice(0)
  }

  resize(width: number, height: number) {
    const nextWidth = boardSize(width)
    const nextHeight = boardSize(height)
    if (nextWidth === this.#width && nextHeight === this.#height) return
    const xScale = nextWidth / this.#width
    const yScale = nextHeight / this.#height
    this.#width = nextWidth
    this.#height = nextHeight
    this.#mouthX = undefined
    for (const piece of this.#pieces) {
      piece.radius = this.#radius() * piece.sizeScale
      piece.anchorX *= xScale
      piece.amplitude *= xScale
      piece.x = fitWidth(piece.x * xScale, piece.radius, nextWidth)
      piece.y *= yScale
    }
    this.#resetMouth()
  }

  update(deltaMs: number) {
    if (this.finished || !Number.isFinite(deltaMs) || deltaMs <= 0) return
    const end = Math.min(RULES.durationMs, this.#elapsed + deltaMs)

    while (this.#elapsed < end) {
      const frenzyAt = this.#frenzyStarted ? Infinity : Math.max(this.#elapsed, RULES.frenzyStartMs)
      const next = Math.min(end, this.#nextDrop, frenzyAt)
      this.#advance(next - this.#elapsed)
      this.#elapsed = next
      if (this.finished) break

      if (next === frenzyAt) {
        this.#frenzyStarted = true
        const offset = Math.floor(this.#random() * lanes)
        for (let index = 0; index < RULES.frenzyBurstSize; index++) {
          this.#spawn((offset + index * 2) % lanes, index * this.#height * .026)
        }
        this.#nextDrop = next + this.#dropInterval()
      } else if (next === this.#nextDrop) {
        this.#spawn()
        this.#nextDrop = next + this.#dropInterval()
      }
    }
  }

  sampleMouth(sample: MouthSample | null) {
    if (this.finished || !sample || !validMouth(sample) ||
      sample.x < 0 || sample.x > this.#width || sample.y < 0 || sample.y > this.#height) {
      this.#resetMouth()
      this.#mouthX = undefined
      return
    }
    this.#mouthX = sample.x
    if (sample.open) {
      this.#wasOpen = true
      let nearest: FallingPiece | undefined
      let distance = 1
      for (const piece of this.#pieces) {
        if (piece.y + piece.radius < 0 || piece.y - piece.radius > this.#height) continue
        const candidate = contactDistance(piece, sample)
        if (candidate <= distance) {
          nearest = piece
          distance = candidate
        }
      }
      if (nearest) this.#contact = { id: nearest.id, at: this.#elapsed, mouth: sample }
      else if (this.#contact && this.#elapsed - this.#contact.at > RULES.biteGraceMs) this.#contact = undefined
      return
    }
    if (!this.#wasOpen) return

    const contact = this.#contact
    this.#resetMouth()
    if (!contact || this.#elapsed - contact.at > RULES.biteGraceMs) return
    const index = this.#pieces.findIndex((piece) => piece.id === contact.id)
    if (index < 0) return
    const piece = this.#pieces[index]
    // A falling piece travels while the worker confirms the snap of the lips.
    // Allow a short downward follow-through near the same mouth position.
    const mouth = { ...sample, radiusY: Math.max(sample.radiusY, contact.mouth.radiusY) }
    const stillNear = contactDistance(piece, mouth, piece.y >= mouth.y ? piece.radius * .58 : 0) <= 1
    const stayedNear = Math.hypot(sample.x - contact.mouth.x, sample.y - contact.mouth.y) <= sample.radiusX + piece.radius
    if (!stillNear || !stayedNear) return

    this.#pieces.splice(index, 1)
    const correct = piece.color === this.target
    this.#streak = correct ? this.#streak + 1 : 0
    const multiplier = this.multiplier
    const points = correct ? RULES.targetPoints * multiplier : RULES.wrongPoints
    this.#score += points
    const { id, color, x, y, radius, rotation } = piece
    this.#bites.push({ id, color, x, y, radius, rotation, correct, points, multiplier })
  }

  #resetMouth() {
    this.#wasOpen = false
    this.#contact = undefined
  }

  #radius() {
    return Math.min(Math.max(12, Math.min(this.#width, this.#height) * .042), this.#width * .12, this.#height * .15, 40)
  }

  #dropInterval() {
    const progress = this.#elapsed / RULES.durationMs
    const interval = this.frenzy
      ? RULES.frenzyIntervalMs
      : RULES.initialDropIntervalMs + (RULES.finalDropIntervalMs - RULES.initialDropIntervalMs) * progress
    return Math.max(25, interval * (.84 + this.#random() * .32))
  }

  #spawn(explicitLane?: number, offsetY = 0) {
    const random = this.#random
    let lane = explicitLane ?? Math.floor(random() * lanes)
    if (explicitLane === undefined && lane === this.#lastLane) {
      lane = (lane + 1 + Math.floor(random() * (lanes - 1))) % lanes
    }
    this.#lastLane = lane

    const other = COLOR_IDS.find((color) => color !== this.target)!
    let color = this.#nextId === 0 || random() < .55 ? this.target : other
    if (this.#colorRun >= 2 && color === this.#lastColor) color = color === this.target ? other : this.target
    this.#colorRun = color === this.#lastColor ? this.#colorRun + 1 : 1
    this.#lastColor = color

    const sizeScale = .8 + random() * .28
    const radius = this.#radius() * sizeScale
    const middle = this.#width / 2
    const mouthX = this.#mouthX ?? middle
    const laneOffset = (lane / (lanes - 1) - .5) * this.#width * .46
    const jitter = (random() - .5) * this.#width * .044
    const x = fitWidth(this.#nextId === 0 ? mouthX : middle + (mouthX - middle) * .38 + laneOffset + jitter, radius, this.#width)
    const amplitude = this.#nextId > 0 && random() < .48 ? (.016 + random() * .026) * this.#width : 0
    this.#pieces.push({
      id: ++this.#nextId, color, x, y: -radius - offsetY, radius,
      rotation: (random() - .5) * .75,
      anchorX: x, amplitude, phase: random() * Math.PI * 2, age: 0,
      speedScale: .87 + random() * .25, sizeScale, spin: (random() - .5) * 1.35,
    })
  }

  #advance(deltaMs: number) {
    const seconds = deltaMs / 1000
    const progress = (this.#elapsed + deltaMs / 2) / RULES.durationMs
    const speed = (RULES.initialFallSpeed + (RULES.finalFallSpeed - RULES.initialFallSpeed) * progress) * this.#height
    this.#pieces = this.#pieces.filter((piece) => {
      piece.age += seconds
      piece.y += speed * piece.speedScale * seconds
      piece.rotation += piece.spin * seconds
      const wave = .75 * (Math.sin(piece.phase + piece.age * 3.4) - Math.sin(piece.phase))
      const ripple = .25 * (Math.sin(piece.phase + piece.age * 6.1) - Math.sin(piece.phase))
      piece.x = fitWidth(piece.anchorX + piece.amplitude * (wave + ripple), piece.radius, this.#width)
      if (piece.y - piece.radius <= this.#height) return true
      if (piece.color === this.target) this.#streak = 0
      return false
    })
  }
}
