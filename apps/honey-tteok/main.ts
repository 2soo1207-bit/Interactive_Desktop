import './style.css'
import { uiFont } from '../shared/typography'
import { resumeAudio } from '../shared/audio'
import { requestCamera } from '../shared/camera-access'
import { appVisible, connectDesktop, openAppAudio } from '../shared/desktop-host'
import { COLOR_IDS, COLOR_SPECS, NICKNAME_LIMIT, RANKING_LIMIT, RULES } from './config'
import type { TteokColor } from './config'
import { HoneyTteokGame } from './engine'
import type { BiteEvent, MouthSample, Piece } from './engine'
import { FaceInput } from './face'
import { browserRanking } from './ranking'
import type { ScoreRecord } from './ranking'
import { createTteokArtwork, TTEOK_VARIANTS } from './tteok-art'

const app = document.querySelector<HTMLElement>('#app')!
app.innerHTML = `
  <section class="select-screen" aria-labelledby="game-title">
    <div class="intro">
      <h1 id="game-title" lang="en">Honey<br> Tteok<span>.</span></h1>
      <p>색을 고르고, 꿀떡이 입에 걸쳤을 때 입을 다무세요.</p>
      <div class="rule-line">
        <span>${RULES.durationMs / 1000}초</span>
        <span>목표 +${RULES.targetPoints}</span>
        <span>다른 색 ${RULES.wrongPoints}</span>
        <span>${RULES.comboThreshold}연속 ×${RULES.comboMultiplier}</span>
      </div>
    </div>
    <div class="selector">
      <h2>꿀떡 고르기</h2>
      <div class="flavors" role="group" aria-label="꿀떡 색상">
        ${COLOR_IDS.map((id) => `
          <button class="flavor" type="button" data-color="${id}" aria-pressed="false" style="--shade:${COLOR_SPECS[id].hex}">
            <span class="flavor-media">
              <span class="tteok-preview" aria-hidden="true"></span>
              <span class="product-preview" aria-hidden="true"></span>
            </span>
            <span class="flavor-name"><i aria-hidden="true"></i>${COLOR_SPECS[id].label}</span>
          </button>`).join('')}
      </div>
      <button class="arcade-primary start" type="button" disabled>게임 시작 <span aria-hidden="true">↗</span></button>
    </div>
  </section>

  <section class="arena" aria-label="게임 화면" hidden>
    <div class="playfield" data-hand-camera>
      <video autoplay muted playsinline aria-hidden="true"></video>
      <canvas aria-hidden="true"></canvas>
    </div>
    <div class="hud" hidden>
      <div class="score-panel"><span><i class="target-color" aria-hidden="true"></i>SCORE</span><strong data-score>0</strong></div>
      <div class="combo-panel"><span>COMBO</span><strong data-combo>0</strong></div>
      <div class="timer-panel"><span>TIME</span><strong data-timer>00:45</strong></div>
    </div>
    <div class="frenzy" role="status" hidden>폭탄 타임</div>
    <p class="tracking" role="status" hidden>얼굴을 카메라 중앙에 표시해 주세요.</p>
    <div class="arena-status" role="group" aria-label="카메라 상태">
      <div>
        <p class="camera-message" role="status"></p>
        <button class="secondary cancel" type="button">색상 선택으로 돌아가기</button>
      </div>
    </div>
  </section>

  <section class="results" aria-labelledby="results-title" hidden>
    <div class="round-result">
      <div class="result-details">
        <h2 id="results-title" lang="en">Final score</h2>
        <strong class="total" data-total>0</strong>
        <form class="save-score">
          <label for="player-name">닉네임</label>
          <div>
            <input id="player-name" name="nickname" placeholder="닉네임 입력" autocomplete="nickname" maxlength="${NICKNAME_LIMIT}" required>
            <button class="arcade-primary save" type="submit">기록 저장</button>
          </div>
          <p class="save-status" role="status"></p>
        </form>
        <button class="secondary replay" type="button">다시 플레이하기 <span aria-hidden="true">↗</span></button>
      </div>
      <figure class="result-product">
        <div class="result-packshot"></div>
        <figcaption></figcaption>
      </figure>
    </div>
    <aside class="leaderboard" aria-labelledby="ranking-title">
      <h2 id="ranking-title">TOP ${RANKING_LIMIT}</h2>
      <p>이 브라우저에 저장된 기록</p>
      <p class="ranking-status" role="status"></p>
      <ol></ol>
    </aside>
  </section>
`

