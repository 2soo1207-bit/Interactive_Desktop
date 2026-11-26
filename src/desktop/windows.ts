import { mountProgram, mountWindow } from '../apps/runtime'
import type { AppContext, DesktopApp, OpenApp } from '../apps/runtime'
import { bindDrag } from '../core/pointer'
import { clamp, fitPosition } from '../ui/geometry'
import type { Bounds, Point, Size } from '../ui/geometry'
import { icon } from '../ui/icons'

const preferredSize = { width: 628, height: 408 }
const minimumSize = { width: 284, height: 192 }
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')

interface FinderControls {
  title: HTMLButtonElement
  locations: HTMLElement
  back: HTMLButtonElement
  forward: HTMLButtonElement
  view: HTMLButtonElement
  search: HTMLButtonElement
  searchRow: HTMLElement
  query: HTMLInputElement
  content: HTMLElement
}

interface AppWindow {
  app: DesktopApp
  element: HTMLElement
  opener: HTMLButtonElement
  controls?: FinderControls
  history: DesktopApp[]
  location: number
  listeners: AbortController
  bounds: Bounds
  size: Size
  position?: Point
  initialArea?: () => Bounds
  maximized: boolean
  order: number
  dispose?: () => void
}

type FinderWindow = AppWindow & { controls: FinderControls }

function isFinder(entry: AppWindow): entry is FinderWindow {
  return Boolean(entry.controls)
}

export class Windows {
  #layer: HTMLElement
  #context: AppContext
  #folders: readonly DesktopApp[]
  #openApp: OpenApp
  #changed: () => void
  #windows = new Map<string, AppWindow>()
  #active: AppWindow | undefined
  #top = 0

