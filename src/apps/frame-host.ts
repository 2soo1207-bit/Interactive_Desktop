import type { AppLifecycle, DesktopHost } from '../../apps/shared/desktop-host'
import type { AudioOutput } from '../../apps/shared/audio'
import type { Camera } from '../core/camera'

interface FrameControls {
  camera: boolean
  audio?: AudioOutput
  visible(): boolean
  speechBlocked(blocked: boolean): void
}

interface FrameSession extends FrameControls {
  lifetime: AbortController
  tracks: Set<MediaStreamTrack>
  lifecycle?: AppLifecycle
  wasVisible: boolean
}

function waitForCamera(camera: Camera, signal: AbortSignal) {
  signal.throwIfAborted()
  if (camera.state.status === 'live') return Promise.resolve()
  void camera.start()
  if (camera.state.status !== 'requesting') {
    return Promise.reject(new DOMException(camera.state.message, 'NotReadableError'))
  }

  return new Promise<void>((resolve, reject) => {
    function finish(error?: unknown) {
      unsubscribe()
      signal.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve()
    }
    const abort = () => finish(signal.reason)
    const unsubscribe = camera.subscribe(({ status, message }) => {
      if (status === 'requesting') return
      finish(status === 'live' ? undefined : new DOMException(message, 'NotReadableError'))
    })
    signal.addEventListener('abort', abort, { once: true })
  })
}

export class FrameHost implements DesktopHost {
  #camera: Camera
  #frames = new Map<Window, FrameSession>()
  #controlHasHand = false

  constructor(camera: Camera) {
    this.#camera = camera
    window.playgroundApps = this
    camera.subscribe(({ status }) => {
      if (status === 'live') return
      for (const entry of this.#frames.values()) this.#stopTracks(entry, true)
    })
  }

  register(frame: HTMLIFrameElement, controls: FrameControls) {
    const owner = frame.contentWindow!
    const entry: FrameSession = {
      ...controls,
      lifetime: new AbortController(),
      tracks: new Set(),
      wasVisible: controls.visible(),
    }
    this.#frames.set(owner, entry)
    return () => {
      this.#frames.delete(owner)
      entry.lifetime.abort()
      try { entry.lifecycle?.dispose() }
      finally { this.#stopTracks(entry) }
    }
  }

  connect(owner: Window, lifecycle: AppLifecycle) {
    const entry = this.#frames.get(owner)
    if (!entry) return
    entry.lifecycle = lifecycle
    lifecycle.visibilityChanged?.()
  }

  audioFor(owner: Window) { return this.#frames.get(owner)?.audio }

  requestSpeech(owner: Window) { this.#frames.get(owner)?.lifecycle?.audioRequested?.() }

  reportSpeechBlocked(owner: Window, blocked: boolean) {
    this.#frames.get(owner)?.speechBlocked(blocked)
  }

  visible(owner: Window) { return this.#frames.get(owner)?.visible() ?? false }

  gestures(owner: Window) {
    return !this.#controlHasHand && this.visible(owner)
  }

  setHandTarget(target: HTMLElement | undefined) {
    this.#controlHasHand = Boolean(target)
  }

  updateVisibility() {
    for (const entry of this.#frames.values()) {
      const visible = entry.visible()
      if (entry.wasVisible === visible) continue
      entry.wasVisible = visible
      entry.lifecycle?.visibilityChanged?.()
    }
  }

  async cameraFor(owner: Window, appSignal: AbortSignal) {
    const entry = this.#frames.get(owner)
    if (!entry?.camera) throw new DOMException('Camera access is unavailable for this window.', 'NotAllowedError')

    const signal = AbortSignal.any([appSignal, entry.lifetime.signal])
    await waitForCamera(this.#camera, signal)
    signal.throwIfAborted()
    const cameraTrack = this.#camera.stream?.getVideoTracks().find((track) => track.readyState === 'live')
    if (!cameraTrack) throw new DOMException('The desktop camera is unavailable.', 'NotReadableError')

    for (const track of entry.tracks) {
      if (track.readyState === 'ended') entry.tracks.delete(track)
    }
    const track = cameraTrack.clone()
    entry.tracks.add(track)
    return new MediaStream([track])
  }

  #stopTracks(entry: FrameSession, notify = false) {
    const tracks = [...entry.tracks]
    entry.tracks.clear()
    for (const track of tracks) {
      if (track.readyState === 'ended') continue
      track.stop()
      if (notify) track.dispatchEvent(new Event('ended'))
    }
  }
}