const find = <T extends HTMLElement>(selector: string) => app.querySelector<T>(selector)!
const selector = find('.select-screen')
const arena = find('.arena')
const results = find('.results')
const playfield = find('.playfield')
const video = find<HTMLVideoElement>('video')
const canvas = find<HTMLCanvasElement>('canvas')
const ctx = canvas.getContext('2d')
const hud = find('.hud')
const frenzy = find('.frenzy')
const tracking = find('.tracking')
const overlay = find('.arena-status')
const cameraMessage = find('.camera-message')
const score = find('[data-score]')
const combo = find('[data-combo]')
const timer = find('[data-timer]')
const startButton = find<HTMLButtonElement>('.start')
const buttons = app.querySelectorAll<HTMLButtonElement>('[data-color]')
const ranking = browserRanking()
const scoreFormat = new Intl.NumberFormat('ko-KR')
const saveForm = find<HTMLFormElement>('.save-score')
const nickname = find<HTMLInputElement>('#player-name')
const saveButton = find<HTMLButtonElement>('.save')
const saveStatus = find('.save-status')
const rankingStatus = find('.ranking-status')
const rankingList = find('.leaderboard ol')
const life = new AbortController()
const events = { signal: life.signal }
const sprites = new Map<TteokColor, HTMLCanvasElement[]>()
const customSprites = new Map<TteokColor, HTMLImageElement>()
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
let chosen: TteokColor | undefined
let stream: MediaStream | undefined
let controller: AbortController | undefined
let face: FaceInput | undefined
let game: HoneyTteokGame | undefined
let output: ReturnType<typeof openAppAudio>
let frame = 0
let priorTime: number | undefined
let mouth: MouthSample | null = null
let effects: { bite: BiteEvent; x: number; y: number; time: number }[] = []
let finalResult: { id: string; color: TteokColor; score: number } | undefined

function publicUrl(path: string) {
  return new URL(`../../${path}`, location.href).href
}

function product(slot: HTMLElement, color: TteokColor) {
  const spec = COLOR_SPECS[color]
  slot.style.setProperty('--shade', spec.hex)
  const placeholder = document.createElement('span')
  placeholder.className = 'packshot-placeholder'
  placeholder.textContent = '제품 이미지'
  slot.replaceChildren(placeholder)
  if (!spec.productImage) return
  const image = new Image()
  image.alt = `${spec.label} 립 제품`
  image.addEventListener('load', () => slot.replaceChildren(image), { once: true, ...events })
  image.src = publicUrl(spec.productImage)
}

function loadArtwork() {
  const colors = COLOR_IDS.map((id) => COLOR_SPECS[id].hex)
  const art = createTteokArtwork(colors)
  for (const button of buttons) {
    const id = button.dataset.color as TteokColor
    const spec = COLOR_SPECS[id]
    const slot = button.querySelector<HTMLElement>('.tteok-preview')!
    const sprite = art.get(spec.hex)
    if (sprite) {
      sprites.set(id, [sprite])
      slot.replaceChildren(sprite)
    }
    if (spec.tteokImage) {
      const image = new Image()
      image.alt = ''
      image.addEventListener('load', () => {
        customSprites.set(id, image)
        slot.replaceChildren(image)
      }, { once: true, ...events })
      image.src = publicUrl(spec.tteokImage)
    }
    product(button.querySelector<HTMLElement>('.product-preview')!, id)
  }
  function warm(variant: number) {
    if (life.signal.aborted || variant >= TTEOK_VARIANTS) return
    if (game || customSprites.size === COLOR_IDS.length) return
    const next = createTteokArtwork(colors, variant)
    for (const color of COLOR_IDS) {
      const sprite = next.get(COLOR_SPECS[color].hex)
      if (sprite) sprites.get(color)?.push(sprite)
    }
    window.setTimeout(() => warm(variant + 1), 24)
  }
  window.setTimeout(() => warm(1), 24)
}