  constructor(layer: HTMLElement, context: AppContext, folders: readonly DesktopApp[], openApp: OpenApp, changed: () => void) {
    this.#layer = layer
    this.#context = context
    this.#folders = folders
    this.#openApp = openApp
    this.#changed = changed
    new ResizeObserver(() => {
      for (const entry of this.#windows.values()) this.#place(entry)
    }).observe(layer)
  }

  get activeApp() {
    const active = this.#active
    return active?.history[active.location]
  }

  open(app: DesktopApp, opener: HTMLButtonElement, launchInput?: Parameters<OpenApp>[2], initialArea?: () => Bounds) {
    const existing = this.#windows.get(app.id)
    if (existing) {
      existing.opener = opener
      const restoring = existing.element.hidden
      existing.element.hidden = false
      existing.element.inert = false
      if (existing.initialArea) this.#place(existing)
      this.#activate(existing)
      if (restoring) this.#animateOpen(existing.element)
      existing.element.focus({ preventScroll: true })
      return
    }

    const element = document.createElement('section')
    const heading = `window-title-${app.id}`
    const programWindow = Boolean(app.entry || (app.surface === 'tile' && app.mount))
    element.className = programWindow ? 'app-window app-window--program' : 'app-window'
    element.dataset.app = app.id
    element.tabIndex = -1
    element.setAttribute('role', 'dialog')
    element.setAttribute('aria-labelledby', heading)
    const windowControls = `
      <div class="window-controls">
        <button type="button" data-action="close" aria-label="Close" title="Close">${icon('close')}</button>
        <button type="button" data-action="minimize" aria-label="Minimize" title="Minimize">${icon('minimize')}</button>
        <button type="button" data-action="maximize" aria-label="Maximize" title="Maximize">${icon('maximize')}</button>
      </div>
    `
    const resize = `<div class="window-resize" tabindex="0" role="group" aria-label="Resize window with arrow keys" data-gesture-target>${icon('resize')}</div>`
    element.innerHTML = programWindow ? `
      <header class="window-titlebar" data-gesture-target>
        ${windowControls}
        <h2 class="window-title" id="${heading}"></h2>
      </header>
      <div class="window-program"></div>
      ${resize}
    ` : `
      <header class="window-titlebar" data-gesture-target>
        ${windowControls}
        <div class="window-history" role="group" aria-label="Folder history">
          <button class="window-tool" type="button" data-action="back" aria-label="Back" title="Back" disabled>${icon('back')}</button>
          <button class="window-tool" type="button" data-action="forward" aria-label="Forward" title="Forward" disabled>${icon('forward')}</button>
        </div>
        <h2 class="window-title" id="${heading}">
          <button class="window-location" type="button" data-action="location" aria-expanded="false" aria-controls="locations-${app.id}">
            <span></span>${icon('down')}
          </button>
        </h2>
        <div class="window-tools">
          <button class="window-tool" type="button" data-action="view" aria-label="Switch to list view" title="Switch to list view">${icon('grid')}</button>
          <button class="window-tool" type="button" data-action="search" aria-label="Search folder" title="Search folder" aria-expanded="false" aria-controls="search-${app.id}">${icon('search')}</button>
        </div>
        <div class="window-locations" id="locations-${app.id}" role="group" aria-label="Folders" hidden></div>
      </header>
      <div class="window-search" id="search-${app.id}" role="search" hidden>
        ${icon('search')}
        <input type="search" aria-label="Search this folder" placeholder="Search this folder" autocomplete="off">
      </div>
      <div class="window-content" data-view="grid"></div>
      ${resize}
    `
    const area = this.#area()
    const offset = (this.#windows.size % 4) * 23
    const size = app.windowSize ?? preferredSize
    const control = (action: string) => element.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!
    const entry: AppWindow = {
      app,
      element,
      opener,
      controls: programWindow ? undefined : {
        title: control('location'),
        locations: element.querySelector('.window-locations')!,
        back: control('back'),
        forward: control('forward'),
        view: control('view'),
        search: control('search'),
        searchRow: element.querySelector('.window-search')!,
        query: element.querySelector('.window-search input')!,
        content: element.querySelector('.window-content')!,
      },
      history: [app],
      location: 0,
      listeners: new AbortController(),
      bounds: { x: 0, y: 0, ...size },
      size,
      initialArea,
      position: programWindow ? undefined : {
        x: (area.width - size.width) / 2 - 54 + offset,
        y: (area.height - size.height) / 2 + offset,
      },
      maximized: false,
      order: 0,
    }
    this.#windows.set(app.id, entry)
    this.#layer.append(element)
    this.#place(entry)
    this.#bind(entry)
    if (isFinder(entry)) {
      this.#bindFinder(entry)
      this.#renderLocation(entry)
    } else {
      element.querySelector('.window-title')!.textContent = app.menuName ?? app.name
      const content = element.querySelector<HTMLElement>('.window-program')!
      if (app.entry) {
        const visible = () => !element.closest('[inert]')
        const mounted = mountProgram(content, app, app.entry, this.#context, {
          launchInput,
          focusOnLoad: false,
          visible,
          activate: () => { if (visible()) this.#activate(entry) },
        })
        entry.dispose = mounted.dispose
      } else {
        entry.dispose = app.mount?.(content, app, this.#context) || undefined
      }
    }
    this.#activate(entry)
    this.#animateOpen(element)
    element.focus({ preventScroll: true })
  }

  #animateOpen(element: HTMLElement) {
    if (!motionPreference.matches) {
      element.animate(
        [{ opacity: 0, transform: 'translateY(12px) scale(.975)' }, { opacity: 1, transform: 'none' }],
        { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' },
      )
    }
  }

  #renderLocation(entry: FinderWindow) {
    const current = entry.history[entry.location]
    const { title, locations, back, forward, view, search, content } = entry.controls
    title.querySelector('span')!.textContent = current.name
    title.title = `${current.name} · Choose folder`
    locations.querySelectorAll('button').forEach((button) => {
      if (button.dataset.folder === current.id) button.setAttribute('aria-current', 'location')
      else button.removeAttribute('aria-current')
    })
    back.disabled = entry.location === 0
    forward.disabled = entry.location === entry.history.length - 1
    view.disabled = search.disabled = !current.items?.length
    this.#showLocations(entry, false)
    this.#showSearch(entry, false)
    entry.dispose?.()
    const dispose = mountWindow(content, current, this.#context, (app, opener, input) => {
      if (app.surface === 'folder' && !app.entry) this.#visit(entry, app)
      else this.#openApp(app, opener, input)
    })
    entry.dispose = dispose || undefined
    if (current.items?.length) {
      const empty = document.createElement('p')
      empty.className = 'window-no-results'
      empty.textContent = 'No matching items'
      empty.setAttribute('role', 'status')
      empty.hidden = true
      content.append(empty)
    }
    this.#changed()
  }

  #visit(entry: FinderWindow, folder: DesktopApp) {
    if (entry.history[entry.location].id !== folder.id) {
      entry.history.splice(entry.location + 1, entry.history.length, folder)
      entry.location++
      this.#renderLocation(entry)
    } else {
      this.#showLocations(entry, false)
    }
    entry.controls.title.focus({ preventScroll: true })
  }

