import './style.css'
import { icon } from '../../src/ui/icons.ts'
import { connectDesktop } from '../shared/desktop-host.ts'
import { maxMessage, maxNickname, memoStore, pageSize } from './store.ts'
import type { Draft, Memo } from './store.ts'

const app = document.querySelector<HTMLElement>('#app')!
app.innerHTML = `
  <section class="memo-compose" aria-labelledby="guestbook-title">
    <header class="memo-intro" lang="en">
      <h1 id="guestbook-title">GUESTBOOK</h1>
      <p>Leave a little note.</p>
    </header>
    <form class="memo-form">
      <label for="nickname" lang="en">Nickname</label>
      <input id="nickname" name="nickname" type="text" maxlength="${maxNickname}" required autocomplete="nickname">
      <label for="message" lang="en">Message</label>
      <textarea id="message" name="message" maxlength="${maxMessage}" required rows="5"></textarea>
      <button class="memo-publish" type="submit" lang="en">LEAVE A MESSAGE +</button>
    </form>
    <p class="memo-status" data-message role="status"></p>
    <p class="memo-storage" data-storage></p>
  </section>
  <section class="memo-feed" aria-labelledby="messages-title">
    <header class="memo-feed-header">
      <h2 id="messages-title" lang="en">MESSAGES</h2>
      <div class="memo-tools">
        <button type="button" data-recent aria-label="최근 7일" title="최근 7일" aria-pressed="false">${icon('clock')}</button>
        <button type="button" data-search aria-label="메시지 검색" title="메시지 검색" aria-expanded="false" aria-controls="message-search">${icon('search')}</button>
        <button type="button" data-refresh aria-label="새로고침" title="새로고침">${icon('refresh')}</button>
      </div>
    </header>
    <div class="memo-search" id="message-search" hidden>
      <input type="search" aria-label="불러온 메시지에서 검색" placeholder="이름 또는 메시지 검색" autocomplete="off">
    </div>
    <div class="memo-scroll" tabindex="0" role="region" aria-label="방문자 메시지">
      <p class="memo-status" data-list-status role="status"></p>
      <ol class="memo-list"></ol>
      <button type="button" class="memo-more" data-more hidden>이전 메시지 더 보기</button>
    </div>
  </section>
`

const form = app.querySelector<HTMLFormElement>('form')!
const nickname = form.querySelector<HTMLInputElement>('#nickname')!
const message = form.querySelector<HTMLTextAreaElement>('#message')!
const submit = form.querySelector<HTMLButtonElement>('button')!
const status = app.querySelector<HTMLElement>('[data-message]')!
const listStatus = app.querySelector<HTMLElement>('[data-list-status]')!
const list = app.querySelector<HTMLOListElement>('.memo-list')!
const scroller = app.querySelector<HTMLElement>('.memo-scroll')!
const refresh = app.querySelector<HTMLButtonElement>('[data-refresh]')!
const more = app.querySelector<HTMLButtonElement>('[data-more]')!
const recent = app.querySelector<HTMLButtonElement>('[data-recent]')!
const searchToggle = app.querySelector<HTMLButtonElement>('[data-search]')!
const searchRow = app.querySelector<HTMLElement>('.memo-search')!
const search = searchRow.querySelector<HTMLInputElement>('input')!
const lifetime = new AbortController()
const { signal } = lifetime
const date = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })

let store: ReturnType<typeof memoStore> | undefined
let entries: Memo[] = []
let pendingDraft: Draft | undefined
let busy = false
let recentOnly = false
let hasMore = false
let listError = ''

