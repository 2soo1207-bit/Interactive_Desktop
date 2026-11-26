const weekdays = '일월화수목금토'

function twoDigits(value: number) { return String(value).padStart(2, '0') }

export function startClock(lockTime: HTMLTimeElement, lockDate: HTMLTimeElement, menuClock: HTMLTimeElement) {
  const menuDate = menuClock.querySelector('.menu-date')!
  const menuTime = menuClock.querySelector('.menu-time')!
  let lastMinute: number | undefined
  let lastOffset: number | undefined

  function update() {
    const now = new Date()
    const minute = Math.floor(now.getTime() / 60_000)
    const offset = now.getTimezoneOffset()
    if (minute === lastMinute && offset === lastOffset) return
    lastMinute = minute
    lastOffset = offset

    const hours = now.getHours()
    const minutes = twoDigits(now.getMinutes())
    const period = hours < 12 ? '오전' : '오후'
    lockTime.textContent = `${twoDigits(hours)}:${minutes}`
    lockDate.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    menuDate.textContent = `${now.getMonth() + 1}월 ${now.getDate()}일 (${weekdays[now.getDay()]})`
    menuTime.textContent = `${period} ${hours % 12 || 12}:${minutes}`
    for (const element of [lockTime, lockDate, menuClock]) {
      element.dateTime = now.toISOString()
    }
  }

  document.addEventListener('visibilitychange', update)
  window.addEventListener('focus', update)
  window.addEventListener('pageshow', update)
  // Browsers have no system-clock change event. Check the local time without repainting each second.
  window.setInterval(update, 1000)
  update()
}