function show(screen: HTMLElement) {
  for (const element of [selector, arena, results]) element.hidden = element !== screen
}

function select(color: TteokColor) {
  chosen = color
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.color === color))
  startButton.disabled = false
}

function stopRound() {
  const active = controller
  controller = undefined
  active?.abort()
  cancelAnimationFrame(frame)
  face?.close()
  face = undefined
  for (const track of stream?.getTracks() ?? []) track.stop()
  stream = undefined
  video.pause()
  video.srcObject = null
  app.removeAttribute('data-camera')
  game = undefined
  priorTime = undefined
  mouth = null
  effects = []
}

function fail(message: string) {
  stopRound()
  hud.hidden = tracking.hidden = frenzy.hidden = true
  overlay.hidden = false
  cameraMessage.textContent = message
}

function resize() {
  const width = playfield.clientWidth
  const height = playfield.clientHeight
  const pixelRatio = Math.min(devicePixelRatio || 1, 2)
  if (!width || !height) return
  canvas.width = Math.round(width * pixelRatio)
  canvas.height = Math.round(height * pixelRatio)
  ctx?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  game?.resize(width, height)
}

function playBite(correct: boolean) {
  if (output?.context.state !== 'running') return
  const { context, output: destination } = output
  const time = context.currentTime
  const tone = context.createOscillator()
  const envelope = context.createGain()
  tone.type = correct ? 'sine' : 'triangle'
  tone.frequency.setValueAtTime(correct ? 610 : 230, time)
  tone.frequency.exponentialRampToValueAtTime(correct ? 940 : 104, time + .095)
  envelope.gain.setValueAtTime(.001, time)
  envelope.gain.exponentialRampToValueAtTime(.17, time + .012)
  envelope.gain.exponentialRampToValueAtTime(.001, time + .15)
  tone.connect(envelope).connect(destination)
  tone.onended = () => { tone.disconnect(); envelope.disconnect() }
  tone.start(time)
  tone.stop(time + .16)
}

function drawPiece(piece: Piece, x = piece.x, y = piece.y, scale = 1, alpha = 1) {
  const variants = sprites.get(piece.color)
  const sprite = customSprites.get(piece.color) ?? variants?.[(piece.id - 1) % variants.length]
  if (!ctx || !sprite) return
  const diameter = piece.radius * 2.35 * scale
  const width = diameter * (.95 + ((piece.id * 17) % 11) / 100)
  const height = diameter * (.95 + ((piece.id * 13) % 11) / 100)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(piece.rotation)
  ctx.globalAlpha = alpha
  ctx.drawImage(sprite, -width / 2, -height / 2, width, height)
  ctx.restore()
}

