export const FINGERS = [
  { tip: 8, joint: 6 }, { tip: 12, joint: 10 },
  { tip: 16, joint: 14 }, { tip: 20, joint: 18 },
]
export const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15],
  [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
]

export function coverCrop(videoWidth, videoHeight, width, height) {
  const scale = Math.max(width / videoWidth, height / videoHeight)
  const cropW = width / scale, cropH = height / scale
  return { x: (videoWidth - cropW) / 2, y: (videoHeight - cropH) / 2, width: cropW, height: cropH }
}

export function screenPoint(lm, videoWidth, videoHeight, crop, width, height, mirrored) {
  const x = (lm.x * videoWidth - crop.x) / crop.width * width
  return { x: mirrored ? width - x : x, y: (lm.y * videoHeight - crop.y) / crop.height * height }
}

export function wordPosition(tip, joint, distance = 40) {
  const dx = tip.x - joint.x, dy = tip.y - joint.y
  const length = Math.hypot(dx, dy)
  return { x: tip.x + (length > .001 ? dx / length : 0) * distance, y: tip.y + (length > .001 ? dy / length : -1) * distance }
}

const distance = (a, b, aspect = 1) => Math.hypot((a.x - b.x) * aspect, a.y - b.y)
export const newPinch = () => ({ active: -1, contacts: 0, lastAction: -Infinity })

// Raw landmarks only: visual EMA must never add latency to gesture detection.
export function detectPinch(landmarks, state, now, aspect = 1) {
  const size = distance(landmarks[0], landmarks[9], aspect)
  if (size < .0001) return -1
  const thumb = landmarks[4]
  const candidates = FINGERS.map((finger, index) => ({
    index,
    distance: distance(thumb, landmarks[finger.tip], aspect) / size,
    jointDistance: distance(thumb, landmarks[finger.joint], aspect) / size,
  }))
  if (state.active >= 0) {
    if (candidates[state.active].distance > .42) { state.active = -1; state.contacts = 0 }
    return -1
  }
  const eligible = candidates.filter(item => item.distance < item.jointDistance).sort((a, b) => a.distance - b.distance)
  const closest = eligible[0]
  if (!closest || closest.distance >= .27) { state.contacts = 0; return -1 }
  // Count contact across candidate changes, but never guess an ambiguous finger.
  state.contacts++
  if (eligible[1] && eligible[1].distance - closest.distance < .05) return -1
  if (state.contacts < 2 && closest.distance >= .19) return -1
  state.active = closest.index
  state.contacts = 0
  if (now - state.lastAction < 350) return -1
  state.lastAction = now
  return closest.index
}

function newSlot(id) {
  return { id, raw: null, smooth: null, wrist: null, lastSeen: -Infinity, visible: false, pinch: newPinch() }
}

export class HandSlots {
  slots = [newSlot(0), newSlot(1)]

  update(detections, now) {
    const hands = detections.filter(hand => hand.length === 21 && hand.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).slice(0, 2)
    this.slots = this.slots.map(slot => now - slot.lastSeen >= 900 ? newSlot(slot.id) : slot)
    this.slots.forEach(slot => { slot.visible = false })
    const existing = this.slots.filter(slot => slot.wrist)
    const pairs = []
    if (hands.length === 1) {
      const slot = existing.length ? existing.reduce((best, item) => distance(item.wrist, hands[0][0]) < distance(best.wrist, hands[0][0]) ? item : best) : this.slots[0]
      pairs.push([slot, hands[0]])
    } else if (hands.length === 2) {
      if (existing.length === 2) {
        const [a, b] = this.slots
        const straight = distance(a.wrist, hands[0][0]) + distance(b.wrist, hands[1][0])
        const swapped = distance(a.wrist, hands[1][0]) + distance(b.wrist, hands[0][0])
        pairs.push([a, hands[straight <= swapped ? 0 : 1]], [b, hands[straight <= swapped ? 1 : 0]])
      } else if (existing.length === 1) {
        const slot = existing[0], other = this.slots.find(item => item !== slot)
        const nearest = distance(slot.wrist, hands[0][0]) <= distance(slot.wrist, hands[1][0]) ? 0 : 1
        pairs.push([slot, hands[nearest]], [other, hands[1 - nearest]])
      } else pairs.push([this.slots[0], hands[0]], [this.slots[1], hands[1]])
    }
    for (const [slot, hand] of pairs) {
      const smooth = hand.map((point, index) => ({
        x: slot.smooth ? slot.smooth[index].x + .45 * (point.x - slot.smooth[index].x) : point.x,
        y: slot.smooth ? slot.smooth[index].y + .45 * (point.y - slot.smooth[index].y) : point.y,
        z: point.z ?? 0,
      }))
      slot.raw = hand
      slot.smooth = smooth
      slot.wrist = hand[0]
      slot.lastSeen = now
      slot.visible = true
    }
    const visible = this.slots.filter(slot => slot.visible)
    // A lone hand always receives the first three words, regardless of its slot.
    return visible.map(slot => ({ slot, role: visible.length === 1 ? 0 : slot.id }))
  }
}
