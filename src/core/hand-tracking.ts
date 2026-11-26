import { clamp } from '../ui/geometry'
import type { Point } from '../ui/geometry'
import type { Camera } from './camera'
import { GesturePointer } from './pointer'

const pinchClose = 0.29
const pinchOpen = 0.45
const edgeDuration = 28
const trackingGrace = 230

/** The 21 MediaPipe landmarks in normalized, unmirrored video coordinates. */
export type HandLandmarks = readonly Point[]

export interface HandTracker {
  start(
    video: HTMLVideoElement,
    publish: (landmarks: HandLandmarks | null) => void,
    signal: AbortSignal,
    onError: (error: unknown) => void,
  ): void | Promise<void>
}

export interface HandState {
  enabled: boolean
  active: boolean
  message: string
}

function readHand(landmarks: HandLandmarks | null, video: HTMLVideoElement) {
  const { videoWidth, videoHeight } = video
  const wrist = landmarks?.[0]
  const thumb = landmarks?.[4]
  const indexBase = landmarks?.[5]
  const tip = landmarks?.[8]
  const middleBase = landmarks?.[9]
  const pinkyBase = landmarks?.[17]
  if (!wrist || !thumb || !indexBase || !tip || !middleBase || !pinkyBase || !videoWidth || !videoHeight) return

  const distance = (a: Point, b: Point) => Math.hypot((a.x - b.x) * videoWidth, (a.y - b.y) * videoHeight)
  const palm = Math.max(distance(indexBase, pinkyBase), distance(wrist, middleBase))
  const pinch = distance(tip, thumb) / palm
  if (palm < Math.min(videoWidth, videoHeight) * 0.025 || !Number.isFinite(pinch)) return

  // The virtual pointer follows the mirrored, center-cropped video.
  const rect = video.getBoundingClientRect()
  const scale = Math.max(rect.width / videoWidth, rect.height / videoHeight)
  const x = rect.left + rect.width / 2 + (0.5 - tip.x) * videoWidth * scale
  const y = rect.top + rect.height / 2 + (tip.y - 0.5) * videoHeight * scale
  return {
    pinch,
    point: { x: clamp(x, 0, window.innerWidth - 1), y: clamp(y, 0, window.innerHeight - 1) },
  }
}

export class HandInput {
  #camera: Camera
  #tracker: HandTracker
  #pointer: GesturePointer
  #enabled = false
  #run: AbortController | undefined
  #listener: ((state: HandState) => void) | undefined
  #lastSample: { point: Point; time: number } | undefined
  #pressed = false
  #waitForRelease = true
  #edgeStart: number | undefined
  #interrupted = false
  #nativePointers = new Map<number, Document>()
  #sampleTimeout = 0

