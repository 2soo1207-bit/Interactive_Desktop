import { PillowGame } from './physics.ts'

/** A short real-physics demonstration, isolated from score and collection data. */
export class PillowDemo {
  game: PillowGame
  private holdAt: number | null = null
  private startedAt: number
  scale = 1

  constructor(now: number) {
    this.startedAt = now
    this.game = new PillowGame([7, 2, 6, 3, 9, 1, 5, 8, 0, 10, 12, 4, 11], now)
    this.game.start(now)
  }

  reset(now: number) {
    this.game = new PillowGame([7, 2, 6, 3, 9, 1, 5, 8, 0, 10, 12, 4, 11], now)
    this.game.start(now); this.holdAt = null; this.startedAt = now; this.scale = 1
  }

  step(now: number) {
    if (this.holdAt !== null) {
      const age = now - this.holdAt
      this.scale = Math.max(0, 1 - Math.max(0, age - 1400) / 450)
      if (age > 1900) this.reset(now)
      return
    }
    this.game.step(now)
    if (this.game.phase === 'moving' && this.game.active && Math.abs(this.game.active.x) < 5) this.game.drop()
    if (this.game.score === 3 && this.game.phase === 'moving') {
      this.game.active = null; this.game.pause(now); this.holdAt = now
    }
    if (this.game.phase === 'lost') this.reset(now)
    this.scale = Math.min(1, (now - this.startedAt) / 300)
    this.game.drainEvents()
  }

  pause(now: number) { this.game.pause(now) }
  still(now: number) {
    this.reset(now)
    for (let time = now; time < now + 20_000 && this.holdAt === null; time += 1000 / 60) this.step(time)
    this.game.resume(now); this.game.pause(now); this.scale = 1; this.holdAt = now
  }
  resume(now: number) {
    const gap = now - this.game.now
    if (this.holdAt !== null) this.holdAt += gap
    this.startedAt += gap; this.game.resume(now)
  }
}
