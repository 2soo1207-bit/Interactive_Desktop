import { createAudioContext } from './audio.ts'
import type { AudioOutput } from './audio.ts'

export interface AppLifecycle {
  dispose(): void
  visibilityChanged?(): void
  audioRequested?(): void
}

export interface DesktopHost {
  cameraFor(owner: Window, signal: AbortSignal): Promise<MediaStream>
  audioFor(owner: Window): AudioOutput | undefined
  reportSpeechBlocked(owner: Window, blocked: boolean): void
  connect(owner: Window, lifecycle: AppLifecycle): void
  visible(owner: Window): boolean
  gestures(owner: Window): boolean
}

declare global {
  interface Window {
    playgroundApps?: DesktopHost
  }
}

function desktopHost() {
  if (typeof window === 'undefined' || window.parent === window) return
  try {
    return window.parent.playgroundApps
  } catch {
    return undefined
  }
}

export function desktopCamera(signal: AbortSignal) {
  return desktopHost()?.cameraFor(window, signal)
}

export function openAppAudio() {
  const host = desktopHost()
  const hosted = host?.audioFor(window)
  const context = host ? hosted?.context : createAudioContext()
  if (!context) return

  const output = context.createGain()
  output.connect(hosted?.output ?? context.destination)
  return {
    context,
    output,
    close() {
      output.disconnect()
      if (!host && context.state !== 'closed') void context.close().catch(() => {})
    },
  }
}

export function appAudioWindow() {
  return desktopHost() ? window.parent as Window & typeof globalThis : window
}

export function reportSpeechBlocked(blocked: boolean) {
  desktopHost()?.reportSpeechBlocked(window, blocked)
}

export function appVisible() {
  return desktopHost()?.visible(window) ?? true
}

export function appGesturesAllowed() {
  return desktopHost()?.gestures(window) ?? true
}

export function connectDesktop(backSelector: string | null, lifecycle: AppLifecycle) {
  const host = desktopHost()
  if (!host) return

  const back = backSelector && document.querySelector<HTMLElement>(backSelector)
  if (back) {
    // Keep its space in the original header while the host provides the exit.
    back.style.visibility = 'hidden'
  }
  host.connect(window, lifecycle)
}

export const handsAssetBase = () => new URL('../../app-assets/mediapipe-hands/', location.href).href
