import { youtubePlayerOrigin } from './channel.ts'

interface Player {
  mute(): void
  unMute(): void
  isMuted(): boolean
  getVolume(): number
  setVolume(volume: number): void
  playVideo(): void
  pauseVideo(): void
  getPlayerState(): number
  destroy(): void
}

type PlayerEvent = { target: Player }
type PlayerDataEvent = PlayerEvent & { data: number }

interface PlayerEvents {
  onReady(event: PlayerEvent): void
  onStateChange(event: PlayerDataEvent): void
  onAutoplayBlocked(event: PlayerEvent): void
  onError(event: PlayerDataEvent): void
}

interface PlayerAPI {
  Player: new (frame: HTMLIFrameElement, options: { events: PlayerEvents }) => Player
}

declare global {
  interface Window {
    YT?: PlayerAPI
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<PlayerAPI> | undefined

function loadAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  return apiPromise ??= new Promise<PlayerAPI>((resolve, reject) => {
    const script = document.createElement('script')
    const timer = window.setTimeout(fail, 8000)
    function fail() {
      window.clearTimeout(timer)
      delete window.onYouTubeIframeAPIReady
      script.remove()
      apiPromise = undefined
      reject(new Error('Could not connect to YouTube'))
    }
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer)
      delete window.onYouTubeIframeAPIReady
      if (window.YT?.Player) resolve(window.YT)
      else fail()
    }
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.addEventListener('error', fail, { once: true })
    document.head.append(script)
  })
}

interface Controls {
  play: HTMLButtonElement
  sound: HTMLButtonElement
  status: HTMLElement
}

type Autoplay = 'audible' | 'muted'
type Attempt = Autoplay | 'manual'

