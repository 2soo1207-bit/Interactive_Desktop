import './styles.css'
import { HandSlots, screenPoint, FINGERS, detectPinch } from './tracking.js'
import { defaults, loadSettings, SETTINGS_KEY, spokenWord } from './settings.js'
import { Speech, HeartAudio } from './audio.js'
import { Effects } from './effects.js'
import { drawHand } from './renderer.js'
import { CameraInput } from './camera.js'
import { CameraAccessError } from '../shared/camera-access.ts'
import { appAudioWindow, appGesturesAllowed, appVisible, connectDesktop, handsAssetBase, openAppAudio, reportSpeechBlocked } from '../shared/desktop-host.ts'
import { observeAudioSuspension, resumeAudio } from '../shared/audio.ts'

const MEDIAPIPE = handsAssetBase()
const OPTIONS = { maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: .6, minTrackingConfidence: .5 }
const app = document.getElementById('app')
app.innerHTML = `
  <main class="hand-demo" data-hand-camera aria-label="손가락으로 단어를 읽는 핸드트래킹">
    <canvas class="hand-canvas" aria-label="웹캠 영상과 손가락 단어"></canvas>
    <video class="hand-camera" muted playsinline aria-hidden="true"></video>
    <canvas class="hand-input-canvas" width="640" height="360" aria-hidden="true"></canvas>
    <a class="hand-demo-back" href="../../index.html">← Back</a>
    <div class="hand-top-actions">
      <span class="hand-recording" hidden></span>
      <button type="button" class="hand-edit-toggle" aria-haspopup="dialog">Edit · E</button>
    </div>
    <button type="button" class="hand-sound" hidden>Enable sound</button>
    <div class="hand-help">
      <p>thumb taps a finger, it speaks</p>
      <p>엄지로 다른 손가락을 터치하면 단어를 읽습니다</p>
      <p class="hand-keys">E edit · K skeleton · M mirror · H help · S save · R record</p>
    </div>
    <div class="hand-camera-state" role="status" aria-live="polite">
      <p>카메라와 손 인식을 준비하고 있습니다.<br>카메라 접근을 허용해 주세요.</p>
      <button type="button" class="hand-retry" hidden>다시 시도</button>
    </div>
    <p class="hand-toast" role="status" aria-live="polite" hidden></p>
    <dialog class="hand-editor" aria-labelledby="hand-editor-title">
      <form>
        <header><h1 id="hand-editor-title">Words & voices</h1><button class="hand-editor-close" type="button" aria-label="편집 패널 닫기">×</button></header>
        <div class="hand-fields">${['첫 손 · 검지', '첫 손 · 중지', '첫 손 · 약지', '다른 손 · 검지', '다른 손 · 중지'].map((label, index) => `<label class="hand-word-field"><span>${label}</span><input name="word${index}" maxlength="40" required autocomplete="off" aria-label="${label} 단어" /></label>`).join('')}</div>
        <label class="hand-voice-field"><span>영어 음성</span><select name="english"></select></label>
        <label class="hand-voice-field"><span>중국어 음성</span><select name="chinese"></select></label>
        <div class="hand-editor-actions"><button type="button" class="hand-test-words">단어 읽어보기</button><button type="button" class="hand-reset">초기화</button><button type="submit">저장</button></div>
        <p class="hand-editor-status" role="status" aria-live="polite"></p>
      </form>
    </dialog>
  </main>`

