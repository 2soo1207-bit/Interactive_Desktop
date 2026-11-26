import type { Shutter } from './media.ts'

// Only the paper's presentation moves. The composited/exported pixels stay intact.
export class PrintDelivery {
  private sheet: HTMLElement
  private stage: HTMLElement
  private sound: Shutter
  private animation?: Animation
  private generation = 0
  constructor(sheet: HTMLElement, stage: HTMLElement, sound: Shutter) {
    this.sheet = sheet; this.stage = stage; this.sound = sound
  }
  prepare() {
    this.reset()
    this.stage.dataset.print = 'pending'
  }
  async feed() {
    const token = ++this.generation
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !this.sheet.animate) {
      this.stage.dataset.print = 'delivered'
      return
    }
    this.stage.dataset.print = 'feeding'
    this.sound.startPrinter()
    const animation = this.sheet.animate([
      { transform: 'translateY(calc(-100% - 24px))', offset: 0 },
      { transform: 'translateY(-98%)', offset: .04 },
      { transform: 'translateY(-86%)', offset: .17 },
      { transform: 'translateY(-86%)', offset: .185 },
      { transform: 'translateY(-60%)', offset: .4 },
      { transform: 'translateY(-60%)', offset: .415 },
      { transform: 'translateY(-30%)', offset: .67 },
      { transform: 'translateY(-30%)', offset: .685 },
      { transform: 'translateY(1px) rotate(.15deg)', offset: .96 },
      { transform: 'translateY(0) rotate(0deg)', offset: 1 },
    ], { duration: 4400, easing: 'linear', fill: 'both' })
    this.animation = animation
    try {
      await animation.finished
      if (token !== this.generation) return
      this.stage.dataset.print = 'delivered'
      animation.cancel()
      this.animation = undefined
      this.sound.stopPrinter()
    } catch { /* Leaving the print screen cancels this delivery. */ }
  }
  reset() {
    ++this.generation
    this.animation?.cancel()
    this.animation = undefined
    this.sound.stopPrinter()
    delete this.stage.dataset.print
  }
}
