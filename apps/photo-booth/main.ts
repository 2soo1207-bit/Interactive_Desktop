import './style.css'
import './cover.css'
import { assetURL, FRAMES, FILTERS, STICKERS, LAYOUT, layoutOf } from './config.ts'
import type { Photo, Step, Sticker } from './config.ts'
import { Images, asPNG, capturePhoto, composeBase, context, makeCanvas, paintResult, stickerAspect } from './graphics.ts'
import { BoothCamera, Shutter, cameraError, wait } from './media.ts'
import { PrintDelivery } from './motion.ts'
import { connectDesktop } from '../shared/desktop-host.ts'

const steps: readonly { id: Step; name: string }[] = [
  { id: 'start', name: 'Start' }, { id: 'camera', name: 'Camera' }, { id: 'frame', name: 'Frame' }, { id: 'edit', name: 'Edit' }, { id: 'save', name: 'Save' },
]
const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <main class="pb-app" data-step="start">
    <header class="pb-header">
      <a href="../../index.html" class="pb-back" aria-label="데스크톱으로 돌아가기">↖</a>
      <a class="pb-brand" href="./index.html" aria-label="3CE IN FRAME"><span class="pb-brand-mark">3CE<svg class="pb-brand-star" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="M50 6v88M6 50h88M19 19l62 62M19 81l62-62" fill="none" stroke="currentColor" stroke-width="11" /></svg></span><span>IN FRAME</span></a>
      <nav class="pb-progress" aria-label="포토부스 진행 단계"><ol>${steps.map((step, index) => `<li data-progress="${step.id}"><span class="pb-step-number">0${index + 1}</span><span>${step.name}</span></li>`).join('')}</ol></nav>
    </header>
    <p class="pb-notice" role="status" aria-live="polite" hidden></p>

    <section class="pb-start" data-screen="start" aria-labelledby="pb-start-title">
      <h1 id="pb-start-title" tabindex="-1" aria-label="3CE IN FRAME"><span class="pb-cover-brand">3CE<svg class="pb-title-star" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="M50 6v88M6 50h88M19 19l62 62M19 81l62-62" fill="none" stroke="currentColor" stroke-width="11" /></svg></span><span class="pb-cover-name">IN FRAME</span></h1>
      <button class="pb-start-button" data-action="start"><span>TOUCH TO START</span><span class="pb-start-arrow" aria-hidden="true">↗</span></button>
    </section>

    <section class="pb-camera" data-screen="camera" aria-labelledby="pb-camera-title" hidden>
      <h1 id="pb-camera-title" class="pb-sr-only" tabindex="-1">네 컷 촬영</h1>
      <div class="pb-camera-layout">
        <div class="pb-camera-main">
          <div class="pb-live-frame" data-hand-camera><video class="pb-video" muted playsinline aria-label="거울 모드 카메라 미리보기"></video><canvas class="pb-capture-review" hidden aria-hidden="true"></canvas><div class="pb-viewfinder" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="pb-countdown" aria-live="assertive" aria-atomic="true" hidden></div><div class="pb-flash" aria-hidden="true"></div></div>
          <div class="pb-camera-toolbar"><p class="pb-shot-counter" aria-label="현재 촬영 컷"><strong class="pb-current-shot">1</strong><span>/ 4</span></p><button class="pb-link-button" data-action="reset">처음으로</button><strong class="pb-camera-status pb-sr-only" role="status">촬영 준비</strong><button class="pb-button" data-action="cancel-capture" hidden>촬영 중지</button></div>
        </div>
      </div>
    </section>

    <section class="pb-workspace" data-screen="workspace" aria-labelledby="pb-work-title" hidden>
      <h1 id="pb-work-title" class="pb-sr-only" tabindex="-1">프레임 선택</h1>
      <div class="pb-work-layout">
        <div class="pb-preview-panel">
          <div class="pb-preview-surface">
            <div class="pb-printer-slot" aria-hidden="true"><span></span></div>
            <div class="pb-print-viewport"><div class="pb-strip" style="aspect-ratio: ${LAYOUT.width} / ${LAYOUT.height}"><canvas class="pb-result" width="${LAYOUT.width}" height="${LAYOUT.height}" aria-label="네 컷 사진 미리보기"></canvas><div class="pb-sticker-layer" aria-label="스티커 위치 편집"></div></div></div>
          </div>
          <p class="pb-render-status pb-sr-only" role="status" aria-live="polite"></p>
        </div>
        <aside class="pb-tools">
          <div class="pb-tool-panel" data-panel="frame">
            <div class="pb-frame-grid" aria-label="프레임">${FRAMES.map((frame, index) => `<button class="pb-frame-option" data-frame="${frame.id}" aria-pressed="false"><span class="pb-frame-sample"><img src="${assetURL(frame.thumbnail)}" alt="" /></span><span class="pb-frame-label"><small>0${index + 1}</small><strong>${frame.name}</strong></span></button>`).join('')}</div>
            <div class="pb-panel-actions"><button class="pb-link-button" data-action="retake">다시 촬영</button><button class="pb-button pb-primary" data-action="edit">꾸미기 <span aria-hidden="true">↗</span></button></div>
          </div>
          <div class="pb-tool-panel" data-panel="edit" hidden>
            <div class="pb-tabs" role="tablist" aria-label="꾸미기 종류"><button id="pb-filter-tab" role="tab" aria-controls="pb-filter-panel" aria-selected="true" data-tab="filters">FILTER</button><button id="pb-sticker-tab" role="tab" aria-controls="pb-sticker-panel" aria-selected="false" data-tab="stickers" tabindex="-1">STICKER</button></div>
            <div id="pb-filter-panel" role="tabpanel" aria-labelledby="pb-filter-tab"><div class="pb-filter-grid">${FILTERS.map((filter, index) => `<button class="pb-filter-option" data-filter="${filter.id}" aria-pressed="false"><small>0${index + 1}</small><span>${filter.name}</span></button>`).join('')}</div></div>
            <div id="pb-sticker-panel" role="tabpanel" aria-labelledby="pb-sticker-tab" hidden><div class="pb-sticker-grid">${STICKERS.map(sticker => `<button data-add-sticker="${sticker.id}" aria-label="${sticker.name} 스티커 추가"><img src="${assetURL(sticker.thumbnail)}" alt="" /></button>`).join('')}</div></div>
            <div class="pb-sticker-controls" hidden><div class="pb-sticker-controls-heading"><strong class="pb-selected-name">선택한 스티커</strong><button class="pb-link-button" data-action="delete-sticker">삭제 ×</button></div><label>크기<input class="pb-sticker-size" type="range" min="12" max="70" value="24" /><output class="pb-size-value">24%</output></label><label>회전<input class="pb-sticker-rotation" type="range" min="-180" max="180" value="0" /><output class="pb-rotation-value">0°</output></label></div>
            <div class="pb-panel-actions"><button class="pb-link-button" data-action="frame">프레임으로</button><button class="pb-button pb-primary" data-action="save-step">인화하기 <span aria-hidden="true">↓</span></button></div>
          </div>
          <div class="pb-tool-panel pb-save-panel" data-panel="save" hidden>
            <button class="pb-button pb-primary pb-download" data-action="download">사진 저장 <span aria-hidden="true">↓</span></button><button class="pb-button" data-action="reset">다시 시작 <span aria-hidden="true">↗</span></button><button class="pb-link-button pb-edit-again" data-action="edit">다시 꾸미기</button>
          </div>
        </aside>
      </div>
    </section>
  </main>`

function element<T extends HTMLElement>(selector: string) {
  const node = app.querySelector<T>(selector)
  if (!node) throw new Error(`Photo Booth 화면 요소가 없습니다: ${selector}`)
  return node
}
const video = element<HTMLVideoElement>('.pb-video')
const result = element<HTMLCanvasElement>('.pb-result'), review = element<HTMLCanvasElement>('.pb-capture-review')
const strip = element<HTMLDivElement>('.pb-strip'), layer = element<HTMLDivElement>('.pb-sticker-layer')
const countdown = element<HTMLDivElement>('.pb-countdown'), flash = element<HTMLDivElement>('.pb-flash')
const notice = element<HTMLParagraphElement>('.pb-notice')
const renderStatus = element<HTMLParagraphElement>('.pb-render-status')
const sizeInput = element<HTMLInputElement>('.pb-sticker-size'), rotationInput = element<HTMLInputElement>('.pb-sticker-rotation')
const images = new Images(), shutter = new Shutter(), events = new AbortController(), { signal } = events
const delivery = new PrintDelivery(strip, element('.pb-workspace'), shutter)
const state: { step: Step; photos: Photo[]; frameId: string; filterId: string; stickers: Sticker[]; selected: string | null; capturing: boolean; shot: number; saving: boolean } = {
  step: 'start', photos: [], frameId: FRAMES[0]!.id, filterId: FILTERS[0]!.id, stickers: [], selected: null, capturing: false, shot: 1, saving: false,
}
let captureController: AbortController | undefined
let base: HTMLCanvasElement | undefined
let composition = Promise.resolve(), revision = 0, validComposition = false, composing = false
let paintFrame = 0, disposed = false, opening = false, capturedAt = new Date()
let printing = false, deliveryRevision = 0
let noticeDismissal: ReturnType<typeof setTimeout> | undefined
const downloads = new Set<string>()
let drag: { pointer: number; id: string; dx: number; dy: number } | undefined
const frame = () => FRAMES.find(item => item.id === state.frameId)!
const filter = () => FILTERS.find(item => item.id === state.filterId)!
const selectedSticker = () => state.stickers.find(item => item.id === state.selected)
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function message(text = '', duration = 0) {
  clearTimeout(noticeDismissal)
  notice.textContent = text; notice.hidden = !text
  if (text && duration) noticeDismissal = setTimeout(() => message(), duration)
}
function releasePhotos() { state.photos.forEach(photo => { photo.canvas.width = 0; photo.canvas.height = 0 }); state.photos = []; validComposition = false }
function updateCapture() {
  element('.pb-current-shot').textContent = String(state.shot)
  element<HTMLButtonElement>('[data-action="cancel-capture"]').hidden = !state.capturing
  element('.pb-camera-status').textContent = state.capturing ? `${state.shot}번째 컷을 촬영하고 있습니다.` : '준비가 되면 촬영을 시작하세요.'

}
function markChoices() {
  app.querySelectorAll<HTMLButtonElement>('[data-frame]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.frame === state.frameId)))
  app.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === state.filterId)))
  element<HTMLButtonElement>('[data-action="download"]').disabled = composing || !validComposition || state.saving || printing
}
function paint() {
  paintFrame = 0
  if (disposed || !base) return
  paintResult(result, base, state.stickers, images)
  updateStickerPositions()
}
function requestPaint() { if (!paintFrame && !disposed) paintFrame = requestAnimationFrame(paint) }
function rebuild() {
  const token = ++revision, photos = [...state.photos], chosenFrame = frame(), chosenFilter = filter()
  composing = true; validComposition = false
  element('.pb-preview-panel').setAttribute('aria-busy', 'true')
  renderStatus.textContent = '미리보기를 준비하고 있습니다…'
  markChoices()
  composition = (async () => {
    try {
      const prepared = await composeBase(photos, chosenFrame, chosenFilter, images, capturedAt)
      if (disposed || token !== revision) { prepared.width = 0; prepared.height = 0; return }
      if (base) { base.width = 0; base.height = 0 }
      base = prepared
      strip.style.aspectRatio = `${prepared.width} / ${prepared.height}`
      element('.pb-preview-panel').style.setProperty('--pb-film-ratio', String(prepared.width / prepared.height))
      validComposition = true
      paint()
    } catch (error) { if (!disposed && token === revision) message(cameraError(error)) }
    finally {
      if (!disposed && token === revision) {
        composing = false
        renderStatus.textContent = validComposition ? '미리보기와 같은 이미지가 저장됩니다.' : '프레임 또는 필터를 다시 선택해 주세요.'
        element('.pb-preview-panel').setAttribute('aria-busy', 'false')
        markChoices()
      }
    }
  })()
}
function go(step: Step) {
  if (disposed || state.saving) return
  if (['frame', 'edit', 'save'].includes(step) && state.photos.length !== 4) return
  ++deliveryRevision; printing = false; delivery.reset()
  const previousStep = state.step
  if (step !== 'camera') camera.close()
  state.step = step
  element('.pb-app').dataset.step = step
  state.selected = null
  drag = undefined
  app.querySelectorAll<HTMLElement>('[data-screen]').forEach(screen => { screen.hidden = screen.dataset.screen !== (['frame', 'edit', 'save'].includes(step) ? 'workspace' : step) })
  app.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== step })
  const index = steps.findIndex(item => item.id === step)
  app.querySelectorAll<HTMLElement>('[data-progress]').forEach((item, i) => {
    item.classList.toggle('is-done', i < index)
    if (i === index) item.setAttribute('aria-current', 'step')
    else item.removeAttribute('aria-current')
  })
  const workspace = ['frame', 'edit', 'save'].includes(step)
  if (workspace) {
    element('.pb-workspace').dataset.mode = step
    element('#pb-work-title').textContent = step === 'frame' ? '프레임 선택' : step === 'edit' ? '사진 꾸미기' : '완성된 사진'
    layer.classList.toggle('is-editing', step === 'edit')
    layer.hidden = step === 'save'
    renderHitboxes()
    if ((!base || !validComposition) && !composing) rebuild()
    else requestPaint()
  }
  if (previousStep !== step) {
    const screen = element<HTMLElement>(`[data-screen="${workspace ? 'workspace' : step}"]`)
    screen.classList.remove('pb-stage-enter'); void screen.offsetWidth; screen.classList.add('pb-stage-enter')
    if (workspace && step !== 'save') shutter.film()
  }
  if (step === 'save') void printFilm()
  updateCapture(); markChoices(); updateStickerControls()
  const heading = step === 'start' ? element('#pb-start-title') : step === 'camera' ? element('#pb-camera-title') : element('#pb-work-title')
  heading.focus({ preventScroll: true })
  window.scrollTo({ top: 0, behavior: 'instant' })
}
async function printFilm() {
  const token = ++deliveryRevision
  printing = true; delivery.prepare(); markChoices()
  try {
    await composition
    if (disposed || state.step !== 'save' || token !== deliveryRevision) return
    if (!base || !validComposition) { delivery.reset(); return }
    paint()
    renderStatus.textContent = '사진을 인화하고 있습니다.'
    await delivery.feed()
    if (!disposed && state.step === 'save' && token === deliveryRevision) renderStatus.textContent = '사진이 완성되었습니다. 저장할 수 있습니다.'
  } catch {
    // A presentation failure must not prevent keeping the composed photograph.
    if (!disposed && token === deliveryRevision) { delivery.reset(); renderStatus.textContent = '사진을 저장할 수 있습니다.' }
  } finally {
    if (!disposed && token === deliveryRevision) { printing = false; markChoices() }
  }
}
const camera = new BoothCamera(video, () => {
  captureController?.abort()
  state.capturing = false
  message('카메라 연결이 해제되었습니다. 연결 상태를 확인하고 다시 시작해 주세요.')
  camera.close()
  go('start')
})

async function startCapture() {
  if (disposed || opening || captureController || state.saving) return
  opening = true; message('카메라를 연결하고 있습니다. 브라우저에서 카메라 접근을 허용해 주세요.'); shutter.unlock()
  const start = element<HTMLButtonElement>('[data-action="start"]')
  start.disabled = true; start.textContent = '카메라 연결 중…'
  app.querySelectorAll<HTMLButtonElement>('[data-action="retake"]').forEach(button => { button.disabled = true })
  try {
    await camera.open()
    if (disposed) return
    message()
    element('.pb-live-frame').style.aspectRatio = `${video.videoWidth || 16} / ${video.videoHeight || 9}`
    state.shot = 1
    go('camera')
  } catch (error) {
    if (!disposed && !(error instanceof DOMException && error.name === 'AbortError')) message(cameraError(error))
    return
  }
  finally {
    opening = false
    if (!disposed) {
      start.disabled = false; start.innerHTML = '<span>TOUCH TO START</span><span class="pb-start-arrow" aria-hidden="true">↗</span>'
      app.querySelectorAll<HTMLButtonElement>('[data-action="retake"]').forEach(button => { button.disabled = false })
    }
  }
  await takeFour()
}
async function takeFour() {
  if (state.capturing || opening || state.step !== 'camera') return
  const controller = new AbortController()
  captureController = controller
  state.capturing = true; releasePhotos(); capturedAt = new Date()
  ++revision; validComposition = false; composing = false
  updateCapture()
  try {
    for (let i = 0; i < 4; i++) {
      state.shot = i + 1; updateCapture()
      review.hidden = true; countdown.hidden = false
      for (let count = 3; count >= 1; count--) {
        countdown.textContent = String(count)
        countdown.classList.remove('is-ticking'); void countdown.offsetWidth; countdown.classList.add('is-ticking')
        await wait(1000, controller.signal)
      }
      countdown.hidden = true
      const photo = capturePhoto(video)
      state.photos.push(photo)
      shutter.play()
      flash.classList.remove('is-flashing'); void flash.offsetWidth; flash.classList.add('is-flashing')
      review.width = photo.canvas.width; review.height = photo.canvas.height
      context(review).drawImage(photo.canvas, 0, 0)
      review.hidden = false
      updateCapture()
      element('.pb-camera-status').textContent = `${i + 1} / 4 촬영 완료`
      await wait(750, controller.signal)
    }
  } catch (error) {
    if (!disposed && !(error instanceof DOMException && error.name === 'AbortError')) message(cameraError(error))
  } finally {
    if (captureController === controller) {
      captureController = undefined; state.capturing = false
      countdown.hidden = true; review.hidden = true
      countdown.classList.remove('is-ticking')
      flash.classList.remove('is-flashing')
      if (!disposed && state.step === 'camera') {
        if (state.photos.length === 4) {
          go('frame')
        } else {
          releasePhotos()
          state.shot = 1
          go('start')
        }
      }
    }
  }
}

function updateStickerControls() {
  const selected = selectedSticker(), controls = element('.pb-sticker-controls')
  controls.hidden = !selected || state.step !== 'edit'
  if (!selected) return
  element('.pb-selected-name').textContent = STICKERS.find(item => item.id === selected.assetId)!.name
  sizeInput.value = String(Math.round(selected.width * 100)); rotationInput.value = String(Math.round(selected.rotation))
  element('.pb-size-value').textContent = `${sizeInput.value}%`
  element('.pb-rotation-value').textContent = `${rotationInput.value}°`
}
function updateStickerPositions() {
  const layout = layoutOf(frame())
  layer.querySelectorAll<HTMLButtonElement>('[data-sticker]').forEach(button => {
    const sticker = state.stickers.find(item => item.id === button.dataset.sticker)
    if (!sticker) return
    button.style.left = `${sticker.x * 100}%`; button.style.top = `${sticker.y * 100}%`
    button.style.width = `${sticker.width * 100}%`
    button.style.height = `${sticker.width * layout.width / layout.height / stickerAspect(sticker, images) * 100}%`
    button.style.transform = `translate(-50%, -50%) rotate(${sticker.rotation}deg)`
    button.classList.toggle('is-selected', sticker.id === state.selected)
    button.tabIndex = state.step === 'edit' ? 0 : -1
    button.disabled = state.step !== 'edit'
  })
}
function renderHitboxes() {
  layer.replaceChildren()
  for (const sticker of state.stickers) {
    const button = document.createElement('button')
    button.type = 'button'; button.className = 'pb-sticker-hit'; button.dataset.sticker = sticker.id
    button.setAttribute('aria-label', `${STICKERS.find(item => item.id === sticker.assetId)!.name} 스티커. 드래그 또는 방향키로 이동, Delete로 삭제`)
    layer.append(button)
  }
  updateStickerPositions()
}
function selectSticker(id: string | null) { state.selected = id; updateStickerPositions(); updateStickerControls() }
async function addSticker(id: string) {
  if (state.step !== 'edit') return
  const asset = STICKERS.find(item => item.id === id)
  if (!asset) return
  try {
    await images.load(asset.image)
    if (disposed || state.step !== 'edit') return
    const sticker: Sticker = { id: crypto.randomUUID(), assetId: id, x: .5 + (state.stickers.length % 3 - 1) * .05, y: .38 + state.stickers.length % 4 * .07, width: asset.width, rotation: 0 }
    state.stickers.push(sticker); state.selected = sticker.id
    renderHitboxes(); updateStickerControls(); markChoices(); requestPaint()
  } catch (error) { message(cameraError(error)) }
}
function deleteSticker() {
  if (!state.selected) return
  state.stickers = state.stickers.filter(item => item.id !== state.selected)
  selectSticker(null); renderHitboxes(); markChoices(); requestPaint()
}
function switchTab(tab: 'filters' | 'stickers') {
  for (const name of ['filters', 'stickers']) {
    const button = element<HTMLButtonElement>(`[data-tab="${name}"]`), selected = name === tab
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1
  }
  element('#pb-filter-panel').hidden = tab !== 'filters'; element('#pb-sticker-panel').hidden = tab !== 'stickers'
}
function reset() {
  if (state.saving) return
  captureController?.abort(); camera.close(); releasePhotos()
  ++revision; validComposition = false; composing = false
  if (base) { base.width = 0; base.height = 0; base = undefined }
  result.width = 1; result.height = 1; review.width = 1; review.height = 1
  state.frameId = FRAMES[0]!.id; state.filterId = FILTERS[0]!.id; state.stickers = []; state.selected = null; state.capturing = false; state.shot = 1
  message(); renderHitboxes(); go('start')
}
async function save() {
  if (state.saving || printing || state.step !== 'save') return
  state.saving = true; markChoices(); message()
  const button = element<HTMLButtonElement>('[data-action="download"]')
  button.textContent = '저장 중…'
  try {
    await composition
    if (disposed) return
    if (!base || !validComposition) throw new Error('미리보기를 준비한 뒤 다시 저장해 주세요.')
    const output = makeCanvas(base.width, base.height)
    paintResult(output, base, state.stickers, images)
    const blob = await asPNG(output)
    output.width = 0; output.height = 0
    if (disposed) return
    const url = URL.createObjectURL(blob); downloads.add(url)
    const link = document.createElement('a'), now = new Date()
    const stamp = [now.getFullYear(), ...[now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()].map(n => String(n).padStart(2, '0'))].join('')
    link.href = url; link.download = `photo-booth-${stamp}.png`
    document.body.append(link); link.click(); link.remove()
    setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url) }, 20000)
    message('사진이 저장되었습니다.', 2400)
  } catch (error) { if (!disposed) message(cameraError(error)) }
  finally { state.saving = false; if (!disposed) { button.innerHTML = '사진 저장 <span aria-hidden="true">↓</span>'; markChoices() } }
}

app.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
  if (!target || target.disabled || state.saving || opening) return
  if (event.detail === 0 && target.dataset.sticker && state.step === 'edit') {
    selectSticker(target.dataset.sticker)
    return
  }
  if (target.dataset.frame) { shutter.film(); state.frameId = target.dataset.frame; message(); rebuild(); return }
  if (target.dataset.filter) { state.filterId = target.dataset.filter; message(); rebuild(); return }
  if (target.dataset.addSticker) { void addSticker(target.dataset.addSticker); return }
  if (target.dataset.tab) { switchTab(target.dataset.tab as 'filters' | 'stickers'); return }
  switch (target.dataset.action) {
    case 'start': if (state.step === 'start') void startCapture(); break
    case 'retake': if (state.step === 'frame') void startCapture(); break
    case 'cancel-capture': captureController?.abort(); break
    case 'reset': reset(); break
    case 'frame': go('frame'); break
    case 'edit': go('edit'); break
    case 'save-step': shutter.unlock(); go('save'); break
    case 'download': void save(); break
    case 'delete-sticker': deleteSticker(); break
  }
}, { signal })
layer.addEventListener('pointerdown', event => {
  if (state.step !== 'edit') return
  const hit = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-sticker]')
  if (!hit) return
  const sticker = state.stickers.find(item => item.id === hit.dataset.sticker)
  if (!sticker) return
  event.preventDefault(); selectSticker(sticker.id); hit.focus({ preventScroll: true })
  const rect = result.getBoundingClientRect()
  drag = { pointer: event.pointerId, id: sticker.id, dx: (event.clientX - rect.left) / rect.width - sticker.x, dy: (event.clientY - rect.top) / rect.height - sticker.y }
  hit.setPointerCapture(event.pointerId)
}, { signal })
layer.addEventListener('pointermove', event => {
  if (!drag || drag.pointer !== event.pointerId) return
  const sticker = state.stickers.find(item => item.id === drag!.id)
  if (!sticker) return
  const rect = result.getBoundingClientRect()
  sticker.x = clamp((event.clientX - rect.left) / rect.width - drag.dx, .02, .98)
  sticker.y = clamp((event.clientY - rect.top) / rect.height - drag.dy, .02, .98)
  updateStickerPositions(); requestPaint()
}, { signal })
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) layer.addEventListener(name, () => { drag = undefined }, { signal })
result.addEventListener('pointerdown', () => { if (state.step === 'edit') selectSticker(null) }, { signal })
sizeInput.addEventListener('input', () => { const selected = selectedSticker(); if (selected) { selected.width = Number(sizeInput.value) / 100; updateStickerControls(); updateStickerPositions(); requestPaint() } }, { signal })
rotationInput.addEventListener('input', () => { const selected = selectedSticker(); if (selected) { selected.rotation = Number(rotationInput.value); updateStickerControls(); updateStickerPositions(); requestPaint() } }, { signal })
app.addEventListener('keydown', event => {
  const target = event.target as HTMLElement
  if (target.closest('[data-tab]') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault(); const tab = target.dataset.tab === 'filters' ? 'stickers' : 'filters'
    switchTab(tab); element<HTMLButtonElement>(`[data-tab="${tab}"]`).focus(); return
  }
  if (state.step !== 'edit' || !state.selected || target.closest('input, select, textarea')) return
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSticker(); return }
  if (event.key === 'Escape') { selectSticker(null); return }
  const selected = selectedSticker()
  if (!selected || !target.closest('[data-sticker]') || !event.key.startsWith('Arrow')) return
  event.preventDefault()
  const amount = event.shiftKey ? .03 : .007
  if (event.key === 'ArrowLeft') selected.x = clamp(selected.x - amount, .02, .98)
  if (event.key === 'ArrowRight') selected.x = clamp(selected.x + amount, .02, .98)
  if (event.key === 'ArrowUp') selected.y = clamp(selected.y - amount, .02, .98)
  if (event.key === 'ArrowDown') selected.y = clamp(selected.y + amount, .02, .98)
  updateStickerPositions(); requestPaint()
}, { signal })
function dispose() {
  if (disposed) return
  disposed = true; ++revision
  ++deliveryRevision; delivery.reset()
  clearTimeout(noticeDismissal)
  captureController?.abort(); events.abort(); camera.close(); shutter.close()
  cancelAnimationFrame(paintFrame); releasePhotos(); images.clear()
  if (base) { base.width = 0; base.height = 0 }
  result.width = 1; result.height = 1; review.width = 1; review.height = 1
  for (const url of downloads) URL.revokeObjectURL(url)
}
connectDesktop('.pb-back', { dispose })
window.addEventListener('pagehide', dispose, { once: true })
window.addEventListener('pageshow', event => { if (event.persisted && disposed) location.reload() })
if (import.meta.hot) import.meta.hot.dispose(dispose)
go('start')
