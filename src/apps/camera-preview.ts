import { icon } from '../ui/icons'
import type { DesktopApp } from './runtime'

export const cameraApp = {
  id: 'camera',
  name: 'CAMERA',
  glyph: 'video',
  surface: 'tile',
  color: 'ink',
  windowSize: { width: 1215, height: 810 },
  mount(container, _app, { camera }) {
    const view = document.createElement('div')
    view.className = 'camera-preview'
    view.innerHTML = `
      <video muted autoplay playsinline aria-label="Mirrored camera preview" hidden></video>
      <div class="camera-preview-empty">
        ${icon('videoOff')}
        <p role="status"></p>
        <button type="button">Turn camera on</button>
      </div>
    `
    container.replaceChildren(view)
    const video = view.querySelector('video')!
    const empty = view.querySelector<HTMLElement>('.camera-preview-empty')!
    const statusText = empty.querySelector('p')!
    const retry = empty.querySelector('button')!
    video.muted = true
    retry.addEventListener('click', () => { void camera.start() })

    const unsubscribe = camera.subscribe(({ status, message }) => {
      const live = status === 'live'
      const stream = live ? camera.stream : null
      video.hidden = !live
      empty.hidden = live
      if (video.srcObject !== stream) video.srcObject = stream
      statusText.textContent = message
      retry.hidden = status === 'requesting'
      retry.textContent = status === 'unavailable' ? 'Try again' : 'Turn camera on'
    })

    return () => {
      unsubscribe()
      video.srcObject = null
    }
  },
} satisfies DesktopApp
