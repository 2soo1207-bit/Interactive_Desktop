import { requestCamera } from '../shared/camera-access.ts'
import { appGesturesAllowed, handsAssetBase } from '../shared/desktop-host.ts'
import { ActivePillowHand, FistTrigger, fistPose } from './fist.ts'
import type { HandPoint } from './fist.ts'

export type PillowHandStatus = 'off' | 'loading' | 'ready' | 'fist' | 'error'
type Options = { onDrop: (firstDetectedFrameTime: number) => void; onStatus: (status: PillowHandStatus, message?: string) => void }
type Results = { multiHandLandmarks?: HandPoint[][]; multiHandWorldLandmarks?: HandPoint[][] }
type HandsInstance = {
  setOptions(options: object): void
  onResults(callback: (results: Results) => void): void
  send(input: { image: HTMLCanvasElement }): Promise<void>
  close(): Promise<void>
}
type HandsConstructor = new (options: { locateFile: (file: string) => string }) => HandsInstance
const CDN = typeof window === 'undefined' ? '' : handsAssetBase()
let library: Promise<HandsConstructor> | null = null

function loadHands(): Promise<HandsConstructor> {
  const get = () => (window as unknown as { Hands?: HandsConstructor }).Hands
  const existing = get()
  if (existing) return Promise.resolve(existing)
  library ??= new Promise<HandsConstructor>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${CDN}hands.js`; script.crossOrigin = 'anonymous'
    const finish = (error?: Error) => {
      clearTimeout(timeout); script.onload = null; script.onerror = null
      const constructor = get()
      if (error || !constructor) {
        script.remove(); library = null
        reject(error ?? new Error('손 인식 도구를 초기화하지 못했습니다. 다시 시도해 주세요.'))
      } else resolve(constructor)
    }
    const timeout = window.setTimeout(() => finish(new Error('손 인식 도구 다운로드 시간이 초과되었습니다. 인터넷 연결을 확인해 주세요.')), 20000)
    script.onload = () => finish()
    script.onerror = () => finish(new Error('손 인식 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'))
    document.head.append(script)
  })
  return library
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return '카메라 권한을 허용한 뒤 다시 연결해 주세요. 클릭으로 계속 플레이할 수 있습니다.'
    if (error.name === 'NotFoundError') return '사용 가능한 카메라가 없습니다. 클릭으로 플레이할 수 있습니다.'
    if (error.name === 'NotReadableError') return '다른 앱의 카메라 사용을 종료한 뒤 다시 시도해 주세요. 클릭으로 계속 플레이할 수 있습니다.'
    return `${error.message} 클릭으로 계속 플레이할 수 있습니다.`
  }
  return '카메라 연결을 확인해 주세요. 클릭으로 계속 플레이할 수 있습니다.'
}

/** One game RAF owns update(). At most one camera frame is ever in inference. */
export class PillowHandInput {
  private video: HTMLVideoElement
  private options: Options
  private canvas = document.createElement('canvas')
  private context = this.canvas.getContext('2d', { alpha: false })!
  private stream: MediaStream | null = null
  private hands: HandsInstance | null = null
  private abort: AbortController | null = null
  private pending: Promise<void> | null = null
  private closing: Promise<void> = Promise.resolve()
  private starting: Promise<void> | null = null
  private generation = 0
  private disposed = false
  private frameTime = 0
  private lastVideoTime = -1
  private failures = 0
  private tracker = new ActivePillowHand()
  private trigger = new FistTrigger()
  private ended: (() => void) | null = null
  private status: PillowHandStatus = 'off'

  constructor(video: HTMLVideoElement, options: Options) {
    this.video = video; this.options = options
    this.canvas.width = 640; this.canvas.height = 360
    this.video.muted = true; this.video.playsInline = true
  }

  private notify(status: PillowHandStatus, message?: string) {
    if (this.disposed || (this.status === status && !message)) return
    this.status = status; this.options.onStatus(status, message)
  }

  async start(): Promise<void> {
    if (this.disposed || this.hands) return
    if (this.starting) return this.starting
    const generation = ++this.generation
    const abort = new AbortController(); this.abort = abort
    this.notify('loading', '카메라 연결 중')
    const operation = async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('카메라는 HTTPS 또는 localhost에서 사용할 수 있습니다.')
        await this.closing
        if (generation !== this.generation) return
        const stream = await requestCamera(navigator.mediaDevices, { signal: abort.signal })
        if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return }
        this.stream = stream; this.video.srcObject = stream
        this.ended = () => this.fail(new Error('카메라 연결이 해제되었습니다. 다시 연결해 주세요.'), generation)
        stream.getVideoTracks().forEach(track => track.addEventListener('ended', this.ended!))
        await this.video.play()
        const Constructor = await loadHands()
        if (generation !== this.generation) return
        const hands = new Constructor({ locateFile: file => `${CDN}${file}` })
        this.hands = hands
        hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: .6, minTrackingConfidence: .5 })
        hands.onResults(results => {
          if (generation !== this.generation || this.hands !== hands || !appGesturesAllowed()) return
          const handsFound = results.multiHandLandmarks ?? []
          const index = this.tracker.update(handsFound, this.frameTime)
          if (index < 0) { this.trigger.lost(); this.notify('ready'); return }
          const pose = fistPose(handsFound[index], this.video.videoWidth / Math.max(1, this.video.videoHeight), results.multiHandWorldLandmarks?.[index])
          const firstDetectedTime = this.trigger.update(pose, this.frameTime)
          this.notify(pose === 'fist' ? 'fist' : 'ready')
          if (firstDetectedTime !== null) this.options.onDrop(firstDetectedTime)
        })
        this.notify('loading', '손 인식 준비 중')
      } catch (error) {
        if (generation === this.generation && !abort.signal.aborted) this.fail(error, generation)
      }
    }
    const starting = operation()
    this.starting = starting
    try { await starting } finally { if (this.starting === starting) this.starting = null }
  }

  update(_now: number): void {
    if (this.disposed || !this.hands || this.pending || document.hidden || !appGesturesAllowed() || this.video.readyState < 2 || this.video.videoWidth <= 0 || this.lastVideoTime === this.video.currentTime) return
    const height = Math.max(1, Math.round(640 * this.video.videoHeight / this.video.videoWidth))
    if (this.canvas.height !== height) this.canvas.height = height
    this.lastVideoTime = this.video.currentTime
    // Timestamp the frame before capture/send. Never replace it with result time:
    // the game uses this to retrieve its original oscillating cushion position.
    this.frameTime = performance.now()
    this.context.drawImage(this.video, 0, 0, 640, height)
    const generation = this.generation
    const hands = this.hands
    const pending = Promise.resolve().then(() => hands.send({ image: this.canvas }))
      .then(() => { if (generation === this.generation) this.failures = 0 })
      .catch(error => {
        if (generation !== this.generation) return
        this.trigger.lost(); this.failures++
        console.error('[Pillow TOWER] 손 인식 프레임 처리 실패:', error)
        if (this.failures >= 3) this.fail(new Error('손 인식이 중단되었습니다. 카메라를 다시 연결해 주세요.'), generation)
      })
      .finally(() => { if (this.pending === pending) this.pending = null })
    this.pending = pending
  }

  private fail(error: unknown, generation: number) {
    if (generation !== this.generation) return
    console.error('[Pillow TOWER] 카메라 / 손 인식 오류:', error)
    this.stopResources(); this.notify('error', errorMessage(error))
  }

  private stopResources() {
    this.generation++; this.abort?.abort(); this.abort = null; this.starting = null
    if (this.stream) {
      for (const track of this.stream.getTracks()) { if (this.ended) track.removeEventListener('ended', this.ended); track.stop() }
      this.stream = null
    }
    this.ended = null; this.video.pause(); this.video.srcObject = null
    const hands = this.hands; this.hands = null
    const pending = this.pending; this.pending = null
    if (hands) this.closing = (pending ?? Promise.resolve()).catch(() => {}).then(() => hands.close()).catch(error => console.warn('[Pillow TOWER] 손 인식 종료:', error))
    this.tracker.reset(); this.trigger.reset(); this.lastVideoTime = -1; this.failures = 0
  }

  stop(): void { this.stopResources(); this.notify('off') }
  dispose(): void { this.stop(); this.disposed = true }
}
