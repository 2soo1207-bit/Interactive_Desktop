import { resumeAudio } from '../shared/audio.ts'
import { openAppAudio } from '../shared/desktop-host.ts'
import type { GameEvent } from './physics.ts'

type Cue = GameEvent['type'] | 'drop'

const tones: Record<Cue, { start: number; end: number; duration: number; gain: number }> = {
  drop: { start: 220, end: 110, duration: .14, gain: .09 },
  land: { start: 143, end: 68, duration: .18, gain: .23 },
  perfect: { start: 520, end: 780, duration: .26, gain: .13 },
  collapse: { start: 135, end: 41, duration: .34, gain: .18 },
  win: { start: 490, end: 980, duration: .42, gain: .15 },
}

export class PillowSound {
  private playback = openAppAudio()

  unlock() { resumeAudio(this.playback?.context) }

  play(cue: Cue) {
    if (!this.playback || this.playback.context.state !== 'running') return
    const { context: audio, output } = this.playback
    const tone = tones[cue]
    const now = audio.currentTime
    const end = now + tone.duration
    const oscillator = audio.createOscillator()
    const envelope = audio.createGain()
    oscillator.type = cue === 'perfect' || cue === 'win' ? 'sine' : 'triangle'
    oscillator.frequency.setValueAtTime(tone.start, now)
    oscillator.frequency.exponentialRampToValueAtTime(tone.end, end)
    envelope.gain.setValueAtTime(.0001, now)
    envelope.gain.exponentialRampToValueAtTime(tone.gain, now + .018)
    envelope.gain.exponentialRampToValueAtTime(.0001, end)

    oscillator.connect(envelope)
    envelope.connect(output)
    oscillator.onended = () => {
      oscillator.disconnect()
      envelope.disconnect()
    }
    oscillator.start(now)
    oscillator.stop(end)
  }

  close() { this.playback?.close() }
}
