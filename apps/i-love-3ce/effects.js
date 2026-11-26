export const easeOutBack = p => {
  const c = 1.70158, t = p - 1
  return 1 + (c + 1) * t * t * t + c * t * t
}
const random = (min, max) => min + Math.random() * (max - min)

function heart(ctx, x, y, size, alpha) {
  if (size <= 0 || alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = Math.min(1, alpha)
  ctx.translate(x, y)
  ctx.scale(size, size)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(0, .42)
  ctx.bezierCurveTo(-.15, .24, -.55, -.01, -.48, -.24)
  ctx.bezierCurveTo(-.4, -.54, -.1, -.5, 0, -.3)
  ctx.bezierCurveTo(.1, -.5, .4, -.54, .48, -.24)
  ctx.bezierCurveTo(.55, -.01, .15, .24, 0, .42)
  ctx.fill()
  ctx.restore()
}

export class Effects {
  particles = []
  pop(slot, finger, now) {
    this.particles.push({ kind: 'word', slot, finger, t0: now, dur: 620 })
  }
  wordPop(slot, finger, now) {
    const item = this.particles.findLast(p => p.kind === 'word' && p.slot === slot && p.finger === finger && now < p.t0 + p.dur)
    if (!item) return { scale: 1, y: 0 }
    const p = Math.min(1, (now - item.t0) / item.dur)
    return { scale: 1 + .22 * Math.sin(Math.PI * p), y: -26 * Math.sin(Math.PI * p) }
  }
  hearts(x, y, width, height, now) {
    this.particles.push({ kind: 'bloom', x, y, t0: now, dur: 1400 })
    for (let i = 0; i < 8; i++) this.particles.push({
      kind: 'heart', x: x + random(-12, 12), y: y + random(-6, 6), t0: now + random(0, 120),
      dur: random(1100, 1900), size: random(6, 16), rise: random(75, 220),
      phase: random(0, Math.PI * 2), freq: random(3, 8), amp: random(8, 28), alpha: random(.65, 1),
    })
    for (let i = 0; i < 26; i++) {
      const big = Math.random() < .2
      this.particles.push({
        kind: 'heart', x: random(0, width), y: height + random(16, 38), t0: now + random(0, 350),
        dur: big ? random(3800, 5200) : random(1800, 4200), size: big ? random(24, 36) : random(6, 20),
        rise: big ? random(height * .25, height * .58) : random(height * .45, height * .95),
        phase: random(0, Math.PI * 2), freq: random(3, 10), amp: random(12, 64), alpha: big ? random(.24, .45) : random(.55, .95),
      })
    }
    // A long-running session keeps a bounded particle collection.
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600)
  }
  draw(ctx, now) {
    this.particles = this.particles.filter(item => now < item.t0 + item.dur)
    for (const item of this.particles) {
      const p = (now - item.t0) / item.dur
      if (p < 0 || item.kind === 'word') continue
      if (item.kind === 'bloom') {
        const scale = p < .45 ? easeOutBack(p / .45) : 1
        const alpha = p > .45 ? 1 - (p - .45) / .55 : 1
        heart(ctx, item.x, item.y - 16 * p, 46 * scale, alpha)
        ctx.save()
        ctx.globalAlpha = alpha * .7
        ctx.strokeStyle = '#fff5dd'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(item.x, item.y - 16 * p, 12 + 51 * Math.min(1, p / .7), 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      } else {
        const up = 1 - Math.pow(1 - p, 1.7)
        const scale = p < .12 ? Math.max(0, easeOutBack(p / .12)) : 1
        const fade = p > .55 ? 1 - (p - .55) / .45 : 1
        heart(ctx, item.x + Math.sin(item.phase + p * item.freq) * item.amp, item.y - up * item.rise, item.size * scale, item.alpha * fade)
      }
    }
  }
}