  constructor(camera: Camera, cursor: HTMLElement, tracker: HandTracker, targetChanged: (target: HTMLElement | undefined) => void) {
    this.#camera = camera
    this.#tracker = tracker
    this.#pointer = new GesturePointer(cursor, targetChanged)
    camera.subscribe(() => this.#sync())

    this.observeNativePointers(document)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return
      this.#nativePointers.clear()
      this.#clearPointer()
    })
  }

  observeNativePointers(source: Document, signal?: AbortSignal) {
    const options = { capture: true, signal }
    source.addEventListener('pointerdown', (event) => {
      if (!event.isTrusted) return
      this.#nativePointers.set(event.pointerId, source)
      this.#clearPointer()
    }, options)

    const release = (event: PointerEvent) => {
      if (event.isTrusted) this.#nativePointers.delete(event.pointerId)
    }
    source.addEventListener('pointerup', release, options)
    source.addEventListener('pointercancel', release, options)
    source.addEventListener('pointermove', (event) => {
      if (!event.buttons) release(event)
    }, options)

    const releaseDocument = () => {
      for (const [id, owner] of this.#nativePointers) {
        if (owner === source) this.#nativePointers.delete(id)
      }
    }
    source.defaultView?.addEventListener('blur', () => {
      releaseDocument()
      if (source === document) this.#clearPointer()
    }, { signal })
    signal?.addEventListener('abort', releaseDocument, { once: true })
  }

  get enabled() { return this.#enabled }

  setEnabled(enabled: boolean) {
    if (this.#enabled === enabled) return
    this.#enabled = enabled
    this.#sync()
  }

  observe(listener: (state: HandState) => void) {
    this.#listener = listener
    this.#sync()
  }

  #sync() {
    this.#run?.abort()
    this.#run = undefined
    this.#clearPointer()

    if (!this.enabled) return this.#publish('Hand tracking is off.')
    if (this.#camera.state.status === 'unavailable') return this.#publish('Camera unavailable.')
    if (this.#camera.state.status !== 'live') return this.#publish('Waiting for the camera.')

    const controller = new AbortController()
    this.#run = controller
    this.#publish('Starting hand tracking…')
    void this.#start(controller)
  }

  async #start(controller: AbortController) {
    const { signal } = controller
    const onError = (error: unknown) => {
      if (signal.aborted) return
      controller.abort()
      this.#clearPointer()
      this.#publish('Hand tracking unavailable.')
      console.warn('Hand tracking unavailable.', error)
    }

    try {
      await this.#tracker.start(this.#camera.video, (landmarks) => {
        if (!signal.aborted) this.#sample(landmarks)
      }, signal, onError)
      if (!signal.aborted) this.#publish('Hand tracking is on.', true)
    } catch (error) {
      onError(error)
    }
  }

  #sample(landmarks: HandLandmarks | null) {
    if (this.#nativePointers.size) return
    const sample = readHand(landmarks, this.#camera.video)
    if (!sample) {
      this.#interrupt()
      return
    }

    const time = performance.now()
    const elapsed = this.#lastSample ? time - this.#lastSample.time : 0
    if (elapsed >= trackingGrace) this.#clearPointer()

    if (this.#interrupted && this.#pressed && this.#lastSample) {
      const { x, y } = this.#lastSample.point
      const maxJump = Math.max(90, Math.min(window.innerWidth, window.innerHeight) * 0.14)
      if (sample.pinch >= pinchOpen || Math.hypot(sample.point.x - x, sample.point.y - y) > maxJump) {
        this.#clearPointer()
      }
    }
    this.#interrupted = false

    const previous = this.#lastSample?.point ?? sample.point
    const dx = sample.point.x - previous.x
    const dy = sample.point.y - previous.y
    const distance = Math.hypot(dx, dy)
    const speed = 1 + Math.min(1.6, distance / 70)
    const blend = 1 - Math.exp(-Math.min(80, elapsed) * speed / (this.#pressed ? 40 : 60))
    const point = !this.#pressed && distance < 2.5
      ? previous
      : { x: previous.x + dx * blend, y: previous.y + dy * blend }
    this.#lastSample = { point, time }
    window.clearTimeout(this.#sampleTimeout)
    this.#sampleTimeout = window.setTimeout(() => this.#clearPointer(), trackingGrace)

    this.#updatePinch(sample.pinch, time)
    this.#pointer.update(point, time, {
      pressed: this.#pressed,
      opening: this.#pressed && sample.pinch >= pinchOpen,
      dwelling: !this.#pressed && !this.#waitForRelease && sample.pinch > pinchClose,
    })
  }

  #updatePinch(ratio: number, time: number) {
    if (this.#waitForRelease) {
      if (ratio >= pinchOpen) this.#waitForRelease = false
      return
    }

    const changing = this.#pressed ? ratio >= pinchOpen : ratio <= pinchClose
    if (!changing) {
      this.#edgeStart = undefined
      return
    }
    this.#edgeStart ??= time
    if (time - this.#edgeStart >= edgeDuration) {
      this.#pressed = !this.#pressed
      this.#edgeStart = undefined
    }
  }

  #interrupt() {
    this.#interrupted = true
    this.#edgeStart = undefined
    this.#pointer.interrupt()
  }

  #clearPointer() {
    window.clearTimeout(this.#sampleTimeout)
    this.#lastSample = undefined
    this.#edgeStart = undefined
    this.#interrupted = false
    this.#waitForRelease = true
    this.#pressed = false
    this.#pointer.cancel()
  }

  #publish(message: string, active = false) {
    this.#listener?.({ enabled: this.enabled, active, message })
  }
}
