import './style.css'
import { connectDesktop } from '../shared/desktop-host.ts'
import { icon } from '../../src/ui/icons.ts'
import { channelHandle, officialVideos } from './channel.ts'
import type { ChannelVideo } from './channel.ts'
import { snapshot } from './snapshot.ts'
import { mountVideoPlayer } from './player.ts'

const app = document.querySelector<HTMLElement>('#app')!
app.innerHTML = `
  <header class="channel-header">
    <button class="channel-home" type="button" data-home aria-label="3CE 영상 목록">
      <span class="youtube-mark" aria-hidden="true"></span><span>YouTube</span>
    </button>
    <form class="channel-search" role="search">
      <input type="search" aria-label="3CE 공식 영상 검색" placeholder="3CE 영상 검색" autocomplete="off">
      <button type="submit" aria-label="검색">${icon('search')}</button>
    </form>
    <div class="channel-tools">
      <button type="button" class="channel-button channel-library-link" data-back hidden>영상 목록</button>
      <button type="button" class="channel-button channel-refresh" data-refresh aria-label="영상 목록 새로고침" title="영상 목록 새로고침">${icon('refresh')}</button>
      <a class="channel-avatar" href="https://www.youtube.com/${channelHandle}/videos" target="_blank" rel="noopener noreferrer" aria-label="3CE 공식 YouTube 채널">3CE</a>
    </div>
  </header>
  <main class="channel-body">
    <section class="channel-library" aria-label="3CE 영상 목록">
      <div class="channel-banner" aria-hidden="true"></div>
      <div class="channel-identity">
        <span class="channel-avatar" aria-hidden="true">3CE</span>
        <div><h1>3CE</h1><p>${channelHandle} <span>· 3CE 공식 채널</span></p></div>
      </div>
      <h2 class="channel-section-title">Videos</h2>
      <p class="channel-status" data-feed-status role="status"></p>
      <p class="channel-status" data-search-status role="status"></p>
      <div class="channel-grid"></div>
    </section>
    <section class="channel-screen" aria-label="영상 재생" hidden>
      <div class="channel-watch">
        <div class="channel-player" data-hide-hand-cursor></div>
        <h2 class="channel-video-title"></h2>
        <div class="watch-toolbar">
          <a class="watch-author" href="https://www.youtube.com/${channelHandle}/videos" target="_blank" rel="noopener noreferrer">
            <span class="channel-avatar" aria-hidden="true">3CE</span><span><strong>3CE</strong><small>${channelHandle}</small></span>
          </a>
          <div class="channel-actions">
            <button type="button" class="channel-button" data-play hidden>재생</button>
            <button type="button" class="channel-button" data-sound hidden>소리 켜기</button>
            <a class="channel-button channel-external" data-watch target="_blank" rel="noopener noreferrer">YouTube에서 보기 ↗</a>
          </div>
        </div>
        <p class="channel-status" data-player-status role="status"></p>
      </div>
      <aside class="channel-recommendations" aria-label="3CE의 다른 영상">
        <h2>3CE 영상</h2>
        <div class="channel-up-next"></div>
      </aside>
    </section>
  </main>
  <footer class="channel-policy">
    <details>
      <summary>영상 이용 및 개인정보 안내</summary>
      <p>이 앱은 YouTube IFrame Player를 사용합니다. 썸네일과 재생을 요청하면 IP 주소와 브라우저 정보가 Google에 전달됩니다. 재생 중 YouTube가 광고나 쿠키 등의 기술을 사용할 수 있습니다.</p>
      <p>앱은 3CE 공식 채널의 영상 제목과 ID를 목록 표시를 위해 임시로 저장합니다.</p>
      <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google 개인정보처리방침</a>
    </details>
    <p id="video-terms">이 앱을 이용하면 이 안내와 <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube 서비스 약관</a>에 동의합니다.</p>
  </footer>
`
const library = app.querySelector<HTMLElement>('.channel-library')!
const screen = app.querySelector<HTMLElement>('.channel-screen')!
const grid = app.querySelector<HTMLElement>('.channel-grid')!
const body = app.querySelector<HTMLElement>('.channel-body')!
const searchForm = app.querySelector<HTMLFormElement>('.channel-search')!
const searchInput = searchForm.querySelector<HTMLInputElement>('input')!
const searchStatus = app.querySelector<HTMLElement>('[data-search-status]')!
const upNext = app.querySelector<HTMLElement>('.channel-up-next')!
const banner = app.querySelector<HTMLElement>('.channel-banner')!
const refresh = app.querySelector<HTMLButtonElement>('[data-refresh]')!
const back = app.querySelector<HTMLButtonElement>('[data-back]')!
const feedStatus = app.querySelector<HTMLElement>('[data-feed-status]')!
const watch = app.querySelector<HTMLAnchorElement>('[data-watch]')!
const lifetime = new AbortController()
const { signal } = lifetime
const endpoint = import.meta.env.VITE_YOUTUBE_FEED_URL || '../../api/3ce-videos'
const storedListMaxAge = 30 * 24 * 60 * 60 * 1000
let disposePlayer: (() => void) | undefined
let selectedVideoId: string | undefined
let libraryScroll = 0
let startFirstVideo = true
let availableVideos: ChannelVideo[] = []
let searchTerm = ''
const launchInput = (window.frameElement as HTMLElement | null)?.dataset.launchInput ?? 'standalone'

