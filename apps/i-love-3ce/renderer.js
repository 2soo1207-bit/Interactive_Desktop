import { uiFont } from '../shared/typography.ts'
import { CONNECTIONS, FINGERS, screenPoint, wordPosition } from './tracking.js'
import { WORD_COLORS } from './settings.js'

export function drawHand(ctx, points, role, slotId, settings, effects, now, skeleton, geometry) {
  const screen = points.map(point => screenPoint(point, geometry.videoWidth, geometry.videoHeight, geometry.crop, geometry.width, geometry.height, geometry.mirrored))
  const indices = role === 0 ? [0, 1, 2] : [3, 4, -1]
  if (skeleton) {
    ctx.save()
    ctx.lineWidth = 1.2
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#000'
    ctx.beginPath()
    for (const [a, b] of CONNECTIONS) {
      ctx.moveTo(screen[a].x, screen[a].y)
      ctx.lineTo(screen[b].x, screen[b].y)
    }
    ctx.stroke()
    for (let i = 0; i < screen.length; i++) {
      const finger = FINGERS.findIndex(item => item.tip === i)
      ctx.fillStyle = finger >= 0 && indices[finger] >= 0 ? WORD_COLORS[indices[finger]] : '#fff'
      ctx.beginPath()
      ctx.arc(screen[i].x, screen[i].y, 2.7, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
  for (let finger = 0; finger < 3; finger++) {
    const tip = screen[FINGERS[finger].tip], joint = screen[FINGERS[finger].joint]
    const point = wordPosition(tip, joint)
    const index = indices[finger]
    const word = index < 0 ? '♥' : settings.words[index]
    const color = index < 0 ? '#fff' : WORD_COLORS[index]
    const pop = effects.wordPop(slotId, finger, now)
    let size = Math.max(24, Math.min(46, geometry.width * .032))
    ctx.save()
    ctx.font = `700 ${size}px ${uiFont}`
    const maxWidth = Math.min(210, geometry.width * .43)
    if (ctx.measureText(word).width > maxWidth) size *= maxWidth / ctx.measureText(word).width
    ctx.translate(point.x, point.y + pop.y)
    ctx.scale(pop.scale, pop.scale)
    ctx.font = `700 ${size}px ${uiFont}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = size * .07
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.shadowColor = '#00000025'
    ctx.shadowBlur = 4
    ctx.shadowOffsetY = 1
    ctx.strokeText(word, 0, 0)
    ctx.shadowColor = 'transparent'
    ctx.fillText(word, 0, 0)
    ctx.restore()
  }
}
