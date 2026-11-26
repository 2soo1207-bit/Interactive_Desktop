import './style.css'
import { startClock } from './core/clock'
import { mediapipeHandTracker } from './core/mediapipe-hand-tracker'
import { buildDesktop } from './desktop/desktop'
import { buildLockScreen } from './desktop/lock-screen'

const playground = document.querySelector<HTMLElement>('#app')!
const lock = buildLockScreen()
const desktop = buildDesktop(relock, mediapipeHandTracker)
const { camera } = desktop
let unlockPending = false
let resumeCamera = false

playground.dataset.screen = 'lock'
playground.append(desktop.screen, lock.screen)
lock.password.focus({ preventScroll: true })
startClock(lock.time, lock.date, desktop.clock)

lock.form.addEventListener('submit', (event) => {
  event.preventDefault()
  if (unlockPending) return
  if (!lock.password.value) {
    lock.password.focus({ preventScroll: true })
    return
  }
  lock.form.reset()
  unlockPending = true
  revealDesktop()
  if (unlockPending) lock.setWaiting(true)
})

function revealDesktop() {
  if (!unlockPending) return
  const { status } = camera.state
  if (status !== 'live' && status !== 'unavailable') return

  unlockPending = false
  lock.setWaiting(false)
  lock.screen.inert = true
  playground.dataset.screen = 'desktop'
  desktop.show()
}

function prepareCamera() {
  if (camera.state.status === 'off') void camera.start()
}

function relock() {
  desktop.hide()
  playground.dataset.screen = 'lock'
  lock.screen.inert = false
  lock.form.reset()
  lock.password.focus({ preventScroll: true })
  prepareCamera()
}

camera.subscribe(revealDesktop)
prepareCamera()

window.addEventListener('pagehide', () => {
  resumeCamera = camera.state.status === 'requesting' || camera.state.status === 'live'
  if (resumeCamera) camera.stop()
})

window.addEventListener('pageshow', (event) => {
  if (event.persisted && resumeCamera) prepareCamera()
})
