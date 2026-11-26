// This small navigation helper is safe on Test2: it imports no game code or CSS.
// Record the list anchor before a same-tab game visit so browser Back also
// restores the list when Test2's existing media initialization completes.
function rememberList(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-pillow-entry]') : null
  if (!link || (link.target && link.target !== '_self')) return
  const returnURL = new URL(window.location.href)
  returnURL.hash = 'experiments'
  history.replaceState(history.state, '', returnURL)
}

document.addEventListener('click', rememberList)
if (import.meta.hot) import.meta.hot.dispose(() => document.removeEventListener('click', rememberList))
