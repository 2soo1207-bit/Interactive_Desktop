import './style.css'
import { PillowGame } from './physics.ts'
import { PillowDemo } from './demo.ts'
import { PillowScene } from './scene.ts'
import { PillowHandInput } from './hand-input.ts'
import type { PillowHandStatus } from './hand-input.ts'
import { SHADES, DESIGN } from './shades.ts'
import { readCollection, collectShade, shuffledShades } from './collection.ts'
import { PillowShowroom } from './showroom.ts'
import { PillowSound } from './sound.ts'
import { appVisible, connectDesktop } from '../shared/desktop-host.ts'

document.title = 'Pillow TOWER — 3CE'
document.documentElement.classList.add('pillow-page')
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#d6d1cd')
const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <main class="pt-app" data-mode="intro">
    <div class="pt-backdrop" aria-hidden="true" style="background-image:url('${DESIGN.background}')"></div>
    <header class="pt-header">
      <a class="pt-back" href="../../index.html" aria-label="데스크톱으로 돌아가기">↖</a>
      <span class="pt-brand" aria-label="3CE">3CE<span>STYLENANDA</span></span>
      <button class="pt-collection-button" type="button">THE SHADES <span data-total>00 / 13</span></button>
    </header>
    <div class="pt-editorial">
      <h1><em>Pillow</em><strong>TOWER</strong></h1>
      <p>13 SHADES.<br>ONE SOFT LANDING.</p>
    </div>
    <div class="pt-stage">
      <canvas class="pt-canvas" aria-label="자동으로 움직이는 쿠션을 클릭, 터치 또는 스페이스 키로 떨어뜨리세요." tabindex="0"></canvas>
      <div class="pt-ground" aria-hidden="true"></div>
    </div>
    <img class="pt-cat" src="${DESIGN.cat}" alt="" aria-hidden="true">
    <div class="pt-score" hidden><span data-score>00</span><span class="pt-score-outof">/ 13</span></div>
    <section class="pt-start" aria-label="게임 시작">
      <button class="pt-primary arcade-primary" data-start type="button" disabled><span data-start-label>LOADING 00%</span><span aria-hidden="true">↗</span></button>
      <p>원하는 위치에서 클릭 · 터치 · 주먹 쥐기<br>쿠션을 떨어뜨려 13층을 쌓아보세요.</p>
      <p class="pt-load-error" role="alert" hidden></p>
    </section>
    <p class="pt-play-hint" hidden>클릭 · 터치 · 주먹 쥐기 → DROP</p>
    <div class="pt-toast" role="status" aria-live="polite"><strong></strong><span></span></div>
    <section class="pt-result" aria-labelledby="pt-result-title" hidden>
      <p class="pt-eyebrow" data-result-kicker>YOUR SOFT LANDING</p>
      <h2 id="pt-result-title">One more?</h2>
      <p class="pt-result-score"><b data-result-score>0</b><span>/ 13</span></p>
      <p class="pt-result-caption">이번에 만난 쉐이드</p>
      <ul class="pt-run-shades"></ul>
      <p class="pt-total-line">COLLECTED <span data-total>00 / 13</span></p>
      <p class="pt-save-note" hidden>브라우저 저장 공간을 사용할 수 없어 이번 방문 동안만 컬렉션이 유지됩니다.</p>
      <button class="pt-primary arcade-primary" data-restart type="button"><span>PLAY AGAIN</span><span aria-hidden="true">↗</span></button>
    </section>
    <aside class="pt-camera" data-camera="off" data-hand-camera aria-label="손동작 카메라">
      <div class="pt-camera-picture"><video muted playsinline></video><span class="pt-camera-state">CAM OFF</span></div>
      <button class="pt-camera-toggle" type="button" aria-label="손동작 카메라 켜기">HAND CAM <span>＋</span></button>
      <p class="pt-camera-error" role="status" hidden></p>
    </aside>
    <footer class="pt-footer">3CE LIP PILLOW <span>SOFT TOUCH, HIGH GLOSS.</span></footer>
    <dialog class="pt-collection" aria-labelledby="pt-collection-title">
      <header><div><p class="pt-eyebrow">YOUR COLLECTION</p><h2 id="pt-collection-title">The shades.</h2></div><button class="pt-close" type="button" aria-label="컬렉션 닫기">×</button></header>
      <p class="pt-collection-count"><span data-total>00 / 13</span> COLLECTED</p>
      <ul class="pt-all-shades"></ul>
    </dialog>
  </main>`

const select = <T extends Element>(query: string) => app.querySelector<T>(query)!
const root = select<HTMLElement>('.pt-app')
const stage = select<HTMLDivElement>('.pt-stage')
const canvas = select<HTMLCanvasElement>('.pt-canvas')
const startButton = select<HTMLButtonElement>('[data-start]')
const startLabel = select<HTMLElement>('[data-start-label]')
const result = select<HTMLElement>('.pt-result')
const collectionDialog = select<HTMLDialogElement>('.pt-collection')
const camera = select<HTMLElement>('.pt-camera')
const cameraToggle = select<HTMLButtonElement>('.pt-camera-toggle')
const cameraState = select<HTMLElement>('.pt-camera-state')
const cameraError = select<HTMLElement>('.pt-camera-error')
const toast = select<HTMLElement>('.pt-toast')
let storage: Storage | null = null
try { storage = window.localStorage } catch { /* Private browser settings: play still works. */ }
let collection = storage ? readCollection(storage) : new Set<number>()
let saved = Boolean(storage)
let game = new PillowGame(shuffledShades(), performance.now())
const demo = new PillowDemo(performance.now())
let scene: PillowScene | null = null
let handStatus: PillowHandStatus = 'off'
let started = false, finished = false, disposed = false, frame = 0
let toastUntil = 0, toastPerfectUntil = 0, lastFrame = 0
let contextLost = false
const runShades: number[] = []
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const showroom = new PillowShowroom(root)
const sound = new PillowSound()

const hands = new PillowHandInput(select<HTMLVideoElement>('.pt-camera video'), {
  onDrop: time => {
    if (started && !finished && !collectionDialog.open && !document.hidden && !contextLost && game.drop(time)) {
      sound.play('drop')
    }
  },
  onStatus: (status, message) => {
    handStatus = status; camera.dataset.camera = status
    cameraState.textContent = { off: 'HAND CAM을 켜고 주먹으로 DROP', loading: '카메라 연결 중', ready: '주먹을 쥐면 DROP · 손을 펴면 다시 준비', fist: 'FIST — 손을 펴서 다음 쿠션 준비', error: '클릭이나 터치로 계속 플레이하세요' }[status]
    cameraToggle.innerHTML = `HAND CAM <span>${['off', 'error'].includes(status) ? '＋' : '−'}</span>`
    cameraToggle.setAttribute('aria-label', ['off', 'error'].includes(status) ? '손동작 카메라 켜기' : '손동작 카메라 끄기')
    cameraError.hidden = status !== 'error'
    cameraError.textContent = status === 'error' ? message ?? '카메라에 연결할 수 없습니다. 클릭으로 계속 플레이할 수 있습니다.' : ''
  },
})

function updateCollection() {
  app.querySelectorAll<HTMLElement>('[data-total]').forEach(el => { el.textContent = `${String(collection.size).padStart(2, '0')} / 13` })
  select<HTMLElement>('.pt-all-shades').innerHTML = SHADES.map(shade => `
    <li class="${collection.has(shade.id) ? 'is-collected' : ''}">
      ${cushionPreview(shade.id, 90, 80)}
      <span class="pt-shade-number">${String(shade.id).padStart(2, '0')}</span><strong>${shade.name}</strong>
      <small>${collection.has(shade.id) ? 'COLLECTED' : '아직 만나지 못한 컬러'}</small>
    </li>`).join('')
}
function cushionPreview(id: number, width: number, height: number) {
  const image = scene?.getPreview(id)
  return image ? `<img src="${image}" alt="" width="${width}" height="${height}">` : ''
}
updateCollection()

function notifyLanding(shadeId: number, perfect: boolean, now: number) {
  const shade = SHADES[shadeId]
  toast.classList.toggle('is-perfect', perfect)
  select<HTMLElement>('.pt-toast strong').textContent = perfect ? 'PERFECT!' : ''
  select<HTMLElement>('.pt-toast span').textContent = `${String(shade.id).padStart(2, '0')} — ${shade.name}`
  toastUntil = now + 1600
  if (perfect) toastPerfectUntil = now + 1000
  toast.classList.add('is-visible')
}

function begin() {
  sound.unlock()
  if (startButton.disabled || !scene || contextLost) return
  showroom.hide()
  game = new PillowGame(shuffledShades(), performance.now()); runShades.length = 0
  started = true; finished = false; game.start(performance.now())
  root.dataset.mode = 'playing'
  select<HTMLElement>('.pt-start').hidden = true
  select<HTMLElement>('.pt-score').hidden = false
  select<HTMLElement>('[data-score]').textContent = '00'
  select<HTMLElement>('.pt-play-hint').hidden = false
  result.hidden = true; toast.classList.remove('is-visible')
  canvas.focus({ preventScroll: true })
}

function showResult() {
  if (finished) return
  finished = true
  game.pause(performance.now())
  const won = game.phase === 'won'
  root.dataset.mode = 'result'
  select<HTMLElement>('.pt-score').hidden = true
  select<HTMLElement>('.pt-play-hint').hidden = true
  select<HTMLElement>('[data-result-kicker]').textContent = won ? 'THIRTEEN SHADES. ALL YOURS.' : 'A SOFT LANDING'
  select<HTMLElement>('#pt-result-title').textContent = won ? 'Dream tower.' : 'One more?'
  select<HTMLElement>('[data-result-score]').textContent = String(game.score).padStart(2, '0')
  select<HTMLElement>('.pt-run-shades').innerHTML = runShades.length ? runShades.map(id => {
    const shade = SHADES[id]
    return `<li>${cushionPreview(id, 60, 54)}<span>${shade.name}</span></li>`
  }).join('') : '<li class="pt-empty-run">첫 번째 컬러를 만나볼까요?</li>'
  select<HTMLElement>('.pt-save-note').hidden = saved
  toast.classList.remove('is-visible')
  result.hidden = false
  showroom.show(runShades.at(-1) ?? 0)
  select<HTMLButtonElement>('[data-restart]').focus({ preventScroll: true })
}

startButton.addEventListener('click', () => { begin(); if (handStatus === 'off') void hands.start() })
select<HTMLButtonElement>('[data-restart]').addEventListener('click', begin)
cameraToggle.addEventListener('click', () => {
  if (['off', 'error'].includes(handStatus)) void hands.start()
  else hands.stop()
})

function drop() {
  if (!started || finished || contextLost || collectionDialog.open || document.hidden) return
  // Bring history up to the exact input moment; pointer and gesture use one API.
  game.step(performance.now())
  if (game.drop()) sound.play('drop')
}
canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
  event.preventDefault(); canvas.focus({ preventScroll: true }); drop()
})
const onKey = (event: KeyboardEvent) => {
  if (event.repeat || event.code !== 'Space' || collectionDialog.open || event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) return
  event.preventDefault(); drop()
}
window.addEventListener('keydown', onKey)

function pauseState() {
  const now = performance.now()
  if (document.hidden || !appVisible() || collectionDialog.open || contextLost || finished) { game.pause(now); demo.pause(now) }
  else { game.resume(now); demo.resume(now) }
}
select<HTMLButtonElement>('.pt-collection-button').addEventListener('click', () => {
  if (storage) { collection = new Set([...collection, ...readCollection(storage)]); updateCollection() }
  collectionDialog.showModal(); pauseState()
})
select<HTMLButtonElement>('.pt-close').addEventListener('click', () => collectionDialog.close())
collectionDialog.addEventListener('close', pauseState)
collectionDialog.addEventListener('click', event => { if (event.target === collectionDialog) {
  const rect = collectionDialog.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) collectionDialog.close()
} })
document.addEventListener('visibilitychange', pauseState)

const errorLabel = select<HTMLElement>('.pt-load-error')
function loadingError(error: unknown) {
  console.error('[Pillow TOWER] 제품 렌더링 오류:', error)
  errorLabel.hidden = false
  errorLabel.textContent = '제품 화면을 불러오지 못했습니다. 네트워크와 브라우저의 그래픽 가속을 확인한 뒤 새로고침해 주세요.'
  startLabel.textContent = 'RELOAD'
  startButton.disabled = false
  // One explicit retry rather than a hidden replacement product.
  startButton.addEventListener('click', () => window.location.reload(), { once: true })
}
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); contextLost = true; pauseState()
  select<HTMLElement>('.pt-start').hidden = false
  loadingError(new Error('WebGL context lost'))
})

const resize = new ResizeObserver(entries => {
  const box = entries[0]?.contentRect
  if (box) scene?.resize(box.width, box.height)
})
resize.observe(stage)

function tick(now: number) {
  if (disposed) return
  frame = requestAnimationFrame(tick)
  if (document.hidden || !appVisible()) return
  if (!collectionDialog.open && !contextLost) {
    game.step(now)
    if (!finished) hands.update(now)
    if (!started && !reducedMotion) demo.step(now)
    for (const event of game.drainEvents()) {
      sound.play(event.type)
      if (event.type === 'land' && event.shade !== undefined) {
        runShades.push(event.shade)
        if (storage) saved = collectShade(storage, collection, event.shade)
        else collection.add(event.shade)
        updateCollection()
        select<HTMLElement>('[data-score]').textContent = String(event.score).padStart(2, '0')
        select<HTMLElement>('.pt-play-hint').hidden = true
        notifyLanding(event.shade, false, now)
      }
      if (event.type === 'perfect' && event.shade !== undefined) notifyLanding(event.shade, true, now)
    }
    if (game.phase === 'lost' || game.phase === 'won') showResult()
  }
  if (now > toastUntil) toast.classList.remove('is-visible')
  if (now > toastPerfectUntil) select<HTMLElement>('.pt-toast strong').textContent = ''
  // Gameplay stays responsive; the idle cover renders at 30fps.
  if (!finished && (started || now - lastFrame >= 32)) {
    const visibleGame = started ? game : demo.game
    scene?.render(visibleGame.bodies, visibleGame.active, now,
      !started ? 'intro' : game.phase === 'won' && !reducedMotion ? 'won' : 'game', started ? 1 : demo.scale)
    lastFrame = now
  }
}

try {
  scene = new PillowScene(canvas)
  scene.resize(stage.clientWidth, stage.clientHeight)
  void scene.load((loaded, total) => {
    startLabel.textContent = `LOADING ${String(Math.round(loaded / total * 100)).padStart(2, '0')}%`
  }).then(() => {
    if (disposed) return
    demo.reset(performance.now())
    if (reducedMotion) demo.still(performance.now())
    updateCollection()
    startLabel.textContent = 'LET’S STACK'; startButton.disabled = false
  }).catch(loadingError)
  frame = requestAnimationFrame(tick)
} catch (error) { loadingError(error) }

const cleanup = () => {
  if (disposed) return
  disposed = true; cancelAnimationFrame(frame); resize.disconnect(); hands.dispose(); scene?.dispose(); showroom.dispose()
  sound.close()
  document.removeEventListener('visibilitychange', pauseState); window.removeEventListener('keydown', onKey)
}
connectDesktop('.pt-back', { dispose: cleanup, visibilityChanged: pauseState })
window.addEventListener('pagehide', cleanup, { once: true })
// A cached history entry must recreate camera/WebGL resources after pagehide.
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload() })
if (import.meta.hot) import.meta.hot.dispose(cleanup)
