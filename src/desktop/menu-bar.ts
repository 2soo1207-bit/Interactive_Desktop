import type { Camera } from '../core/camera'
import type { HandInput } from '../core/hand-tracking'
import { icon } from '../ui/icons'

function bindMenu(button: HTMLButtonElement, panel: HTMLElement) {
  function show(open: boolean) {
    panel.hidden = !open
    button.setAttribute('aria-expanded', String(open))
  }

  button.addEventListener('click', () => show(panel.hidden === true))
  function closeOnOutsideInput(event: Event) {
    const target = event.target as Node
    if (!panel.hidden && !panel.contains(target) && !button.contains(target)) show(false)
  }
  document.addEventListener('pointerdown', closeOnOutsideInput)
  document.addEventListener('click', closeOnOutsideInput)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      show(false)
      button.focus()
    }
  })
  return () => show(false)
}

export function buildMenuBar(camera: Camera, hand: HandInput, onLock: () => void, setEffectsMuted: (muted: boolean) => void, openCamera: (opener: HTMLButtonElement) => void) {
  const element = document.createElement('header')
  element.className = 'menu-bar'
  element.innerHTML = `
    <div class="menu-left">
      <button type="button" class="menu-control menu-brand" aria-label="Desktop menu" aria-controls="desktop-menu" aria-expanded="false">${icon('apple')}</button>
      <span class="menu-active-app">Finder</span>
      <div id="desktop-menu" class="menu-panel desktop-menu" hidden>
        <button type="button" class="lock-desktop">${icon('lock')}<span>Lock screen</span></button>
      </div>
    </div>
    <div class="menu-right">
      <span class="menu-network" role="img"></span>
      <button type="button" class="menu-control menu-sound" aria-label="Playground sound effects"></button>
      <div class="camera-control">
        <button type="button" class="menu-control camera-trigger" aria-label="Camera" aria-controls="camera-menu" aria-expanded="false"></button>
        <div id="camera-menu" class="menu-panel camera-menu" hidden>
          <p class="camera-message" role="status"></p>
          <button type="button" class="camera-open">${icon('video')}<span>Open CAMERA</span></button>
          <button type="button" class="camera-action"></button>
        </div>
      </div>
      <div class="hand-control">
        <button type="button" class="menu-control hand-switch" role="switch" aria-label="Hand Tracking" aria-checked="false" aria-describedby="hand-status">${icon('hand')}</button>
        <span id="hand-status" class="sr-only" role="status"></span>
        <div class="menu-panel hand-notice" aria-hidden="true" hidden></div>
      </div>
      <time class="menu-clock" lang="ko"><span class="menu-date"></span> <span class="menu-time"></span></time>
    </div>
  `

  const activeApp = element.querySelector<HTMLElement>('.menu-active-app')!
  const desktopMenu = bindMenu(
    element.querySelector<HTMLButtonElement>('.menu-brand')!,
    element.querySelector<HTMLElement>('.desktop-menu')!,
  )
  element.querySelector('.lock-desktop')!.addEventListener('click', onLock)

  const network = element.querySelector<HTMLElement>('.menu-network')!
  function updateNetwork() {
    const online = navigator.onLine
    const label = online ? 'Browser reports online' : 'Browser reports offline'
    network.innerHTML = icon(online ? 'wifi' : 'wifiOff')
    network.dataset.online = String(online)
    network.setAttribute('aria-label', label)
    network.title = label
  }
  window.addEventListener('online', updateNetwork)
  window.addEventListener('offline', updateNetwork)
  updateNetwork()

  const sound = element.querySelector<HTMLButtonElement>('.menu-sound')!
  function updateSound(muted: boolean) {
    sound.innerHTML = icon(muted ? 'volumeOff' : 'volume')
    sound.setAttribute('aria-pressed', String(!muted))
    sound.title = muted ? 'Unmute Playground sound effects' : 'Mute Playground sound effects'
  }
  updateSound(false)
  if (typeof AudioContext !== 'function') {
    sound.disabled = true
    sound.title = 'Playground sound effects are unavailable'
  }
  sound.addEventListener('click', () => {
    const muted = sound.getAttribute('aria-pressed') === 'true'
    setEffectsMuted(muted)
    updateSound(muted)
  })

  const cameraButton = element.querySelector<HTMLButtonElement>('.camera-trigger')!
  const cameraPanel = element.querySelector<HTMLElement>('.camera-menu')!
  const cameraMessage = element.querySelector<HTMLElement>('.camera-message')!
  const cameraAction = element.querySelector<HTMLButtonElement>('.camera-action')!
  const cameraMenu = bindMenu(cameraButton, cameraPanel)
  element.querySelector('.camera-open')!.addEventListener('click', () => {
    cameraMenu()
    openCamera(cameraButton)
  })
  camera.subscribe(({ status, message }) => {
    cameraButton.dataset.status = status
    cameraButton.innerHTML = icon(status === 'live' || status === 'requesting' ? 'video' : 'videoOff')
    cameraButton.title = status === 'live' ? `Camera on · ${message}` : message
    cameraMessage.textContent = message
    cameraAction.textContent = {
      live: 'Turn camera off', requesting: 'Cancel', unavailable: 'Try again', off: 'Turn camera on',
    }[status]
  })
  cameraAction.addEventListener('click', () => {
    if (camera.state.status === 'live' || camera.state.status === 'requesting') camera.stop()
    else void camera.start()
  })

  const handSwitch = element.querySelector<HTMLButtonElement>('.hand-switch')!
  const handAnnouncement = element.querySelector<HTMLElement>('#hand-status')!
  const notice = element.querySelector<HTMLElement>('.hand-notice')!
  let noticeTimer = 0
  function hideNotice() {
    window.clearTimeout(noticeTimer)
    notice.hidden = true
  }
  hand.observe(({ enabled, active, message }) => {
    handSwitch.setAttribute('aria-checked', String(enabled))
    handSwitch.dataset.active = String(active)
    handSwitch.title = message
    handAnnouncement.textContent = message
    notice.textContent = message
    hideNotice()
    if (enabled) {
      notice.hidden = false
      noticeTimer = window.setTimeout(hideNotice, 3000)
    }
  })
  handSwitch.addEventListener('click', () => hand.setEnabled(!hand.enabled))

  return {
    element,
    cameraButton,
    clock: element.querySelector<HTMLTimeElement>('.menu-clock')!,
    setActiveApp(name = 'Finder') {
      if (activeApp.textContent === name) return
      activeApp.textContent = name
      activeApp.title = name
    },
    hidePanels() {
      desktopMenu()
      cameraMenu()
      hideNotice()
    },
  }
}