function draw(active: HoneyTteokGame, now: number) {
  if (!ctx) return
  ctx.clearRect(0, 0, playfield.clientWidth, playfield.clientHeight)
  for (const piece of active.pieces) drawPiece(piece)
  if (mouth?.open) {
    const ready = active.biteReady
    ctx.save()
    ctx.strokeStyle = ready ? '#ffefad' : '#fff8ed99'
    ctx.shadowColor = '#211816'
    ctx.shadowBlur = 5
    ctx.lineWidth = ready ? 3 : 1.5
    ctx.beginPath()
    ctx.ellipse(mouth.x, mouth.y, mouth.radiusX + 7, Math.max(11, mouth.radiusY + 7), 0, 0, 2 * Math.PI)
    ctx.stroke()
    if (ready) {
      ctx.fillStyle = '#fff4ca'
      ctx.font = `700 14px ${uiFont}`
      ctx.textAlign = 'center'
      ctx.fillText('입 닫기', mouth.x, Math.max(22, mouth.y - mouth.radiusY - 17))
    }
    ctx.restore()
  }
  effects = effects.filter(({ time }) => now - time < 490)
  for (const effect of effects) {
    const { bite, x, y, time } = effect
    const elapsed = now - time
    const shrink = Math.min(1, elapsed / 210)
    if (shrink < 1 && !reduceMotion.matches) {
      drawPiece(bite, bite.x + (x - bite.x) * shrink, bite.y + (y - bite.y) * shrink, 1 - shrink * .94, 1 - shrink)
    }
    ctx.save()
    ctx.globalAlpha = (1 - elapsed / 490) ** .7
    ctx.textAlign = 'center'
    ctx.font = `700 25px ${uiFont}`
    ctx.lineWidth = 3
    ctx.strokeStyle = '#231b1a'
    ctx.fillStyle = bite.correct ? '#fff4d8' : '#ffd3d9'
    const label = bite.points > 0 ? `+${bite.points}` : String(bite.points)
    const labelY = y - 25 - (reduceMotion.matches ? 0 : elapsed * .07)
    ctx.strokeText(label, x, labelY)
    ctx.fillText(label, x, labelY)
    ctx.restore()
  }
}

function updateHud(active: HoneyTteokGame) {
  score.textContent = scoreFormat.format(active.score)
  combo.textContent = active.streak ? `${active.streak} · ×${active.multiplier}` : '0'
  const seconds = Math.ceil(active.remainingMs / 1000)
  timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  frenzy.hidden = !active.frenzy
}

function tick(now: number) {
  if (!controller || !face) return
  frame = requestAnimationFrame(tick)
  if (!appVisible() || document.hidden) return
  let sample: MouthSample | null | undefined
  try { sample = face.sample(now, { width: playfield.clientWidth, height: playfield.clientHeight }) }
  catch (error) {
    console.warn('[HONEY TTEOK] Face tracking stopped:', error)
    fail('얼굴 인식이 중단됐습니다. 색상을 선택하고 다시 시작해 주세요.')
    return
  }
  if (!game) {
    if (!sample || !chosen) return
    game = new HoneyTteokGame(chosen, playfield.clientWidth, playfield.clientHeight)
    overlay.hidden = true
    hud.hidden = false
  }
  game.update(priorTime === undefined ? 0 : Math.max(0, now - priorTime))
  priorTime = now
  if (sample !== undefined) {
    game.sampleMouth(sample)
    mouth = sample
    tracking.hidden = Boolean(sample)
  }
  for (const bite of game.drainBites()) {
    effects.push({ bite, x: sample?.x ?? bite.x, y: sample?.y ?? bite.y, time: now })
    playBite(bite.correct)
  }
  updateHud(game)
  draw(game, now)
  if (game.finished && chosen) finish(game.score, chosen)
}

async function startRound() {
  if (!chosen || controller || life.signal.aborted) return
  finalResult = undefined
  show(arena)
  overlay.hidden = false
  hud.hidden = tracking.hidden = frenzy.hidden = true
  cameraMessage.textContent = '카메라와 얼굴 인식을 준비하고 있습니다…'
  hud.style.setProperty('--target', COLOR_SPECS[chosen].hex)
  resize()
  output ??= openAppAudio()
  resumeAudio(output?.context)
  const active = new AbortController()
  controller = active
  const { signal } = active
  try {
    const camera = await requestCamera(navigator.mediaDevices, { signal })
    if (signal.aborted) {
      camera.getTracks().forEach((track) => track.stop())
      return
    }
    stream = camera
    for (const track of camera.getVideoTracks()) {
      track.addEventListener('ended', () => fail('카메라 연결이 끊어졌습니다. 연결을 확인한 뒤 다시 시작해 주세요.'), { once: true, signal })
    }
    video.srcObject = camera
    await video.play()
    signal.throwIfAborted()
    app.setAttribute('data-camera', '')
    face = new FaceInput()
    await face.start(video, signal, (error) => {
      if (signal.aborted) return
      console.warn('[HONEY TTEOK] Face tracking stopped:', error)
      fail('얼굴 인식이 중단됐습니다. 색상을 선택하고 다시 시작해 주세요.')
    })
    signal.throwIfAborted()
    cameraMessage.textContent = '카메라를 정면으로 보면 게임이 시작됩니다.'
    frame = requestAnimationFrame(tick)
  } catch (error) {
    if (signal.aborted) return
    console.warn('[HONEY TTEOK] Could not start:', error)
    fail(error instanceof Error && error.name === 'NotAllowedError'
      ? '카메라 권한을 허용한 뒤 다시 시작해 주세요.'
      : '카메라 또는 얼굴 인식을 준비하지 못했습니다. 연결을 확인해 주세요.')
  }
}

