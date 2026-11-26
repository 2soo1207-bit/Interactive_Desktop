import { publicAsset } from '../appearance'
import { resumeAudio } from '../../apps/shared/audio'
import type { AudioOutput } from '../../apps/shared/audio'
import { icon } from '../ui/icons'
import type { Glyph } from '../ui/icons'
import type { Camera } from '../core/camera'
import type { HandInput } from '../core/hand-tracking'
import type { Size } from '../ui/geometry'
import type { FileLibrary } from './files'
import type { FrameHost } from './frame-host'

export interface AppContext {
  camera: Camera
  files: FileLibrary
  frames: FrameHost
  hand: HandInput
}

export type OpenApp = (app: DesktopApp, opener: HTMLButtonElement, input?: 'direct' | 'dwell') => void

interface ProgramOptions {
  audio?: AudioOutput
  launchInput?: 'direct' | 'dwell'
  activate?(): void
  focusOnLoad?: boolean
  visible(): boolean
  speechBlocked?(blocked: boolean): void
}

export interface DesktopApp {
  id: string
  name: string
  menuName?: string
  glyph: Glyph
  surface: 'tile' | 'folder'
  color: 'ink' | 'rose' | 'gloss' | 'lavender'
  emptyMessage?: string
  iconImage?: string
  entry?: string
  items?: readonly DesktopApp[]
  usesCamera?: boolean
  usesAudio?: boolean
  autoplayOrigins?: readonly string[]
  windowSize?: Size
  mount?: (container: HTMLElement, app: DesktopApp, context: AppContext) => void | (() => void)
}

export function appIcon(app: DesktopApp) {
  if (app.iconImage) {
    const path = app.iconImage.split('/').map(encodeURIComponent).join('/')
    return `<img class="app-icon app-icon--image" src="${publicAsset(path)}" alt="" draggable="false">`
  }
  return `<span class="app-icon app-icon--${app.surface} app-icon--${app.color}" aria-hidden="true">
    <span class="app-icon__face">${icon(app.glyph)}</span>
  </span>`
}

export function showEmpty(container: HTMLElement, app: DesktopApp, message = app.emptyMessage ?? 'No items yet') {
  const view = document.createElement('div')
  const label = document.createElement('p')
  view.className = 'app-empty'
  view.innerHTML = appIcon(app)
  label.textContent = message
  view.append(label)
  container.replaceChildren(view)
}

export function mountWindow(container: HTMLElement, app: DesktopApp, context: AppContext, open: OpenApp) {
  if (app.items?.length) {
    const list = document.createElement('ul')
    list.className = 'folder-items'
    for (const child of app.items) {
      const item = document.createElement('li')
      const button = document.createElement('button')
      const label = document.createElement('span')
      button.type = 'button'
      button.className = 'folder-item'
      button.dataset.app = child.id
      button.innerHTML = appIcon(child)
      label.textContent = child.name
      button.append(label)
      button.addEventListener('click', () => open(child, button))
      item.append(button)
      list.append(item)
    }
    container.replaceChildren(list)
    return
  }

  if (app.mount) return app.mount(container, app, context)
  showEmpty(container, app)
}

export function mountProgram(container: HTMLElement, app: DesktopApp, entry: string, context: AppContext, options: ProgramOptions) {
  const frame = document.createElement('iframe')
  frame.className = 'app-frame'
  frame.title = app.name
  const cameraPolicy = app.usesCamera ? "camera 'self'" : "camera 'none'"
  const autoplay = ["'self'", ...(app.autoplayOrigins ?? [])].join(' ')
  frame.allow = `${cameraPolicy}; microphone 'none'; autoplay ${autoplay}`
  if (app.autoplayOrigins?.length && options.launchInput) frame.dataset.launchInput = options.launchInput

  function requestAudio() {
    resumeAudio(options.audio?.context)
    if (frame.contentWindow) context.frames.requestSpeech(frame.contentWindow)
  }

  function onInput(event: Event) {
    options.activate?.()
    if (event.isTrusted) requestAudio()
  }

  const inbox = new AbortController()
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== location.origin) return
    const data = event.data
    if (data?.type !== 'playground:save-file' || !(data.file instanceof File)) return

    void context.files.save(data.file).then(
      () => frame.contentWindow?.postMessage({ type: 'playground:file-saved' }, location.origin),
      () => frame.contentWindow?.postMessage({ type: 'playground:file-error' }, location.origin),
    )
  }, { signal: inbox.signal })

  let frameInput: AbortController | undefined
  frame.addEventListener('load', () => {
    frameInput?.abort()
    const frameDocument = frame.contentDocument
    if (frameDocument) {
      frameInput = new AbortController()
      const { signal } = frameInput
      context.hand.observeNativePointers(frameDocument, signal)
      frameDocument.addEventListener('pointerdown', onInput, { capture: true, signal })
      frameDocument.addEventListener('keydown', onInput, { capture: true, signal })
      frameDocument.addEventListener('click', onInput, { capture: true, signal })
      if (options.activate) frameDocument.addEventListener('focusin', options.activate, { signal })
    }
    if (options.focusOnLoad !== false && options.visible()) frame.focus({ preventScroll: true })
  }, { signal: inbox.signal })
  container.replaceChildren(frame)
  const disconnect = context.frames.register(frame, {
    camera: Boolean(app.usesCamera),
    ...options,
    speechBlocked: (blocked) => options.speechBlocked?.(blocked),
  })
  frame.src = publicAsset(entry)
  return {
    requestAudio,
    dispose() {
      inbox.abort()
      frameInput?.abort()
      try { disconnect() }
      catch (error) { console.error('App cleanup failed.', error) }
      finally { frame.remove() }
    },
  }
}

export function mountFiles(container: HTMLElement, app: DesktopApp, { files }: AppContext) {
  let version = 0
  let urls: string[] = []

  function releaseUrls() {
    urls.forEach((url) => URL.revokeObjectURL(url))
    urls = []
  }

  async function refresh() {
    const current = ++version
    try {
      const entries = await files.list()
      if (current !== version) return
      releaseUrls()
      if (!entries.length) {
        showEmpty(container, app)
        return
      }

      const list = document.createElement('ul')
      list.className = 'file-list'
      for (const { file } of entries) {
        const item = document.createElement('li')
        const link = document.createElement('a')
        link.href = URL.createObjectURL(file)
        urls.push(link.href)
        link.download = file.name
        link.textContent = file.name
        item.append(link)
        list.append(item)
      }
      container.replaceChildren(list)
    } catch {
      if (current !== version) return
      releaseUrls()
      showEmpty(container, app, 'File storage unavailable.')
    }
  }

  showEmpty(container, app, 'Loading files…')
  const unsubscribe = files.subscribe(() => { void refresh() })
  void refresh()
  return () => {
    version++
    unsubscribe()
    releaseUrls()
  }
}