export function mountVideoPlayer(host: HTMLElement, id: string, controls: Controls, source: string) {
  const frame = document.createElement('iframe')
  const url = new URL(`/embed/${id}`, youtubePlayerOrigin)
  url.search = new URLSearchParams({ enablejsapi: '1', playsinline: '1', rel: '0' }).toString()
  if (location.origin !== 'null') url.searchParams.set('origin', location.origin)
  frame.title = 'YouTube 영상 플레이어'
  frame.referrerPolicy = 'strict-origin-when-cross-origin'
  frame.allow = `autoplay ${youtubePlayerOrigin}; encrypted-media; fullscreen; picture-in-picture`
  frame.allowFullscreen = true
  frame.src = url.href
  host.replaceChildren(frame)

  const lifetime = new AbortController()
  const { signal } = lifetime
  let player: Player | undefined
  let readyPlayer: Player | undefined
  let pendingAutoplay: Autoplay | undefined = 'audible'
  let attempt: Attempt | undefined
  let attemptSource = source
  let visibility = 0
  let playbackTimer = 0
  let controlsTimer = 0
  let needsSound = false
  const showStatus = (message: string) => { controls.status.textContent = message }
  const diagnostics = (target = player) => ({
    videoId: id, source: attemptSource, attempt, visibility,
    state: target?.getPlayerState?.(), muted: target?.isMuted?.(), volume: target?.getVolume?.(),
    active: navigator.userActivation?.isActive, hasBeenActive: navigator.userActivation?.hasBeenActive,
    iframeAllow: frame.allow,
  })
  const hasSound = (target: Player) => !target.isMuted() && target.getVolume() > 0

  function stopAutoplay() {
    pendingAutoplay = undefined
    observer.disconnect()
  }

  function clearPlaybackTimer() {
    window.clearTimeout(playbackTimer)
    playbackTimer = 0
  }

  function updateSoundControl(target: Player) {
    const audible = hasSound(target)
    const label = audible ? '소리 끄기' : '소리 켜기'
    if (controls.sound.textContent !== label) controls.sound.textContent = label
    controls.sound.toggleAttribute('data-audio-blocked', needsSound && !audible)
    if (audible && needsSound && target.getPlayerState() === 1) {
      needsSound = false
      showStatus('')
    }
  }

  function showPlaying(target: Player) {
    clearPlaybackTimer()
    stopAutoplay()
    controls.play.hidden = false
    controls.play.textContent = '일시 정지'
    controls.sound.hidden = false
    updateSoundControl(target)
    showStatus(needsSound
      ? attempt === 'manual'
        ? '소리가 꺼져 있습니다. 영상 안의 스피커 버튼을 직접 눌러 주세요.'
        : '소리 자동재생이 제한되어 음소거로 재생 중입니다. 소리 켜기를 눌러 주세요.'
      : '')
  }

  function offerManual(message: string) {
    clearPlaybackTimer()
    stopAutoplay()
    controls.play.hidden = false
    controls.play.textContent = '소리와 함께 재생'
    showStatus(message)
  }

  function play(target: Player, mode: Attempt, trigger: string) {
    clearPlaybackTimer()
    needsSound = true
    attempt = mode
    attemptSource = trigger
    controls.play.hidden = true
    controls.sound.hidden = true
    showStatus('')
    if (mode === 'muted') target.mute()
    else {
      target.unMute()
      if (target.getVolume() === 0) target.setVolume(70)
    }
    playbackTimer = window.setTimeout(() => {
      if (target.getPlayerState() === 1) showPlaying(target)
      else {
        console.warn('[3CE YouTube] 재생 시작을 확인하지 못했습니다.', diagnostics(target))
        offerManual(mode === 'manual'
          ? '영상 안의 재생 또는 스피커 버튼을 직접 눌러 주세요.'
          : '아직 재생이 시작되지 않았습니다. 재생 버튼을 눌러 주세요.')
      }
    }, 7000)
    target.playVideo()
    console.info('[3CE YouTube] 재생을 요청했습니다.', diagnostics(target))
  }

  function tryAutoplay() {
    // The embed must be more than half visible before YouTube permits scripted autoplay.
    if (signal.aborted || !pendingAutoplay || !readyPlayer || document.hidden || visibility <= .5) return
    const mode = pendingAutoplay
    pendingAutoplay = undefined
    play(readyPlayer, mode, mode === 'muted' ? 'muted-after-block' : source)
  }

  const observer = new IntersectionObserver(([entry]) => {
    visibility = entry.intersectionRatio
    tryAutoplay()
  }, { threshold: .5001 })
  observer.observe(frame)
  document.addEventListener('visibilitychange', tryAutoplay, { signal })

  controls.play.hidden = controls.sound.hidden = true
  controls.sound.removeAttribute('data-audio-blocked')
  showStatus('동영상을 준비하고 있습니다…')
  controls.play.addEventListener('click', (event) => {
    if (!readyPlayer) return
    if (readyPlayer.getPlayerState() === 1) readyPlayer.pauseVideo()
    else {
      stopAutoplay()
      play(readyPlayer, 'manual', event.isTrusted ? 'retry-direct' : 'retry-dwell')
    }
  }, { signal })
  controls.sound.addEventListener('click', (event) => {
    if (!readyPlayer) return
    if (hasSound(readyPlayer)) {
      needsSound = false
      readyPlayer.mute()
      showStatus('')
      return
    }
    play(readyPlayer, 'manual', event.isTrusted ? 'unmute-direct' : 'unmute-dwell')
  }, { signal })

  const readyTimeout = window.setTimeout(() => {
    console.warn('[3CE YouTube] 플레이어 준비 시간이 초과됐습니다.', diagnostics())
    showStatus('플레이어 안의 재생 버튼을 누르거나 YouTube에서 보세요.')
  }, 10_000)
  void loadAPI().then(({ Player }) => {
    if (signal.aborted) return
    player = new Player(frame, { events: {
      onReady({ target }) {
        if (signal.aborted) return
        window.clearTimeout(readyTimeout)
        readyPlayer = target
        showStatus('')
        // Native player controls can change volume without sending a state change.
        controlsTimer = window.setInterval(() => {
          if (playbackTimer && target.getPlayerState() === 1 &&
            (attempt === 'muted' || hasSound(target))) showPlaying(target)
          else if (!controls.sound.hidden) updateSoundControl(target)
        }, 300)
        tryAutoplay()
      },
      onStateChange({ data, target }) {
        if (signal.aborted) return
        if (data === 1) {
          showPlaying(target)
          console.info('[3CE YouTube] 재생 상태입니다.', diagnostics(target))
        } else if ((data === 0 || data === 2) && !controls.play.hidden) {
          controls.play.textContent = '재생'
        }
      },
      onAutoplayBlocked({ target }) {
        if (signal.aborted) return
        clearPlaybackTimer()
        console.warn('[3CE YouTube] 브라우저가 자동재생을 차단했습니다.', diagnostics(target))
        if (attempt === 'audible') {
          pendingAutoplay = 'muted'
          tryAutoplay()
        } else {
          offerManual(attempt === 'manual'
            ? '영상 안의 재생 또는 스피커 버튼을 직접 눌러 주세요.'
            : '브라우저가 재생을 차단했습니다. 재생 버튼을 눌러 주세요.')
        }
      },
      onError({ data }) {
        if (signal.aborted) return
        window.clearTimeout(readyTimeout)
        clearPlaybackTimer()
        window.clearInterval(controlsTimer)
        stopAutoplay()
        readyPlayer = undefined
        controls.play.hidden = controls.sound.hidden = true
        console.warn('[3CE YouTube] 임베드 플레이어 오류.', { code: data, ...diagnostics() })
        showStatus(data === 153
          ? '플레이어에 연결하려면 웹사이트 주소에서 열어 주세요.'
          : '앱에서 이 영상을 재생할 수 없습니다. YouTube에서 볼 수 있습니다.')
      },
    } })
  }).catch((error) => {
    if (signal.aborted) return
    window.clearTimeout(readyTimeout)
    stopAutoplay()
    console.warn('[3CE YouTube] IFrame Player API를 초기화하지 못했습니다.', { error, ...diagnostics() })
    showStatus('플레이어 안의 재생 버튼을 누르거나 YouTube에서 보세요.')
  })

  return () => {
    lifetime.abort()
    window.clearTimeout(readyTimeout)
    clearPlaybackTimer()
    window.clearInterval(controlsTimer)
    stopAutoplay()
    player?.destroy()
    host.replaceChildren()
  }
}