  #step(entry: FinderWindow, offset: number) {
    const location = entry.location + offset
    if (location < 0 || location >= entry.history.length) return
    entry.location = location
    this.#renderLocation(entry)
  }

  #showLocations({ controls }: FinderWindow, open: boolean) {
    controls.locations.hidden = !open
    controls.title.setAttribute('aria-expanded', String(open))
  }

  #showSearch(entry: FinderWindow, open: boolean) {
    const { searchRow, search, query } = entry.controls
    searchRow.hidden = !open
    search.setAttribute('aria-expanded', String(open))
    if (open) query.focus({ preventScroll: true })
    else {
      query.value = ''
      this.#filter(entry)
    }
  }

  #filter({ controls: { query, content } }: FinderWindow) {
    const term = query.value.trim().toLocaleLowerCase()
    const items = content.querySelectorAll<HTMLLIElement>('.folder-items > li')
    let visible = false
    for (const item of items) {
      item.hidden = !item.textContent!.toLocaleLowerCase().includes(term)
      visible ||= !item.hidden
    }
    const empty = content.querySelector<HTMLElement>('.window-no-results')
    if (empty) empty.hidden = visible || !term
  }

  #area(): Size {
    return { width: this.#layer.clientWidth, height: this.#layer.clientHeight }
  }

  #margin(entry: AppWindow, area: Size) {
    const margin = entry.maximized ? 8 : isFinder(entry) ? 0 : 10
    return Math.min(margin, Math.floor(Math.min(area.width, area.height) / 4))
  }

  #place(entry: AppWindow) {
    const initialArea = !entry.maximized && !entry.position ? entry.initialArea?.() : undefined
    const area = initialArea ?? { x: 0, y: 0, ...this.#area() }
    const margin = this.#margin(entry, area)
    const inner = { width: area.width - margin * 2, height: area.height - margin * 2 }
    const scale = initialArea ? Math.min(1, inner.width / entry.size.width, inner.height / entry.size.height) : 1
    const width = entry.maximized ? inner.width : Math.min(entry.size.width * scale, inner.width)
    const height = entry.maximized ? inner.height : Math.min(entry.size.height * scale, inner.height)
    const origin = !entry.maximized && entry.position
      ? { x: entry.position.x - margin, y: entry.position.y - margin }
      : { x: (inner.width - width) / 2, y: (inner.height - height) / 2 }
    const fitted = fitPosition(origin, { width, height }, inner)
    const x = area.x + fitted.x + margin
    const y = area.y + fitted.y + margin
    entry.bounds = { x, y, width, height }
    Object.assign(entry.element.style, {
      left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`,
    })
  }

  #bind(entry: AppWindow) {
    const { element } = entry
    const titlebar = element.querySelector<HTMLElement>('.window-titlebar')!
    const resizer = element.querySelector<HTMLElement>('.window-resize')!
    const fromButton = (event: Event) => (event.target as Element).closest('button')
    element.addEventListener('pointerdown', () => this.#activate(entry))
    element.addEventListener('focusin', () => this.#activate(entry))
    element.querySelector('[data-action="close"]')?.addEventListener('click', () => this.#close(entry))
    element.querySelector('[data-action="minimize"]')?.addEventListener('click', () => this.#minimize(entry))
    element.querySelector('[data-action="maximize"]')?.addEventListener('click', () => this.#maximize(entry))
    titlebar.addEventListener('dblclick', (event) => {
      if (!fromButton(event)) this.#maximize(entry)
    })

    bindDrag(titlebar, (event) => {
      if (entry.maximized || fromButton(event)) return
      const initial = entry.bounds
      return { move: ({ x, y }) => {
        if (entry.initialArea && !entry.position) entry.size = { width: initial.width, height: initial.height }
        entry.position = { x: initial.x + x, y: initial.y + y }
        this.#place(entry)
        entry.position = { x: entry.bounds.x, y: entry.bounds.y }
      } }
    })
    bindDrag(resizer, () => {
      if (entry.maximized) return
      const initial = entry.bounds
      return { move: ({ x, y }) => this.#resize(entry, initial, x, y) }
    })
    resizer.addEventListener('keydown', (event) => {
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16],
      }
      const delta = arrows[event.key]
      if (!delta || entry.maximized) return
      event.preventDefault()
      this.#resize(entry, entry.bounds, ...delta)
    })
  }

  #bindFinder(entry: FinderWindow) {
    const { element, controls } = entry
    const { locations, title, back, forward, view, search, searchRow, query, content } = controls
    const { signal } = entry.listeners
    for (const folder of this.#folders) {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.folder = folder.id
      button.textContent = folder.name
      button.addEventListener('click', () => this.#visit(entry, folder))
      locations.append(button)
    }
    title.addEventListener('click', () => this.#showLocations(entry, locations.hidden === true))
    back.addEventListener('click', () => this.#step(entry, -1))
    forward.addEventListener('click', () => this.#step(entry, 1))
    view.addEventListener('click', () => {
      const list = content.dataset.view !== 'list'
      content.dataset.view = list ? 'list' : 'grid'
      const label = list ? 'Switch to icon view' : 'Switch to list view'
      view.title = label
      view.setAttribute('aria-label', label)
      view.innerHTML = icon(list ? 'list' : 'grid')
    })
    search.addEventListener('click', () => this.#showSearch(entry, searchRow.hidden === true))
    query.addEventListener('input', () => this.#filter(entry))
    document.addEventListener('pointerdown', (event) => {
      const target = event.target as Node
      if (!locations.hidden && !title.contains(target) && !locations.contains(target)) {
        this.#showLocations(entry, false)
      }
    }, { signal })
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return
      if (!locations.hidden) {
        this.#showLocations(entry, false)
        title.focus()
      } else if (!searchRow.hidden) {
        this.#showSearch(entry, false)
        search.focus()
      } else return
      event.stopPropagation()
    })
  }

  #resize(entry: AppWindow, initial: Bounds, x: number, y: number) {
    const area = this.#area()
    const margin = this.#margin(entry, area)
    const width = clamp(initial.width + x, minimumSize.width, area.width - initial.x - margin)
    const height = clamp(initial.height + y, minimumSize.height, area.height - initial.y - margin)
    entry.position = initial
    entry.size = { width, height }
    this.#place(entry)
  }

  #activate(entry: AppWindow) {
    if (entry.element.hidden || this.#windows.get(entry.app.id) !== entry) return
    if (this.#active !== entry) {
      if (this.#active) this.#active.element.dataset.active = 'false'
      entry.order = ++this.#top
      entry.element.style.zIndex = String(entry.order)
      entry.element.dataset.active = 'true'
      this.#active = entry
    }
    this.#changed()
  }

  #selectNext(entry: AppWindow) {
    if (this.#active !== entry) {
      this.#changed()
      return
    }
    entry.element.dataset.active = 'false'
    this.#active = undefined
    const next = [...this.#windows.values()]
      .filter(({ element }) => !element.hidden)
      .sort((a, b) => b.order - a.order)[0]
    if (next) {
      this.#activate(next)
      next.element.focus({ preventScroll: true })
    } else {
      this.#changed()
      const opener = entry.opener.isConnected && !entry.opener.closest('[hidden], [inert]')
        ? entry.opener
        : this.#layer.parentElement
      opener?.focus({ preventScroll: true })
    }
  }

  #minimize(entry: AppWindow) {
    if (isFinder(entry)) this.#showLocations(entry, false)
    entry.element.inert = true
    entry.element.hidden = true
    this.#selectNext(entry)
  }

  #close(entry: AppWindow) {
    if (this.#windows.get(entry.app.id) !== entry) return
    this.#windows.delete(entry.app.id)
    entry.element.inert = true
    entry.listeners.abort()
    // Remove the label ID immediately if the same app is reopened during the fade.
    entry.element.querySelector('.window-title')?.removeAttribute('id')
    if (isFinder(entry)) {
      entry.controls.locations.removeAttribute('id')
      entry.controls.searchRow.removeAttribute('id')
    }
    entry.dispose?.()
    this.#selectNext(entry)
    if (motionPreference.matches) {
      entry.element.remove()
      return
    }
    const fade = entry.element.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(.975)' }],
      { duration: 160, easing: 'ease-in', fill: 'forwards' },
    )
    void fade.finished.then(() => entry.element.remove(), () => entry.element.remove())
  }

  #maximize(entry: AppWindow) {
    entry.maximized = !entry.maximized
    entry.element.dataset.maximized = String(entry.maximized)
    const toggle = entry.element.querySelector<HTMLButtonElement>('[data-action="maximize"]')!
    const label = entry.maximized ? 'Restore size' : 'Maximize'
    toggle.setAttribute('aria-label', label)
    toggle.title = label
    toggle.innerHTML = icon(entry.maximized ? 'restore' : 'maximize')
    this.#place(entry)
  }
}
