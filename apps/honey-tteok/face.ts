import modelUrl from './assets/face_landmarker.task?url'

type Point = { x: number; y: number }
type Size = { width: number; height: number }

export interface MouthSample extends Point {
  radiusX: number
  radiusY: number
  open: boolean
}

export type LipLandmarks = readonly [left: Point, right: Point, upper: Point, lower: Point]

export type FaceWorkerRequest =
  | { type: 'start'; model: string }
  | { type: 'frame'; image: ImageBitmap; time: number; generation: number }

export type FaceWorkerReply =
  | { type: 'ready' }
  | { type: 'lips'; points: LipLandmarks | null; time: number; generation: number }
  | { type: 'error'; message: string }

type LipReply = Extract<FaceWorkerReply, { type: 'lips' }>

const samplesPerSecond = 26
const inferenceSize = 640
const staleMs = 240

export function projectMouth(points: LipLandmarks, video: Size, viewport: Size) {
  const [left, right, top, bottom] = points
  const scale = Math.max(viewport.width / video.width, viewport.height / video.height)
  const dx = (right.x - left.x) * video.width
  const dy = (right.y - left.y) * video.height
  const width = Math.hypot(dx, dy)
  if (!Number.isFinite(width) || width < video.width * 0.023 || !(scale > 0)) return null

  // The gap is measured across the lips, perpendicular to the mouth corners.
  const gap = Math.abs(dx * (bottom.y - top.y) * video.height - dy * (bottom.x - top.x) * video.width) / width
  const x = viewport.width / 2 + (0.5 - (top.x + bottom.x) / 2) * video.width * scale
  const y = viewport.height / 2 + ((top.y + bottom.y) / 2 - 0.5) * video.height * scale
  if (!Number.isFinite(gap) || !Number.isFinite(x) || !Number.isFinite(y) ||
    x < 0 || x > viewport.width || y < 0 || y > viewport.height) return null

  const radiusX = width * scale / 2
  const radiusY = Math.max(radiusX * 0.16, gap * scale / 2)
  return { x, y, radiusX, radiusY, gapRatio: gap / width }
}

type MouthGeometry = NonNullable<ReturnType<typeof projectMouth>>

export class MouthPosture {
  #confirmed: boolean | undefined
  #pending: boolean | undefined
  #last: MouthGeometry | undefined
  #restGap: number | undefined
  #peakGap = 0

  reset() {
    this.#confirmed = undefined
    this.#pending = undefined
    this.#last = undefined
    this.#restGap = undefined
    this.#peakGap = 0
  }

  update(mouth: MouthGeometry): MouthSample | null | undefined {
    const previous = this.#last
    if (previous && Math.hypot(mouth.x - previous.x, mouth.y - previous.y) >
      3.4 * Math.max(mouth.radiusX, previous.radiusX)) {
      this.reset()
      return null
    }

    this.#last = mouth
    const gap = mouth.gapRatio
    const restGap = this.#restGap ??= Math.min(gap, .19)
    // Build the opening threshold from the player's relaxed mouth. During a
    // bite, require a distinct drop from the opening peak as well as closure.
    const openAt = Math.max(.151, restGap + .06)
    const closeAt = Math.max(.102, Math.min(openAt - .034, restGap + .026))
    const next = this.#confirmed
      ? gap > closeAt || this.#peakGap - gap < .045
      : gap >= openAt
    if (next) this.#peakGap = Math.max(this.#peakGap, gap)

    if (next !== this.#confirmed) {
      if (this.#pending !== next) {
        this.#pending = next
        return undefined
      }
      this.#confirmed = next
    }
    this.#pending = undefined
    if (!this.#confirmed) {
      this.#restGap = Math.min(gap, restGap + .002)
      this.#peakGap = 0
    }

    const { x, y, radiusX, radiusY } = mouth
    return { x, y, radiusX, radiusY, open: this.#confirmed }
  }
}

interface Session {
  worker: Worker
  video: HTMLVideoElement
  abort: AbortController
  ready: boolean
  busy: boolean
  lastVideoTime: number
  lastCapture: number
  lastResult: number
  latest?: LipReply
  fail(error: unknown): void
}

export class FaceInput {
  #session: Session | undefined
  #posture = new MouthPosture()
  #generation = 0
  #error: Error | undefined