function openVideo(video: ChannelVideo, source: string) {
  if (disposePlayer && selectedVideoId === video.id) return
  disposePlayer?.()
  selectedVideoId = video.id
  if (!library.hidden) libraryScroll = body.scrollTop
  library.hidden = true
  screen.hidden = false
  back.hidden = false
  body.scrollTop = 0
  back.focus({ preventScroll: true })
  watch.href = `https://www.youtube.com/watch?v=${video.id}`
  app.querySelector('.channel-video-title')!.textContent = video.title
  disposePlayer = mountVideoPlayer(app.querySelector('.channel-player')!, video.id, {
    play: app.querySelector('[data-play]')!,
    sound: app.querySelector('[data-sound]')!,
    status: app.querySelector('[data-player-status]')!,
  }, source)
  renderRecommendations()
}

function videoCard(video: ChannelVideo) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'channel-video'
  button.dataset.video = video.id
  button.setAttribute('aria-describedby', 'video-terms')
  const thumbnail = document.createElement('img')
  thumbnail.alt = ''
  thumbnail.src = `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`
  thumbnail.referrerPolicy = 'strict-origin-when-cross-origin'
  thumbnail.loading = 'lazy'
  thumbnail.decoding = 'async'
  const details = document.createElement('span')
  const title = document.createElement('strong')
  title.textContent = video.title
  const author = document.createElement('small')
  author.textContent = '3CE'
  details.append(title, author)
  button.append(thumbnail, details)
  button.addEventListener('click', (event) => openVideo(video, event.isTrusted ? 'video-direct' : 'video-dwell'))
  return button
}

function renderRecommendations() {
  const others = availableVideos.filter((video) => video.id !== selectedVideoId)
  upNext.replaceChildren(...others.map(videoCard))
  upNext.parentElement!.hidden = !others.length
}

function renderLibrary() {
  const visible = availableVideos.filter(({ title }) => `${title} 3ce ${channelHandle}`.toLocaleLowerCase().includes(searchTerm))
  grid.replaceChildren(...visible.map(videoCard))
  searchStatus.textContent = searchTerm && !visible.length ? '검색 결과가 없습니다.' : ''
}

function renderVideos(videos: ChannelVideo[]) {
  availableVideos = videos
  banner.replaceChildren()
  if (videos.length) {
    const image = new Image()
    const thumbnails = `https://i.ytimg.com/vi/${videos[0].id}`
    image.alt = ''
    image.loading = 'lazy'
    image.addEventListener('error', () => { image.src = `${thumbnails}/hqdefault.jpg` }, { once: true })
    image.src = `${thumbnails}/maxresdefault.jpg`
    banner.append(image)
  }
  renderLibrary()
  renderRecommendations()
  if (startFirstVideo && videos.length) {
    startFirstVideo = false
    openVideo(videos[0], `app-${launchInput}`)
  }
}

function showLibrary() {
  disposePlayer?.()
  disposePlayer = undefined
  screen.hidden = true
  back.hidden = true
  library.hidden = false
  body.scrollTop = libraryScroll
}

function goToLibrary() {
  showLibrary()
  const opener = grid.querySelector<HTMLButtonElement>(`[data-video="${selectedVideoId}"]`)
  ;(opener ?? searchInput).focus({ preventScroll: true })
}

back.addEventListener('click', goToLibrary, { signal })
app.querySelector('[data-home]')!.addEventListener('click', goToLibrary, { signal })

searchForm.addEventListener('submit', (event) => {
  event.preventDefault()
  searchTerm = searchInput.value.trim().toLocaleLowerCase()
  renderLibrary()
  showLibrary()
  body.scrollTop = 0
}, { signal })

searchInput.addEventListener('search', () => {
  if (searchInput.value) return
  searchTerm = ''
  renderLibrary()
}, { signal })

function savedVideos() {
  const age = Date.now() - Date.parse(snapshot.fetchedAt)
  return age < storedListMaxAge ? officialVideos(snapshot.videos) : []
}

async function loadVideos() {
  if (refresh.disabled) return
  refresh.disabled = true
  if (!availableVideos.length) feedStatus.textContent = '최신 영상을 불러오고 있습니다…'
  try {
    const response = await fetch(new URL(endpoint, location.href), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    })
    if (!response.ok) throw new Error('Feed unavailable')
    const data = await response.json()
    if (signal.aborted) return
    const videos = officialVideos(data?.videos)
    renderVideos(videos)
    feedStatus.textContent = videos.length ? '' : '설정한 가로형 영상 중 재생할 수 있는 3CE 영상이 없습니다.'
  } catch (error) {
    if (signal.aborted) return
    console.warn('[3CE YouTube] 정상 영상 목록을 불러오지 못했습니다.', error)
    if (!availableVideos.length) renderVideos(savedVideos())
    feedStatus.textContent = availableVideos.length
      ? '최신 목록을 불러오지 못해 마지막으로 확인한 영상을 표시합니다.'
      : '영상 목록을 불러오지 못했습니다. 연결을 확인하고 새로고침해 주세요.'
  } finally {
    refresh.disabled = false
  }
}

refresh.addEventListener('click', () => { void loadVideos() }, { signal })
function dispose() {
  lifetime.abort()
  disposePlayer?.()
  disposePlayer = undefined
}
connectDesktop(null, { dispose })
window.addEventListener('pagehide', dispose, { once: true })
// Launch from verified cached metadata while the current channel list refreshes.
renderVideos(savedVideos())
void loadVideos()
