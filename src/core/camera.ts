const videoQuality: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
}

export type CameraStatus = 'off' | 'requesting' | 'live' | 'unavailable'

export interface CameraState {
  status: CameraStatus
  message: string
}

function isContinuity(label: string) {
  return /iphone|ipad|continuity|연속성|连续互通|接續互通|連係カメラ/i.test(label)
}

function isBuiltIn(label: string) {
  return /facetime|macbook|built[\s-]?in|integrated|apple camera|내장|内蔵/i.test(label)
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

async function cameras(media: MediaDevices) {
  const devices = await media.enumerateDevices().catch(() => [])
  return devices.filter((device) => device.kind === 'videoinput')
}

function preferred(devices: MediaDeviceInfo[]) {
  return devices
    .filter(({ deviceId, label }) => deviceId && label && !isContinuity(label))
    .sort((left, right) => Number(isBuiltIn(right.label)) - Number(isBuiltIn(left.label)))
}

async function requestCamera(media: MediaDevices, signal: AbortSignal) {
  const before = await cameras(media)
  const known = preferred(before)
  if (signal.aborted) return null

  const open = async (video: MediaTrackConstraints) => {
    const stream = await media.getUserMedia({ audio: false, video: { ...videoQuality, ...video } })
    if (signal.aborted) {
      stopStream(stream)
      return null
    }
    signal.addEventListener('abort', () => stopStream(stream), { once: true })
    return stream
  }

  async function openKnown(devices: MediaDeviceInfo[]) {
    let lastError: unknown
    for (const { deviceId } of devices) {
      if (signal.aborted) return null
      try {
        return await open({ deviceId: { exact: deviceId } })
      } catch (error) {
        if (!(error instanceof DOMException) ||
          !['NotFoundError', 'NotReadableError', 'OverconstrainedError'].includes(error.name)) {
          throw error
        }
        lastError = error
      }
    }
    throw lastError ?? new Error('No non-Continuity camera available.')
  }

  if (known.length) return openKnown(known)
  if (before.length && before.every(({ label }) => label && isContinuity(label))) {
    throw new Error('No non-Continuity camera available.')
  }

  // Camera labels can be blank until the browser grants video permission.
  const first = await open({ facingMode: { ideal: 'user' } })
  if (!first) return null
  const track = first.getVideoTracks()[0]
  const after = await cameras(media)
  if (signal.aborted) return null

  const choices = preferred(after)
  const currentId = track.getSettings().deviceId
  const currentLabel = track.label || after.find(({ deviceId }) => deviceId === currentId)?.label || ''
  const currentIsContinuity = isContinuity(currentLabel)
  const betterCamera = !isBuiltIn(currentLabel) && choices.some(({ label }) => isBuiltIn(label))
  if (!currentIsContinuity && !betterCamera) return first

  stopStream(first)
  return openKnown(choices)
}

function cameraError(error: unknown) {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError': return 'Allow camera access in your browser settings.'
      case 'NotFoundError': return 'No camera found.'
      case 'NotReadableError': return 'The camera is busy or unavailable.'
    }
  }
  return error instanceof Error && error.message === 'No non-Continuity camera available.'
    ? 'Only Continuity Camera is available.'
    : 'Camera unavailable.'
}

function waitForFirstFrame(video: HTMLVideoElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }

    const listeners = new AbortController()
    let frame: number | undefined
    function finish() {
      listeners.abort()
      if (frame !== undefined) video.cancelVideoFrameCallback(frame)
      if (signal.aborted) reject(signal.reason)
      else resolve()
    }

    signal.addEventListener('abort', finish, { signal: listeners.signal })
    if (typeof video.requestVideoFrameCallback === 'function') {
      frame = video.requestVideoFrameCallback(finish)
      return
    }

    function checkFrame() {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) finish()
    }
    video.addEventListener('loadeddata', checkFrame, { signal: listeners.signal })
    video.addEventListener('playing', checkFrame, { signal: listeners.signal })
    checkFrame()
  })
}

export class Camera {
  readonly video: HTMLVideoElement
  #stream: MediaStream | null = null
  #request: AbortController | undefined
  #state: CameraState = { status: 'off', message: 'Camera is off.' }
  #listeners = new Set<(state: CameraState) => void>()

  constructor(video: HTMLVideoElement) {
    this.video = video
  }

  get state() { return this.#state }

  get stream() { return this.#stream }

  subscribe(listener: (state: CameraState) => void) {
    this.#listeners.add(listener)
    listener(this.#state)
    return () => { this.#listeners.delete(listener) }
  }

  async start() {
    if (this.state.status === 'requesting' || this.state.status === 'live') return
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.#publish('unavailable', 'Camera access requires trusted HTTPS.')
      return
    }

    const request = new AbortController()
    this.#request = request
    const { signal } = request
    this.#publish('requesting', 'Waiting for camera access…')

    const fail = (message: string) => {
      if (signal.aborted) return
      request.abort()
      this.#request = undefined
      this.#release()
      this.#publish('unavailable', message)
    }

    try {
      const stream = await requestCamera(navigator.mediaDevices, signal)
      if (signal.aborted || !stream) return
      this.#stream = stream
      const [track] = stream.getVideoTracks()
      if (!track || track.readyState === 'ended') {
        fail('The camera disconnected.')
        return
      }

      track.addEventListener('ended', () => fail('The camera disconnected.'), { signal })
      this.video.addEventListener('error', () => fail('The camera video could not play.'), { signal })
      this.video.srcObject = stream
      this.#publish('requesting', 'Preparing camera video…')
      await Promise.all([waitForFirstFrame(this.video, signal), this.video.play()])
      if (!signal.aborted) this.#publish('live', track.label || 'Camera is on.')
    } catch (error) {
      fail(cameraError(error))
    }
  }

  stop() {
    this.#request?.abort()
    this.#request = undefined
    this.#release()
    this.#publish('off', 'Camera is off.')
  }

  #release() {
    stopStream(this.#stream)
    this.#stream = null
    this.video.srcObject = null
  }

  #publish(status: CameraStatus, message: string) {
    this.#state = { status, message }
    for (const listener of this.#listeners) listener(this.#state)
  }
}