  async start(video: HTMLVideoElement, signal: AbortSignal, onError?: (error: Error) => void) {
    this.close()
    signal.throwIfAborted()
    if (typeof createImageBitmap !== 'function') throw new Error('Video frame capture is unavailable.')

    const worker = new Worker(new URL('./face-worker.ts', import.meta.url), { type: 'module' })
    const abort = new AbortController()
    const lifetime = AbortSignal.any([signal, abort.signal])

    return new Promise<void>((resolve, reject) => {
      const session: Session = {
        worker, video, abort,
        ready: false,
        busy: false,
        lastVideoTime: -1,
        lastCapture: -Infinity,
        lastResult: -Infinity,
        fail: (error) => {
          if (lifetime.aborted) return
          abort.abort(error)
          if (session.ready) {
            this.#error = error instanceof Error ? error : new Error(String(error))
            onError?.(this.#error)
          }
        },
      }
      this.#session = session
      const timeout = window.setTimeout(() => session.fail(new Error('Face model initialization timed out.')), 25_000)

      lifetime.addEventListener('abort', () => {
        window.clearTimeout(timeout)
        worker.terminate()
        if (this.#session === session) {
          this.#session = undefined
          this.#posture.reset()
        }
        if (!session.ready) reject(lifetime.reason)
      }, { once: true })

      worker.addEventListener('error', (event) => {
        event.preventDefault()
        session.fail(new Error(event.message || 'Face tracking worker failed.'))
      }, { signal: lifetime })
      worker.addEventListener('message', (event: MessageEvent<FaceWorkerReply>) => {
        const message = event.data
        if (message.type === 'ready') {
          window.clearTimeout(timeout)
          session.ready = true
          resolve()
        } else if (message.type === 'lips') {
          session.busy = false
          if (message.generation !== this.#generation) return
          session.latest = message
          session.lastResult = message.time
        } else session.fail(new Error(message.message))
      }, { signal: lifetime })

      try {
        const request: FaceWorkerRequest = {
          type: 'start', model: new URL(modelUrl, document.baseURI).href,
        }
        worker.postMessage(request)
      } catch (error) {
        session.fail(error)
      }
    })
  }

  sample(nowMs: number, viewport: Size): MouthSample | null | undefined {
    if (this.#error) throw this.#error
    const session = this.#session
    if (!session?.ready) return null

    this.#capture(session, nowMs)
    const latest = session.latest
    session.latest = undefined
    if (nowMs - session.lastResult > staleMs || latest && !latest.points) {
      this.#posture.reset()
      return null
    }
    if (!latest?.points) return undefined

    const mouth = projectMouth(latest.points, {
      width: session.video.videoWidth,
      height: session.video.videoHeight,
    }, viewport)
    if (mouth) return this.#posture.update(mouth)
    this.#posture.reset()
    return null
  }

  reset() {
    this.#generation++
    this.#posture.reset()
    if (!this.#session) return
    this.#session.latest = undefined
    this.#session.lastResult = -Infinity
  }

  close() {
    this.#session?.abort.abort()
    this.#error = undefined
    this.reset()
  }

  #capture(session: Session, nowMs: number) {
    const { video } = session
    if (session.busy || nowMs - session.lastCapture < 1000 / samplesPerSecond ||
      video.currentTime === session.lastVideoTime || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

    const { videoWidth, videoHeight } = video
    if (!videoWidth || !videoHeight) return
    const scale = Math.min(1, inferenceSize / Math.max(videoWidth, videoHeight))
    const generation = this.#generation
    session.lastCapture = nowMs
    session.lastVideoTime = video.currentTime
    session.busy = true
    void createImageBitmap(video, {
      resizeWidth: Math.max(1, Math.round(videoWidth * scale)),
      resizeHeight: Math.max(1, Math.round(videoHeight * scale)),
      resizeQuality: 'low',
    }).then((image) => {
      if (this.#session !== session || generation !== this.#generation) {
        session.busy = false
        image.close()
        return
      }
      const request: FaceWorkerRequest = { type: 'frame', image, generation, time: nowMs }
      try {
        session.worker.postMessage(request, [image])
      } catch (error) {
        image.close()
        session.fail(error)
      }
    }).catch((error: unknown) => session.fail(error))
  }
}