const root = app.querySelector('.hand-demo')
const canvas = root.querySelector('.hand-canvas'), ctx = canvas.getContext('2d', { alpha: false })
const video = root.querySelector('video')
const input = root.querySelector('.hand-input-canvas'), inputCtx = input.getContext('2d', { alpha: false })
const cameraState = root.querySelector('.hand-camera-state'), cameraMessage = cameraState.querySelector('p')
const retry = root.querySelector('.hand-retry'), soundButton = root.querySelector('.hand-sound')
const toast = root.querySelector('.hand-toast'), help = root.querySelector('.hand-help')
const editor = root.querySelector('dialog'), form = editor.querySelector('form')
const editorStatus = root.querySelector('.hand-editor-status'), recording = root.querySelector('.hand-recording')
const cameras = new CameraInput(navigator.mediaDevices)
const abort = new AbortController(), { signal } = abort
const effects = new Effects()
let slots = new HandSlots()
let settings = loadSettings()
let hands, modelScriptPromise, raf, recorder, capture, recordStart = 0, inference
let current = [], width = 0, height = 0, dpr = 1, mirrored = true, skeleton = true
let busy = false, starting = false, stopped = false, trackingFailed = false, lastVideoTime = -1
let toastTimer = 0, startupId = 0, finalizingRecording = false, downloadURLs = new Set()

function notify(message, persistent = false) {
  if (stopped) return
  clearTimeout(toastTimer)
  toast.textContent = message
  toast.hidden = false
  if (!persistent) toastTimer = setTimeout(() => { toast.hidden = true }, 5000)
}
const playback = openAppAudio()
const audioWindow = appAudioWindow()
const hosted = audioWindow !== window
let audioSuspended = false
let speechBlocked = false
function updateSoundButton() { soundButton.hidden = !audioSuspended && !speechBlocked }
const speech = new Speech(() => settings, notify, audioWindow, (blocked) => {
  if (hosted) {
    reportSpeechBlocked(blocked)
  } else {
    speechBlocked = blocked
    updateSoundButton()
  }
})
const heartAudio = new HeartAudio(new URL('./heart.wav', import.meta.url), notify, playback)
speech.unlock()
if (!hosted) {
  resumeAudio(playback?.context)
  observeAudioSuspension(playback?.context, signal, (suspended) => {
    audioSuspended = suspended
    updateSoundButton()
  })
  function unlockFromInput(event) {
    if (!event.isTrusted) return
    resumeAudio(playback?.context)
    speech.unlock()
  }
  window.addEventListener('pointerdown', unlockFromInput, { capture: true, signal })
  window.addEventListener('keydown', unlockFromInput, { capture: true, signal })
  soundButton.addEventListener('click', unlockFromInput, { signal })
}

