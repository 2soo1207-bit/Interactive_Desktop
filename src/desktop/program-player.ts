import { createAudioContext, observeAudioSuspension, resumeAudio } from '../../apps/shared/audio'
import { mountProgram } from '../apps/runtime'
import type { AppContext, DesktopApp, OpenApp } from '../apps/runtime'
import { icon } from '../ui/icons'

export function buildProgramPlayer(layer: HTMLElement, context: AppContext, showProgram: (app?: DesktopApp) => void) {
  let closeCurrent: (() => void) | undefined
  let sharedAudio: AudioContext | undefined
  let effectsOutput: GainNode | undefined
  let effectsMuted = false
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  const open: OpenApp = (app, opener, launchInput) => {
    if (closeCurrent || !app.entry) return
    // Called within the launch click, while real mouse or keyboard activation is available.
    if (app.usesAudio) sharedAudio ??= createAudioContext()
    const audioContext = app.usesAudio ? sharedAudio : undefined
    resumeAudio(audioContext)
    const output = audioContext?.createGain()
    effectsOutput = output
    if (audioContext && output) {
      output.gain.value = effectsMuted ? 0 : 1
      output.connect(audioContext.destination)
    }

    const view = document.createElement('section')
    view.className = 'program-view'
    view.dataset.app = app.id
    view.setAttribute('role', 'dialog')
    view.setAttribute('aria-label', app.name)
    view.innerHTML = `
      <div class="program-content"></div>
      <button type="button" class="program-control program-close" aria-label="Close program" title="Close">${icon('close')}</button>
      <button type="button" class="program-control program-audio" hidden>Enable sound</button>
    `
    const closeButton = view.querySelector<HTMLButtonElement>('.program-close')!
    const soundButton = view.querySelector<HTMLButtonElement>('.program-audio')!
    const lifetime = new AbortController()
    let audioSuspended = false
    let speechBlocked = false
    function updateSoundButton() {
      soundButton.hidden = !audioSuspended && !speechBlocked
    }

    closeCurrent = () => {
      closeCurrent = undefined
      view.inert = true
      lifetime.abort()
      mounted.dispose()
      output?.disconnect()
      effectsOutput = undefined
      showProgram()
      opener.focus({ preventScroll: true })
      if (reducedMotion.matches) {
        view.remove()
        return
      }
      const fade = view.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, easing: 'ease-out' })
      void fade.finished.then(() => view.remove(), () => view.remove())
    }

    layer.replaceChildren(view)
    showProgram(app)
    const mounted = mountProgram(view.querySelector<HTMLElement>('.program-content')!, app, app.entry, context, {
      audio: audioContext && output ? { context: audioContext, output } : undefined,
      launchInput,
      visible: () => !view.closest('[inert]'),
      speechBlocked(blocked) {
        speechBlocked = blocked
        updateSoundButton()
      },
    })
    closeButton.addEventListener('click', () => closeCurrent?.(), { signal: lifetime.signal })
    soundButton.addEventListener('click', mounted.requestAudio, { signal: lifetime.signal })
    observeAudioSuspension(audioContext, lifetime.signal, (suspended) => {
      audioSuspended = suspended
      updateSoundButton()
    })
    closeButton.focus({ preventScroll: true })
  }

  return {
    open,
    close: () => closeCurrent?.(),
    setEffectsMuted(muted: boolean) {
      effectsMuted = muted
      if (effectsOutput) effectsOutput.gain.value = muted ? 0 : 1
    },
  }
}