try {
  store = memoStore(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  app.querySelector('[data-storage]')!.textContent = store.shared ? '공개 방명록' : '이 브라우저에 저장'
} catch {
  listError = '공유 방명록의 연결 설정을 확인해 주세요.'
  submit.disabled = true
  refresh.disabled = true
}

function renderList() {
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  since.setDate(since.getDate() - 6)
  const query = search.value.trim().toLocaleLowerCase()
  const filtered = entries.filter((entry) =>
    (!recentOnly || new Date(entry.createdAt) >= since) &&
    (!query || entry.nickname.toLocaleLowerCase().includes(query) || entry.message.toLocaleLowerCase().includes(query)),
  )
  list.replaceChildren(...filtered.map((entry) => {
    const item = document.createElement('li')
    const body = document.createElement('p')
    body.className = 'memo-message'
    body.textContent = entry.message
    const meta = document.createElement('div')
    meta.className = 'memo-meta'
    const name = document.createElement('span')
    name.textContent = entry.nickname
    const time = document.createElement('time')
    time.dateTime = entry.createdAt
    time.textContent = date.format(new Date(entry.createdAt))
    meta.append(name, time)
    item.append(body, meta)
    return item
  }))
  listStatus.textContent = listError || (filtered.length ? ''
    : query ? '검색 결과가 없습니다.'
    : recentOnly ? '최근 7일 동안 남긴 메시지가 없습니다.'
    : '첫 번째 메시지를 남겨보세요.')
  const oldest = entries.at(-1)
  more.hidden = !hasMore || Boolean(recentOnly && oldest && new Date(oldest.createdAt) < since)
}

function setBusy(value: boolean) {
  busy = submit.disabled = refresh.disabled = more.disabled = value
}

async function loadList(before?: Memo) {
  if (!store || busy) return
  setBusy(true)
  if (!entries.length) listStatus.textContent = '메시지를 불러오고 있습니다…'
  try {
    const page = await store.list(before, signal)
    if (signal.aborted) return
    const known = before ? entries : []
    const ids = new Set(known.map(({ id }) => id))
    entries = [...known, ...page.slice(0, pageSize).filter(({ id }) => !ids.has(id))]
    hasMore = page.length > pageSize
    listError = ''
    renderList()
  } catch {
    if (!signal.aborted) {
      listError = '메시지를 불러오지 못했습니다. 다시 시도해 주세요.'
      renderList()
    }
  } finally {
    setBusy(false)
  }
}

function applyFilters() {
  scroller.scrollTop = 0
  renderList()
}

function showSearch(open: boolean) {
  searchRow.hidden = !open
  searchToggle.setAttribute('aria-expanded', String(open))
  if (open) search.focus()
  else if (search.value) {
    search.value = ''
    applyFilters()
  }
}

recent.addEventListener('click', () => {
  recentOnly = !recentOnly
  recent.setAttribute('aria-pressed', String(recentOnly))
  applyFilters()
}, { signal })
searchToggle.addEventListener('click', () => showSearch(searchRow.hidden === true), { signal })
search.addEventListener('input', applyFilters, { signal })
search.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  event.preventDefault()
  showSearch(false)
  searchToggle.focus()
}, { signal })
refresh.addEventListener('click', () => { void loadList() }, { signal })
more.addEventListener('click', () => { void loadList(entries.at(-1)) }, { signal })

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!store || busy) return
  const cleanName = nickname.value.trim()
  const cleanMessage = message.value.trim()
  if (!cleanName || !cleanMessage || cleanName.length > maxNickname || cleanMessage.length > maxMessage) {
    status.textContent = '닉네임과 메시지를 입력하고 길이를 확인해 주세요.'
    return
  }
  const draft = pendingDraft?.nickname === cleanName && pendingDraft.message === cleanMessage
    ? pendingDraft
    : { id: crypto.randomUUID(), nickname: cleanName, message: cleanMessage }
  pendingDraft = draft
  setBusy(true)
  nickname.readOnly = true
  message.readOnly = true
  status.textContent = '등록하고 있습니다…'
  try {
    const memo = await store.save(draft, signal)
    if (signal.aborted) return
    pendingDraft = undefined
    form.reset()
    entries = [memo, ...entries.filter(({ id }) => id !== memo.id)]
    search.value = ''
    applyFilters()
    status.textContent = '메시지를 남겼습니다.'
  } catch {
    if (!signal.aborted) status.textContent = '메시지를 저장하지 못했습니다. 다시 시도해 주세요.'
  } finally {
    setBusy(false)
    nickname.readOnly = false
    message.readOnly = false
  }
}, { signal })

function dispose() {
  lifetime.abort()
  store?.close?.()
}
connectDesktop(null, { dispose })
window.addEventListener('pagehide', dispose, { once: true })
if (store) void loadList()
else renderList()
