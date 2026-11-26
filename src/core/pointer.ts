import { DwellSelection, findHandHit } from './dwell-selection'
import type { Point } from '../ui/geometry'

const dragThreshold = 5
const handPointerId = 20_021
const handHoldTime = 280

interface DragOperation {
  move(delta: Point): void
}

export function bindDrag(
  handle: HTMLElement,
  prepare: (event: PointerEvent) => DragOperation | undefined,
) {
  let dragging = false
  let suppressClick = false

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || dragging) return
    suppressClick = false
    const operation = prepare(event)
    if (!operation) return

    dragging = true
    handle.dataset.dragPressed = 'true'
    const { clientX, clientY, pointerId } = event
    const controller = new AbortController()
    const options = { capture: true, signal: controller.signal }

    function finish() {
      controller.abort()
      dragging = false
      delete handle.dataset.dragPressed
      delete handle.dataset.dragging
    }

    function finishPointer(next: PointerEvent) {
      if (next.pointerId === pointerId) finish()
    }

    if (event.isTrusted) {
      handle.setPointerCapture(pointerId)
    }

    document.addEventListener('pointermove', (next) => {
      if (next.pointerId !== pointerId) return
      if (!next.buttons) {
        finish()
        return
      }
      const delta = { x: next.clientX - clientX, y: next.clientY - clientY }
      if (!suppressClick && Math.hypot(delta.x, delta.y) < dragThreshold) return
      suppressClick = true
      handle.dataset.dragging = 'true'
      operation.move(delta)
    }, options)
    document.addEventListener('pointerup', finishPointer, options)
    document.addEventListener('pointercancel', finishPointer, options)
    document.addEventListener('lostpointercapture', finishPointer, options)
    window.addEventListener('blur', finish, { signal: controller.signal })
  })

  handle.addEventListener('click', (event) => {
    if (!suppressClick || event.detail === 0) return
    suppressClick = false
    event.preventDefault()
    event.stopImmediatePropagation()
  }, true)
}

function dragTarget(hit: Element | null) {
  const handle = hit?.closest<HTMLElement>('[data-gesture-target]')
  const control = hit?.closest('button, a, input, select, textarea')
  if (handle && (!control || control === handle)) return handle
}

interface HandGrab {
  target: HTMLElement
  time: number
}

export class GesturePointer {
  readonly cursor: HTMLElement
  #dwell: DwellSelection
  #targetChanged: (target: HTMLElement | undefined) => void
  #grab: HandGrab | undefined
  #pressed = false
  #position: Point = { x: 0, y: 0 }

  constructor(cursor: HTMLElement, targetChanged: (target: HTMLElement | undefined) => void) {
    this.cursor = cursor
    this.#dwell = new DwellSelection(cursor)
    this.#targetChanged = targetChanged
  }

  update(point: Point, time: number, gesture: { pressed: boolean; opening: boolean; dwelling: boolean }) {
    const { pressed, opening, dwelling } = gesture
    const started = pressed && !this.#pressed
    this.#pressed = pressed
    this.#position = point
    this.cursor.hidden = false
    this.cursor.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`
    this.cursor.dataset.pressed = String(pressed)

    const hit = document.elementFromPoint(point.x, point.y)
    const target = dragTarget(hit)
    const { dwell, hideCursorDot } = findHandHit(hit, point)
    this.cursor.toggleAttribute('data-cursor-dot-hidden', hideCursorDot)
    this.#targetChanged(this.#grab?.target ?? target ?? dwell?.element)
    this.#dwell.update(point, dwelling ? dwell : undefined, time)

    if (started) {
      if (target) {
        this.#grab = { target, time }
        target.dataset.handGrabbed = 'true'
        this.#dispatch(target, 'pointerdown', 0, 1)
      }
      return
    }

    const grab = this.#grab
    if (!grab) return
    if (!grab.target.isConnected) {
      this.#finish(grab, 'pointercancel')
      return
    }

    if (!pressed) {
      this.#finish(grab, 'pointerup')
    } else if (time - grab.time >= handHoldTime && !opening) {
      this.#dispatch(grab.target, 'pointermove', -1, 1)
    }
  }

  interrupt() {
    this.#dwell.cancel()
  }

  cancel() {
    this.#dwell.cancel()
    this.#targetChanged(undefined)
    if (this.#grab) this.#finish(this.#grab, 'pointercancel')
    this.#pressed = false
    this.cursor.hidden = true
  }

  #finish(grab: HandGrab, event: 'pointerup' | 'pointercancel') {
    this.#grab = undefined
    delete grab.target.dataset.handGrabbed
    this.#dispatch(grab.target.isConnected ? grab.target : document, event, event === 'pointerup' ? 0 : -1, 0)
  }

  #dispatch(target: EventTarget, type: string, button: number, buttons: number) {
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: this.#position.x,
      clientY: this.#position.y,
      pointerId: handPointerId,
      pointerType: 'hand',
      isPrimary: true,
      button,
      buttons,
    }))
  }
}
