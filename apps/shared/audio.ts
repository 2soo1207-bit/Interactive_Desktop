export interface AudioOutput {
  context: AudioContext
  output: AudioNode
}

export function createAudioContext() {
  try { return new AudioContext() }
  catch { return undefined }
}

export function resumeAudio(context: AudioContext | undefined) {
  if (!context || context.state === 'running' || context.state === 'closed') return
  void context.resume().catch(() => {
    // The context state drives the recovery control, including pending resumes.
  })
}

export function observeAudioSuspension(
  context: AudioContext | undefined,
  signal: AbortSignal,
  update: (suspended: boolean) => void,
) {
  if (!context) return

  const check = () => {
    const { state } = context
    update(state !== 'running' && state !== 'closed')
  }

  // Give an allowed context time to start before showing a recovery button.
  const timer = window.setTimeout(() => {
    context.addEventListener('statechange', check, { signal })
    check()
  }, 350)
  signal.addEventListener('abort', () => window.clearTimeout(timer), { once: true })
}
