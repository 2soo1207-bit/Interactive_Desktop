import { chooseVoice, languageFor, spokenWord } from './settings.js'

export class Speech {
  constructor(getSettings, notify, platform = globalThis, onBlocked = () => {}) {
    this.getSettings = getSettings
    this.notify = notify
    this.synth = platform.speechSynthesis
    this.Utterance = platform.SpeechSynthesisUtterance
    this.onBlocked = onBlocked
    this.unlocked = false
    this.recent = []
    this.sequence = 0
    this.timer = 0
    this.delay = 0
    this.attempt = null
    this.queued = null
    this.blocked = null
  }
  unlock() {
    this.unlocked = true
    this.synth?.resume()
    if (!this.synth) this.notify('이 브라우저는 음성 읽기를 지원하지 않습니다.')
    const blocked = this.blocked
    if (blocked) {
      this.blocked = null
      this.begin(blocked.word, blocked.settings)
    }
  }
  speak(word, settings = this.getSettings()) {
    if (!this.unlocked || !this.synth || !this.Utterance || !word.trim()) return
    if (this.blocked) { this.blocked = { word, settings }; return }
    // Keep a not-yet-started utterance's watchdog alive under rapid pinches.
    if (this.attempt && !this.attempt.started) { this.queued = { word, settings }; return }
    this.begin(word, settings)
  }
  begin(word, settings) {
    const token = ++this.sequence
    clearTimeout(this.timer)
    clearTimeout(this.delay)
    this.queued = null
    const wasSpeaking = this.synth.speaking
    if (wasSpeaking) this.synth.cancel()
    this.attempt = { started: false }
    if (wasSpeaking) this.delay = setTimeout(() => this.run(word, token, false, settings), 40)
    else this.run(word, token, false, settings)
  }
  run(word, token, fallback, settings) {
    if (token !== this.sequence) return
    const utterance = new this.Utterance(spokenWord(word))
    const lang = languageFor(word)
    utterance.lang = lang
    if (!fallback) {
      utterance.voice = chooseVoice(this.synth.getVoices(), lang, lang.startsWith('zh') ? settings.chinese : settings.english) ?? null
      if (utterance.voice) utterance.lang = utterance.voice.lang || lang
    }
    utterance.rate = .95
    this.recent.push(utterance)
    this.recent = this.recent.slice(-8)
    let finished = false
    const failed = () => {
      if (finished || token !== this.sequence) return
      finished = true
      clearTimeout(this.timer)
      if (fallback) {
        this.attempt = null
        this.queued = null
        this.sequence++
        this.notify('음성 엔진이 응답하지 않습니다. 브라우저를 완전히 종료한 뒤 다시 실행해 주세요.', true)
        return
      }
      // The one recovery exception: clear a stuck pending engine as requested.
      this.synth.pause()
      this.synth.resume()
      this.synth.cancel()
      this.attempt = { started: false }
      this.delay = setTimeout(() => this.run(word, token, true, settings), 40)
    }
    utterance.onstart = () => {
      if (finished || token !== this.sequence) return
      clearTimeout(this.timer)
      this.attempt.started = true
      this.onBlocked(false)
      if (this.queued) this.begin(this.queued.word, this.queued.settings)
    }
    utterance.onend = () => {
      if (finished || token !== this.sequence) return
      finished = true
      clearTimeout(this.timer)
      this.attempt = null
      if (this.queued) this.begin(this.queued.word, this.queued.settings)
    }
    utterance.onerror = event => {
      if (event.error === 'not-allowed' && !finished && token === this.sequence) {
        finished = true
        clearTimeout(this.timer)
        this.attempt = null
        this.blocked = this.queued ?? { word, settings }
        this.queued = null
        this.onBlocked(true)
      } else if (event.error !== 'canceled' && event.error !== 'interrupted') {
        failed()
      }
    }
    this.timer = setTimeout(failed, 1200)
    try { this.synth.speak(utterance) } catch { failed() }
  }
  destroy() {
    ++this.sequence
    clearTimeout(this.timer)
    clearTimeout(this.delay)
    if (this.synth?.speaking || this.synth?.pending) this.synth.cancel()
    this.attempt = null
    this.queued = null
    this.blocked = null
    this.recent.length = 0
  }
}

export class HeartAudio {
  constructor(url, notify, audio) {
    this.audio = audio
    this.context = audio?.context
    this.voices = []
    const context = this.context
    if (!context) return

    this.destination = context.createMediaStreamDestination()
    // Keep the recording track clocked before the first heart sound.
    this.silence = context.createConstantSource()
    this.silence.offset.value = 0
    this.silence.connect(this.destination)
    this.silence.start()

    void fetch(url).then(response => {
      if (!response.ok) throw new Error('효과음 파일을 불러올 수 없습니다.')
      return response.arrayBuffer()
    }).then(bytes => context.decodeAudioData(bytes))
      .then(buffer => { this.buffer = buffer })
      .catch(() => notify('하트 효과음을 불러오지 못했습니다.'))
  }
  play() {
    const context = this.context
    if (!context || !this.buffer || context.state !== 'running') return
    this.fadeOut()
    const source = context.createBufferSource(), gain = context.createGain()
    source.buffer = this.buffer
    gain.gain.value = .32
    source.connect(gain)
    gain.connect(this.audio.output)
    gain.connect(this.destination)
    const voice = { source, gain }
    this.voices.push(voice)
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
      this.voices = this.voices.filter(item => item !== voice)
    }
    source.start()
  }
  fadeOut(duration = .08) {
    if (!this.context) return
    const now = this.context.currentTime
    for (const { source, gain } of this.voices) {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0, now + duration)
      try { source.stop(now + duration) } catch { /* already stopped */ }
    }
  }
  destroy() {
    this.fadeOut(.02)
    this.silence?.stop()
    this.silence?.disconnect()
    this.destination?.stream.getTracks().forEach(track => track.stop())
    this.audio?.close()
  }
}
