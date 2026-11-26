import { requestCamera } from '../shared/camera-access.ts'
export { preferredCamera, isBuiltinCamera, isPhoneCamera } from '../shared/camera-access.ts'

export class CameraInput {
  constructor(mediaDevices) {
    this.media = mediaDevices
    this.devices = []
    this.stream = null
    this.selectedId = ''
    this.closed = false
    this.generation = 0
    this.request = null
  }
  async refresh() {
    const devices = await this.media.enumerateDevices()
    if (!this.closed) this.devices = devices.filter(device => device.kind === 'videoinput')
    return this.devices
  }
  async open() {
    if (this.closed) throw new DOMException('Camera closed', 'AbortError')
    const token = ++this.generation
    this.request?.abort()
    this.request = new AbortController()
    const incoming = await requestCamera(this.media, { signal: this.request.signal })
    if (this.closed || token !== this.generation) {
      incoming.getTracks().forEach(track => track.stop())
      throw new DOMException('Camera request cancelled', 'AbortError')
    }
    this.release()
    this.stream = incoming
    this.selectedId = incoming.getVideoTracks()[0].getSettings?.().deviceId ?? ''
    try { await this.refresh() } catch { /* Keep the built-in camera stream. */ }
    if (this.closed || token !== this.generation) {
      incoming.getTracks().forEach(track => track.stop())
      throw new DOMException('Camera request cancelled', 'AbortError')
    }
    return incoming
  }
  release() {
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = null
    this.selectedId = ''
  }
  destroy() {
    this.closed = true
    ++this.generation
    this.request?.abort()
    this.release()
  }
}
