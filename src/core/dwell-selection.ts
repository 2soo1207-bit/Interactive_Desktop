import type { Point } from '../ui/geometry'

export const DWELL_DURATION = 1500

const controlSelector = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[data-hand-dwell]',
].join(', ')

type HitArea = Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom'>

interface DwellTarget {
  element: HTMLElement
  bounds: HitArea
}

function findControl(hit: Element | null) {
  const control = hit?.closest<HTMLElement>(controlSelector)
  if (!control || typeof control.click !== 'function' || control.matches(':disabled')) return
  if (control.closest('[inert], [aria-disabled="true"]')) return
  return control
}

export function findHandHit(hit: Element | null, point: Point): { dwell?: DwellTarget; hideCursorDot: boolean } {
  let localHit = hit
  let left = 0
  let top = 0
  let scaleX = 1
  let scaleY = 1

  if (hit instanceof HTMLIFrameElement) {
    const frameDocument = hit.contentDocument
    if (!hit.classList.contains('app-frame') || !frameDocument || hit.closest('[inert]')) return { hideCursorDot: false }

    const frame = hit.getBoundingClientRect()
    if (!frame.width || !frame.height || !hit.offsetWidth || !hit.offsetHeight) return { hideCursorDot: false }
    scaleX = frame.width / hit.offsetWidth
    scaleY = frame.height / hit.offsetHeight
    left = frame.left + hit.clientLeft * scaleX
    top = frame.top + hit.clientTop * scaleY
    localHit = frameDocument.elementFromPoint((point.x - left) / scaleX, (point.y - top) / scaleY)
  }

  const hideCursorDot = Boolean(localHit?.closest('[data-hand-camera], [data-hide-hand-cursor]'))
  const element = findControl(localHit)
  if (!element) return { hideCursorDot }

  const rect = element.getBoundingClientRect()
  return {
    hideCursorDot,
    dwell: {
      element,
      bounds: {
        left: left + rect.left * scaleX,
        right: left + rect.right * scaleX,
        top: top + rect.top * scaleY,
        bottom: top + rect.bottom * scaleY,
      },
    },
  }
}

export class DwellSelection {
  #cursor: HTMLElement
  #hover: { target: HTMLElement; since: number } | undefined
  #selectedArea: HitArea | undefined

  constructor(cursor: HTMLElement) {
    this.#cursor = cursor
  }

  update(point: Point, target: DwellTarget | undefined, time: number) {
    const area = this.#selectedArea
    if (area && (point.x < area.left || point.x >= area.right || point.y < area.top || point.y >= area.bottom)) {
      this.#selectedArea = undefined
    }
    if (!target || this.#selectedArea) {
      this.cancel()
      return
    }

    if (this.#hover?.target !== target.element) {
      this.#hover = { target: target.element, since: time }
      this.#cursor.dataset.dwelling = 'true'
    }

    const elapsed = time - this.#hover.since
    if (elapsed >= DWELL_DURATION) {
      // Latch the original hit area even if opening the item covers it with a window.
      this.#selectedArea = target.bounds
      this.cancel()
      target.element.focus({ preventScroll: true })
      target.element.click()
      return
    }

    this.#cursor.style.setProperty('--dwell-progress', `${elapsed / DWELL_DURATION * 100}%`)
  }

  cancel() {
    if (!this.#hover) return
    this.#hover = undefined
    delete this.#cursor.dataset.dwelling
    this.#cursor.style.removeProperty('--dwell-progress')
  }
}
