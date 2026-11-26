import { appearance, publicAsset, wordmark } from '../appearance'
import { icon } from '../ui/icons'

export function buildLockScreen() {
  const screen = document.createElement('section')
  screen.className = 'lock-screen'
  screen.setAttribute('aria-label', 'Lock screen')
  screen.innerHTML = `
    <div class="lock-brand">
      ${wordmark()}
      <span class="brand-title">CREATIVE<br>PLAYGROUND</span>
    </div>
    <div class="lock-clock">
      <time class="lock-date"></time>
      <time class="lock-time"></time>
    </div>
    <form class="unlock-form" autocomplete="off" novalidate>
      <div class="profile-avatar">
        <img class="profile-image" alt="3CE Stylenanda" src="${publicAsset(appearance.profileImage)}" draggable="false">
      </div>
      <p class="profile-name"></p>
      <div class="password-field">
        <label class="sr-only" for="unlock-password">Password</label>
        <input id="unlock-password" type="password" placeholder="Enter password" required autocomplete="off">
        <button type="submit" aria-label="Unlock" title="Unlock">${icon('unlock')}</button>
      </div>
      <p class="unlock-status" role="status"></p>
    </form>
  `
  screen.querySelector<HTMLElement>('.profile-name')!.textContent = appearance.profileName
  const password = screen.querySelector<HTMLInputElement>('input')!
  const submit = screen.querySelector<HTMLButtonElement>('button')!
  const status = screen.querySelector<HTMLElement>('.unlock-status')!
  return {
    screen,
    date: screen.querySelector<HTMLTimeElement>('.lock-date')!,
    time: screen.querySelector<HTMLTimeElement>('.lock-time')!,
    form: screen.querySelector<HTMLFormElement>('form')!,
    password,
    setWaiting(waiting: boolean) {
      password.readOnly = waiting
      submit.disabled = waiting
      status.textContent = waiting ? 'Preparing camera…' : ''
    },
  }
}
