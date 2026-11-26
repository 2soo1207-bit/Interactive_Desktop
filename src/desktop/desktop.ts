import { cameraApp } from '../apps/camera-preview'
import { apps } from '../apps/catalog'
import { FileLibrary } from '../apps/files'
import { FrameHost } from '../apps/frame-host'
import { appIcon } from '../apps/runtime'
import type { DesktopApp, OpenApp } from '../apps/runtime'
import { Camera } from '../core/camera'
import { HandInput } from '../core/hand-tracking'
import type { HandTracker } from '../core/hand-tracking'
import { bindDrag } from '../core/pointer'
import type { Point } from '../ui/geometry'
import { buildMenuBar } from './menu-bar'
import { buildProgramPlayer } from './program-player'
import { fitShortcut, planShortcuts, resizeShortcuts, separateShortcuts, spaceForWindow } from './shortcut-layout'
import type { ShortcutLayout } from './shortcut-layout'
import { Windows } from './windows'

export function buildDesktop(onLock: () => void, tracker: HandTracker) {
  const screen = document.createElement('section')
  screen.className = 'live-desktop'
  screen.setAttribute('aria-label', 'Live Desktop')
  screen.inert = true
  screen.innerHTML = `
    <video class="desktop-video" playsinline muted autoplay aria-hidden="true"></video>
    <div class="desktop-workspace">
      <main class="desktop-stage" tabindex="-1" aria-label="Desktop">
        <div class="shortcuts" aria-label="Desktop apps"></div>
        <div class="window-layer"></div>
      </main>
    </div>
    <div class="program-layer"></div>
    <div class="hand-cursor" aria-hidden="true" hidden></div>
  `

  const video = screen.querySelector<HTMLVideoElement>('video')!
  video.muted = true
  const camera = new Camera(video)
  const frames = new FrameHost(camera)
  const hand = new HandInput(camera, screen.querySelector<HTMLElement>('.hand-cursor')!, tracker, (target) => frames.setHandTarget(target))
  const files = new FileLibrary()
  const context = { camera, files, frames, hand }
  const workspace = screen.querySelector<HTMLElement>('.desktop-workspace')!
  let activeProgram: DesktopApp | undefined
  const programs = buildProgramPlayer(screen.querySelector<HTMLElement>('.program-layer')!, context, (app) => {
    activeProgram = app
    workspace.inert = Boolean(app)
    screen.toggleAttribute('data-program-open', Boolean(app))
    updateActiveApp()
    menu.hidePanels()
    frames.updateVisibility()
  })
  const menu = buildMenuBar(camera, hand, onLock, programs.setEffectsMuted, openCamera)
  workspace.before(menu.element)
  const openApp: OpenApp = (app, opener, input) => {
    if (app.entry && !app.windowSize) programs.open(app, opener, input)
    else windows.open(app, opener, input)
  }
  const shortcutArea = screen.querySelector<HTMLElement>('.shortcuts')!
  const layer = screen.querySelector<HTMLElement>('.window-layer')!
  const folders = apps.filter((app) => app.surface === 'folder')
  const folderShortcuts = folders.filter((app) => app.id !== 'gallery')
  const groups = [folderShortcuts, apps.filter((app) => !folderShortcuts.includes(app))].filter((group) => group.length)
  const groupSizes = groups.map((group) => group.length)
  const shortcuts: HTMLButtonElement[] = []
  let shortcutLayout: ShortcutLayout | undefined
  let positions: Point[] = []
  let movedShortcuts = false
  const windows = new Windows(layer, context, folders, openApp, () => {
    updateActiveApp()
    frames.updateVisibility()
  })

  function openCamera(opener: HTMLButtonElement) {
    windows.open(cameraApp, opener, undefined, () => {
      layoutShortcuts()
      const bounds = shortcutLayout && spaceForWindow(shortcutLayout, cameraApp.windowSize)
      return bounds?.width && bounds.height ? bounds : { x: 0, y: 0, width: layer.clientWidth, height: layer.clientHeight }
    })
  }

  function updateActiveApp() {
    const app = activeProgram ?? windows.activeApp
    menu.setActiveApp(app?.menuName ?? app?.name)
  }

  function placeShortcut(index: number, position: Point) {
    positions[index] = position
    shortcuts[index].style.left = `${position.x}px`
    shortcuts[index].style.top = `${position.y}px`
  }

  function layoutShortcuts(reset = false) {
    const area = { width: shortcutArea.clientWidth, height: shortcutArea.clientHeight }
    if (!area.width || !area.height) return
    const previous = shortcutLayout
    if (!reset && previous?.area.width === area.width && previous.area.height === area.height) return
    let layout = planShortcuts(area, groupSizes)
    const cameraSpace = spaceForWindow(layout, cameraApp.windowSize)
    if (cameraSpace.width < 284 || cameraSpace.height < 206) {
      // Keep the two groups at the upper right and leave a usable preview below.
      layout = { ...planShortcuts({ ...area, height: Math.floor(area.height / 2) }, groupSizes), area }
    }
    const resized = !reset && movedShortcuts && previous ? resizeShortcuts(positions, previous, layout) : undefined
    const { width, height } = layout.box
    const font = Math.max(1, Math.min(16, (width - 14) / 8.5, height * .17))
    const labelSpace = font * 1.15 + 22
    const size = Math.max(1, Math.min(83, width - 10, height - labelSpace))
    shortcutArea.style.setProperty('--shortcut-width', `${width}px`)
    shortcutArea.style.setProperty('--shortcut-height', `${height}px`)
    shortcutArea.style.setProperty('--shortcut-font', `${font}px`)
    shortcutArea.style.setProperty('--shortcut-icon-size', `${size}px`)
    shortcutLayout = layout
    movedShortcuts = Boolean(resized)
    const next = resized ?? layout.positions
    next.forEach((position, index) => placeShortcut(index, position))
  }

  groups.flat().forEach((app, index) => {
    const shortcut = document.createElement('button')
    shortcut.type = 'button'
    shortcut.className = 'desktop-shortcut'
    shortcut.dataset.app = app.id
    shortcut.setAttribute('data-gesture-target', '')
    shortcut.innerHTML = appIcon(app)
    const label = document.createElement('span')
    label.className = 'shortcut-label'
    label.textContent = app.name
    shortcut.append(label)
    shortcut.addEventListener('click', (event) => openApp(app, shortcut, event.isTrusted ? 'direct' : 'dwell'))
    bindDrag(shortcut, () => {
      const origin = positions[index]
      if (!origin) return
      return { move: ({ x, y }) => {
        const layout = shortcutLayout
        if (!layout) return
        const point = fitShortcut({ x: origin.x + x, y: origin.y + y }, layout)
        if (positions.every((other, i) => i === index || separateShortcuts(point, other, layout))) {
          movedShortcuts = true
          placeShortcut(index, point)
        }
      } }
    })
    shortcuts.push(shortcut)
    shortcutArea.append(shortcut)
  })
  new ResizeObserver(() => layoutShortcuts()).observe(shortcutArea)

  return {
    screen,
    camera,
    clock: menu.clock,
    show() {
      screen.inert = false
      frames.updateVisibility()
      layoutShortcuts(true)
      updateActiveApp()
      openCamera(menu.cameraButton)
      hand.setEnabled(true)
    },
    hide() {
      programs.close()
      screen.inert = true
      frames.updateVisibility()
      menu.hidePanels()
      hand.setEnabled(false)
    },
  }
}