function resize() {
  width = innerWidth
  height = innerHeight
  dpr = devicePixelRatio || 1
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
resize()
window.addEventListener('resize', resize, { signal })

function geometry() {
  const videoWidth = video.videoWidth || 640, videoHeight = video.videoHeight || 360
  const scale = Math.min(width / videoWidth, height / videoHeight)
  const viewWidth = videoWidth * scale
  const viewHeight = videoHeight * scale
  return {
    left: (width - viewWidth) / 2,
    top: (height - viewHeight) / 2,
    width: viewWidth,
    height: viewHeight,
    videoWidth,
    videoHeight,
    mirrored,
    crop: { x: 0, y: 0, width: videoWidth, height: videoHeight },
  }
}

function onResults(results) {
  if (stopped || starting || trackingFailed || !appGesturesAllowed()) return
  const now = performance.now(), geo = geometry()
  current = slots.update(results.multiHandLandmarks ?? [], now)
  root.dataset.hands = String(current.length)
  for (const { slot, role } of current) {
    const finger = detectPinch(slot.raw, slot.pinch, now, geo.videoWidth / geo.videoHeight)
    if (finger < 0 || finger > 2) continue
    const point = screenPoint(slot.smooth[FINGERS[finger].tip], geo.videoWidth, geo.videoHeight, geo.crop, geo.width, geo.height, mirrored)
    if (role === 1 && finger === 2) {
      effects.hearts(point.x, point.y, geo.width, geo.height, now)
      heartAudio.play()
    } else {
      effects.pop(slot.id, finger, now)
      speech.speak(settings.words[role === 0 ? finger : finger + 3])
    }
  }
}

function trackingError() {
  if (stopped || starting || trackingFailed) return
  trackingFailed = true
  current = []
  cameraState.hidden = false
  cameraMessage.textContent = '손 인식을 시작하지 못했습니다.\n인터넷 연결과 브라우저의 WebGL 지원을 확인한 뒤 다시 시도해 주세요.'
  retry.hidden = false
  root.dataset.state = 'tracking-error'
}

// A single render loop; at most one unresolved hands.send call at any time.
function tick(now) {
  if (stopped) return
  raf = requestAnimationFrame(tick)
  if (!appVisible()) return
  if (canvas.width !== Math.round(innerWidth * (devicePixelRatio || 1)) || canvas.height !== Math.round(innerHeight * (devicePixelRatio || 1))) resize()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  if (video.readyState >= 2 && video.videoWidth) {
    const geo = geometry()
    ctx.save()
    ctx.translate(geo.left, geo.top)
    ctx.save()
    if (mirrored) { ctx.translate(geo.width, 0); ctx.scale(-1, 1) }
    ctx.drawImage(video, 0, 0, geo.width, geo.height)
    ctx.restore()
    for (const { slot, role } of current) {
      if (now - slot.lastSeen < 240) drawHand(ctx, slot.smooth, role, slot.id, settings, effects, now, skeleton, geo)
    }
    effects.draw(ctx, now)
    ctx.restore()
    if (hands && !starting && !busy && !trackingFailed && !document.hidden && !editor.open && appGesturesAllowed() && video.currentTime !== lastVideoTime) {
      busy = true
      lastVideoTime = video.currentTime
      const inputHeight = Math.round(640 * video.videoHeight / video.videoWidth)
      if (input.height !== inputHeight) input.height = inputHeight
      inputCtx.drawImage(video, 0, 0, 640, inputHeight)
      inference = hands.send({ image: input }).catch(trackingError).finally(() => { busy = false })
    }
  }
  if (recorder?.state === 'recording') recording.textContent = `REC ${Math.floor((now - recordStart) / 1000)}s · R stop`
}
raf = requestAnimationFrame(tick)

function loadModelScript() {
  if (globalThis.Hands) return Promise.resolve(globalThis.Hands)
  if (!modelScriptPromise) modelScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${MEDIAPIPE}hands.js`
    script.crossOrigin = 'anonymous'
    script.onload = () => globalThis.Hands ? resolve(globalThis.Hands) : reject(new Error('Hands unavailable'))
    script.onerror = () => { script.remove(); modelScriptPromise = undefined; reject(new Error('Model download failed')) }
    document.head.append(script)
  })
  return modelScriptPromise
}

async function start() {
  if (starting || stopped) return
  const token = ++startupId
  const rebuildModel = !hands || trackingFailed
  starting = true
  trackingFailed = false
  current = []
  root.dataset.state = 'loading'
  cameraState.hidden = false
  retry.hidden = true
  cameraMessage.textContent = '카메라와 손 인식을 준비하고 있습니다.\n카메라 접근을 허용해 주세요.'
  try {
    if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('secure-context')
    // Finish processing the old camera before replacing its source/landmarks.
    await inference
    if (rebuildModel && hands) { const previous = hands; hands = undefined; await previous.close() }
    const incoming = await cameras.open()
    if (stopped || token !== startupId) { incoming.getTracks().forEach(track => track.stop()); return }
    video.srcObject = incoming
    await video.play()
    root.dataset.camera = cameras.selectedId
    if (rebuildModel) {
      cameraMessage.textContent = '손 인식 모델을 불러오고 있습니다.'
      const Hands = await loadModelScript()
      if (stopped || token !== startupId) return
      hands = new Hands({ locateFile: file => new URL(file, MEDIAPIPE).href })
      hands.setOptions(OPTIONS)
      hands.onResults(onResults)
      try { await hands.initialize() }
      catch (error) { trackingFailed = true; throw error }
    }
    if (stopped || token !== startupId) return
    slots = new HandSlots()
    current = []
    lastVideoTime = -1
    cameraState.hidden = true
    root.dataset.state = 'ready'
  } catch (error) {
    if (stopped || token !== startupId) return
    root.dataset.state = 'error'
    console.error('[hand-tracking] 카메라 또는 손 인식 초기화 실패:', error)
    if (error.message === 'secure-context') cameraMessage.textContent = '카메라는 HTTPS 또는 localhost에서 사용할 수 있습니다.\nHTTPS 개발 서버 주소로 접속해 주세요.'
    else if (error instanceof CameraAccessError) cameraMessage.textContent = error.message
    else if (error.name === 'AbortError') cameraMessage.textContent = '카메라 연결이 취소되었습니다.\n다시 시도해 주세요.'
    else if (error.name === 'NotAllowedError' || error.name === 'SecurityError') cameraMessage.textContent = '카메라 접근 권한이 거부되었습니다.\n브라우저 주소창의 사이트 설정에서 카메라를 허용한 뒤 다시 시도해 주세요.'
    else if (error.name === 'NotFoundError') cameraMessage.textContent = '사용할 수 있는 카메라를 찾지 못했습니다.\n웹캠 연결을 확인해 주세요.'
    else if (error.name === 'NotReadableError') cameraMessage.textContent = '카메라를 열 수 없습니다.\n다른 앱이 카메라를 사용 중인지 확인한 뒤 다시 시도해 주세요.'
    else if (error.name === 'OverconstrainedError') cameraMessage.textContent = '사용 가능한 카메라에 연결할 수 없습니다.\n브라우저의 카메라 설정과 기기 연결을 확인한 뒤 다시 시도해 주세요.'
    else cameraMessage.textContent = '카메라 또는 손 인식 모델을 불러오지 못했습니다.\n카메라 연결, 인터넷 연결, 브라우저 설정을 확인해 주세요.'
    retry.hidden = false
  } finally { starting = false }
}
retry.addEventListener('click', () => void start(), { signal })
async function refreshCameras() {
  if (stopped || starting || !navigator.mediaDevices) return
  try {
    await cameras.refresh()
    if (stopped) return
    if (cameras.stream?.getVideoTracks().every(track => track.readyState === 'ended')) {
      current = []
      void start()
    }
  } catch { /* Device enumeration must not interrupt a working camera. */ }
}
navigator.mediaDevices?.addEventListener('devicechange', () => void refreshCameras(), { signal })

function fillVoices() {
  const voices = speech.synth?.getVoices() ?? []
  for (const [name, language] of [['english', 'en'], ['chinese', 'zh']]) {
    const select = form.elements.namedItem(name), selected = editor.open ? select.value : settings[name]
    select.replaceChildren(new Option('자동 선택', ''))
    for (const voice of voices.filter(item => item.lang.toLowerCase().startsWith(language))) select.add(new Option(`${voice.name} · ${voice.lang}`, voice.voiceURI))
    select.value = selected
    if (select.selectedIndex < 0) select.selectedIndex = 0
  }
}
function fillForm() {
  settings.words.forEach((word, index) => { form.elements.namedItem(`word${index}`).value = word })
  fillVoices()
  form.elements.namedItem('english').value = settings.english
  form.elements.namedItem('chinese').value = settings.chinese
}
function openEditor() { fillForm(); editorStatus.textContent = ''; editor.showModal() }
function draftSettings() {
  return {
    words: settings.words.map((word, index) => form.elements.namedItem(`word${index}`).value.trim() || word),
    english: form.elements.namedItem('english').value,
    chinese: form.elements.namedItem('chinese').value,
  }
}
function persist() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true }
  catch { notify('설정을 이 브라우저에 저장하지 못했습니다. 이번 화면에는 적용됩니다.'); return false }
}
root.querySelector('.hand-edit-toggle').addEventListener('click', openEditor, { signal })
root.querySelector('.hand-editor-close').addEventListener('click', () => editor.close(), { signal })
form.addEventListener('submit', event => {
  event.preventDefault()
  settings = draftSettings()
  const saved = persist()
  editor.close()
  if (saved) notify('단어와 음성 설정을 저장했습니다.')
}, { signal })
root.querySelector('.hand-reset').addEventListener('click', () => {
  settings = defaults()
  const saved = persist()
  fillForm()
  editorStatus.textContent = saved ? '기본 설정으로 초기화했습니다.' : '기본 설정을 적용했지만 브라우저에 저장하지 못했습니다.'
}, { signal })
root.querySelector('.hand-test-words').addEventListener('click', () => {
  const draft = draftSettings()
  speech.speak(draft.words.map(spokenWord).join(' '), draft)
}, { signal })
speech.synth?.addEventListener('voiceschanged', fillVoices, { signal })
fillForm()

function download(blob, filename) {
  if (!blob) return
  const url = URL.createObjectURL(blob)
  downloadURLs.add(url)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => { URL.revokeObjectURL(url); downloadURLs.delete(url) }, 10000)
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-')
function screenshot() {
  if (!video.videoWidth) return notify('카메라가 준비된 뒤 저장할 수 있습니다.')
  canvas.toBlob(blob => download(blob, `hand-tracking-${stamp()}.png`), 'image/png')
}
function toggleRecording() {
  if (recorder?.state === 'recording') { recorder.stop(); return }
  if (finalizingRecording) return
  if (!video.videoWidth) return notify('카메라가 준비된 뒤 녹화할 수 있습니다.')
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => globalThis.MediaRecorder?.isTypeSupported(type))
  if (!canvas.captureStream || !mime) return notify('이 브라우저는 WebM 녹화를 지원하지 않습니다. Chrome에서 시도해 주세요.')
  try {
    capture = canvas.captureStream(30)
    // Include the Web Audio effects. System speech synthesis is not capturable.
    const effectTrack = heartAudio.destination?.stream.getAudioTracks()[0]
    if (effectTrack) capture.addTrack(effectTrack.clone())
    const recordingStream = capture
    recorder = new MediaRecorder(recordingStream, { mimeType: mime, videoBitsPerSecond: 8000000 })
    const chunks = []
    finalizingRecording = true
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    recorder.onstop = () => {
      if (chunks.length) download(new Blob(chunks, { type: mime }), `hand-tracking-${stamp()}.webm`)
      recordingStream.getTracks().forEach(track => track.stop())
      finalizingRecording = false
      recording.hidden = true
    }
    recorder.onerror = () => notify('녹화 중 오류가 발생했습니다. 다시 시도해 주세요.')
    recorder.start(1000)
    recordStart = performance.now()
    recording.hidden = false
  } catch { capture?.getTracks().forEach(track => track.stop()); finalizingRecording = false; notify('이 브라우저에서 녹화를 시작할 수 없습니다.') }
}
window.addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
  if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable="true"]')) return
  const key = event.key.toLowerCase()
  if (key === 'e') { event.preventDefault(); editor.open ? editor.close() : openEditor(); return }
  if (editor.open) return
  if (key === 'k') skeleton = !skeleton
  if (key === 'm') mirrored = !mirrored
  if (key === 'h') help.hidden = !help.hidden
  if (key === 's') { event.preventDefault(); screenshot() }
  if (key === 'r') { event.preventDefault(); toggleRecording() }
}, { signal })

function dispose() {
  if (stopped) return
  stopped = true
  ++startupId
  cancelAnimationFrame(raf)
  clearTimeout(toastTimer)
  abort.abort()
  if (recorder?.state === 'recording') recorder.stop()
  cameras.destroy()
  video.pause()
  video.srcObject = null
  void Promise.resolve(inference).then(() => hands?.close()).catch(() => {})
  speech.destroy()
  heartAudio.destroy()
  for (const url of downloadURLs) URL.revokeObjectURL(url)
}
connectDesktop('.hand-demo-back', { dispose, audioRequested: () => speech.unlock() })
window.addEventListener('pagehide', dispose, { once: true })
window.addEventListener('pageshow', event => { if (event.persisted && stopped) location.reload() })
if (import.meta.hot) import.meta.hot.dispose(dispose)
void start()