function renderRanking(entries: ScoreRecord[]) {
  rankingStatus.textContent = entries.length ? '' : '아직 저장된 기록이 없습니다.'
  rankingList.replaceChildren(...entries.map((entry) => {
    const row = document.createElement('li')
    const name = document.createElement('span')
    const points = document.createElement('strong')
    name.textContent = entry.nickname
    points.textContent = scoreFormat.format(entry.score)
    row.append(name, points)
    return row
  }))
}

function finish(points: number, color: TteokColor) {
  stopRound()
  finalResult = { id: crypto.randomUUID(), color, score: points }
  find('[data-total]').textContent = scoreFormat.format(points)
  product(find('.result-packshot'), color)
  find('.result-product figcaption').textContent = COLOR_SPECS[color].label
  saveForm.reset()
  nickname.disabled = saveButton.disabled = false
  saveStatus.textContent = ''
  rankingList.replaceChildren()
  rankingStatus.textContent = '기록을 불러오고 있습니다…'
  show(results)
  const current = finalResult
  void ranking.list().then((entries) => {
    if (!life.signal.aborted && finalResult === current && !saveButton.disabled) renderRanking(entries)
  }, () => {
    if (finalResult === current) rankingStatus.textContent = '이 브라우저의 기록을 불러오지 못했습니다.'
  })
}

saveForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const current = finalResult
  const name = nickname.value.trim()
  if (!current || saveButton.disabled) return
  if (!name || name.length > NICKNAME_LIMIT) {
    saveStatus.textContent = '닉네임을 입력해 주세요.'
    return
  }
  nickname.disabled = saveButton.disabled = true
  const record = { id: current.id, nickname: name, score: current.score, savedAt: Date.now() }
  void ranking.save(record).then((entries) => {
    if (life.signal.aborted || finalResult !== current) return
    renderRanking(entries)
    saveStatus.textContent = entries.some(({ id }) => id === record.id)
      ? '기록을 저장했습니다.'
      : `이번 점수는 TOP ${RANKING_LIMIT}에 들지 못했습니다.`
  }, () => {
    if (life.signal.aborted || finalResult !== current) return
    nickname.disabled = saveButton.disabled = false
    saveStatus.textContent = '이 브라우저에 기록을 저장하지 못했습니다.'
  })
}, events)

for (const button of buttons) {
  button.addEventListener('click', () => select(button.dataset.color as TteokColor), events)
}
startButton.addEventListener('click', () => { void startRound() }, events)
find('.cancel').addEventListener('click', () => { stopRound(); show(selector) }, events)
find('.replay').addEventListener('click', () => { finalResult = undefined; show(selector) }, events)

function visibilityChanged() {
  priorTime = undefined
  if (!appVisible() || document.hidden) {
    mouth = null
    face?.reset()
    game?.sampleMouth(null)
  }
}

const sizeObserver = new ResizeObserver(resize)
sizeObserver.observe(playfield)
document.addEventListener('visibilitychange', visibilityChanged, events)
function dispose() {
  if (life.signal.aborted) return
  life.abort()
  sizeObserver.disconnect()
  stopRound()
  output?.close()
}
connectDesktop(null, { dispose, visibilityChanged })
window.addEventListener('pagehide', dispose, { once: true })
if (import.meta.hot) import.meta.hot.dispose(dispose)
loadArtwork()
