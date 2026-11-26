import { requestCamera } from '../shared/camera-access.ts'
import { resumeAudio } from '../shared/audio.ts'
import { openAppAudio } from '../shared/desktop-host.ts'

export function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', aborted) }
    const aborted = () => { cleanup(); reject(new DOMException('촬영 중지', 'AbortError')) }
    const timer = setTimeout(() => { cleanup(); resolve() }, ms)
    signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) aborted()
  })
}
export class BoothCamera {
  private stream?: MediaStream
  private generation = 0
  private events?: AbortController
  private request?: AbortController
  private video: HTMLVideoElement
  private lost: () => void
  constructor(video: HTMLVideoElement, lost: () => void) { this.video = video; this.lost = lost }
  async open() {
    this.close()
    const token = ++this.generation
    if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('카메라는 HTTPS 또는 localhost에서 사용할 수 있습니다. HTTPS 주소로 접속해 주세요.')
    this.request = new AbortController()
    const stream = await requestCamera(navigator.mediaDevices, { signal: this.request.signal })
    if (token !== this.generation) { stream.getTracks().forEach(track => track.stop()); throw new DOMException('카메라 연결 취소', 'AbortError') }
    this.stream = stream
    this.video.srcObject = stream
    try {
      await this.video.play()
      if (token !== this.generation) throw new DOMException('카메라 연결 취소', 'AbortError')
      if (!stream.getVideoTracks().some(track => track.readyState === 'live')) throw new DOMException('카메라 연결이 해제되었습니다.', 'NotReadableError')
      this.events = new AbortController()
      stream.getVideoTracks().forEach(track => track.addEventListener('ended', this.lost, { signal: this.events!.signal }))
    } catch (error) {
      if (token === this.generation) { console.error('[photo-booth] 카메라 영상 재생 실패:', error); this.close() }
      throw error
    }
  }
  close() {
    ++this.generation
    this.request?.abort()
    this.events?.abort()
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = undefined
    this.video.pause()
    this.video.srcObject = null
  }
}
export function cameraError(error: unknown) {
  if (error instanceof DOMException) {
    if (['NotAllowedError', 'SecurityError'].includes(error.name)) return '카메라 권한이 필요합니다. 브라우저 사이트 설정에서 카메라 접근을 허용한 뒤 다시 시작해 주세요.'
    if (error.name === 'NotFoundError') return '사용 가능한 카메라를 찾지 못했습니다. 웹캠 연결을 확인해 주세요.'
    if (error.name === 'NotReadableError') return '카메라를 사용할 수 없습니다. 다른 앱의 카메라 사용을 종료한 뒤 다시 시도해 주세요.'
  }
  return error instanceof Error ? error.message : '카메라 연결에 실패했습니다. 권한과 연결 상태를 확인해 주세요.'
}
export class Shutter {
  private playback = openAppAudio()
  private buffer?: AudioBuffer
  private paperBuffer?: AudioBuffer
  private motor?: { gain: GainNode; sources: AudioScheduledSourceNode[] }
  unlock() {
    const audio = this.playback?.context
    if (!audio) return
    resumeAudio(audio)
    if (!this.buffer) {
      this.buffer = audio.createBuffer(1, Math.round(audio.sampleRate * .11), audio.sampleRate)
      const data = this.buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) {
        const p = i / data.length
        data[i] = (Math.random() * 2 - 1) * Math.exp(-p * 8) * Math.min(1, p * 35)
      }
      this.paperBuffer = audio.createBuffer(1, Math.round(audio.sampleRate * .5), audio.sampleRate)
      const paper = this.paperBuffer.getChannelData(0)
      for (let i = 0; i < paper.length; i++) paper[i] = (Math.random() * 2 - 1) * .5
    }
  }
  play() {
    if (!this.playback || !this.buffer || this.playback.context.state !== 'running') return
    const { context: audio, output } = this.playback
    const source = audio.createBufferSource(), gain = audio.createGain(), filter = audio.createBiquadFilter()
    source.buffer = this.buffer
    filter.type = 'highpass'; filter.frequency.value = 950
    gain.gain.value = .22
    source.connect(filter); filter.connect(gain); gain.connect(output)
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect() }
    source.start()
  }
  film() {
    if (!this.playback || !this.buffer || this.playback.context.state !== 'running') return
    const { context: audio, output } = this.playback
    const source = audio.createBufferSource(), gain = audio.createGain(), filter = audio.createBiquadFilter()
    source.buffer = this.buffer; source.playbackRate.value = .65
    filter.type = 'lowpass'; filter.frequency.value = 1100; gain.gain.value = .09
    source.connect(filter); filter.connect(gain); gain.connect(output)
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect() }
    source.start()
  }
  startPrinter() {
    this.stopPrinter()
    if (!this.playback || !this.paperBuffer || this.playback.context.state !== 'running') return
    const { context: audio, output } = this.playback
    const time = audio.currentTime
    const motor = audio.createOscillator(), pulse = audio.createOscillator(), modulation = audio.createGain()
    const paper = audio.createBufferSource(), paperLevel = audio.createGain(), filter = audio.createBiquadFilter(), gain = audio.createGain()
    motor.type = 'triangle'; motor.frequency.value = 83
    pulse.frequency.value = 11; modulation.gain.value = 4
    pulse.connect(modulation); modulation.connect(motor.frequency)
    paper.buffer = this.paperBuffer; paper.loop = true; paperLevel.gain.value = .42
    filter.type = 'lowpass'; filter.frequency.value = 1100
    motor.connect(filter); paper.connect(paperLevel); paperLevel.connect(filter); filter.connect(gain); gain.connect(output)
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.045, time + .16)
    const sources = [motor, pulse, paper]
    let ended = 0
    const nodes = [motor, pulse, modulation, paper, paperLevel, filter, gain]
    sources.forEach(source => {
      source.onended = () => {
        if (++ended === sources.length) {
          nodes.forEach(node => node.disconnect())
          if (this.motor?.gain === gain) this.motor = undefined
        }
      }
      source.start(time); source.stop(time + 4.4)
    })
    this.motor = { gain, sources }
  }
  stopPrinter() {
    if (!this.playback || !this.motor) return
    const { gain, sources } = this.motor, time = this.playback.context.currentTime
    this.motor = undefined
    gain.gain.cancelScheduledValues(time)
    gain.gain.setValueAtTime(gain.gain.value, time)
    gain.gain.linearRampToValueAtTime(0, time + .12)
    sources.forEach(source => { try { source.stop(time + .14) } catch { /* Already stopped. */ } })
  }
  close() {
    this.stopPrinter()
    this.playback?.close()
  }
}
