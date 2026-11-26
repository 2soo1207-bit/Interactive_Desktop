import './showroom.css'
import { SHOWROOM_SHADES, SHOWROOM_PRODUCT_NAME } from './showroom-shades.ts'
import type { ShowroomShade } from './showroom-shades.ts'

/** Independent ending presentation; it never writes game or collection state. */
export class PillowShowroom {
  readonly element: HTMLElement
  private product: HTMLElement
  private texture: HTMLElement
  private label: HTMLElement
  private name: HTMLElement
  private number: HTMLElement
  private announcement: HTMLElement
  private buttons: HTMLButtonElement[] = []
  private pending = new Set<HTMLImageElement>()
  private animations: Animation[] = []
  private revision = 0
  private requested = -1
  private selected = -1
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(parent: HTMLElement) {
    this.element = document.createElement('section')
    this.element.className = 'pt-showroom'
    this.element.hidden = true
    this.element.setAttribute('aria-label', '13 쉐이드 제품 쇼룸')
    this.element.innerHTML = `
      <div class="pt-showroom-scene">
        <div class="pt-feature-texture"></div>
        <p class="pt-feature-label"><span class="pt-feature-number"></span> <span class="pt-feature-name"></span></p>
        <div class="pt-feature-product" aria-busy="true"></div>
      </div>
      <div class="pt-archive">
        <h3>13 SHADE ARCHIVE</h3>
        <div class="pt-archive-list" role="group" aria-label="쉐이드 선택"></div>
      </div>
      <p class="pt-showroom-announcement" role="status" aria-live="polite"></p>`
    this.product = this.element.querySelector('.pt-feature-product')!
    this.texture = this.element.querySelector('.pt-feature-texture')!
    this.label = this.element.querySelector('.pt-feature-label')!
    this.name = this.label.querySelector('.pt-feature-name')!
    this.number = this.element.querySelector('.pt-feature-number')!
    this.announcement = this.element.querySelector('.pt-showroom-announcement')!
    const list = this.element.querySelector('.pt-archive-list')!
    for (const shade of SHOWROOM_SHADES) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'pt-archive-shade'
      button.dataset.shade = String(shade.id)
      button.setAttribute('aria-label', `${shade.number} ${shade.name}`)
      button.setAttribute('aria-pressed', 'false')
      const image = document.createElement('img')
      image.src = shade.thumbnail ?? shade.product ?? ''
      image.alt = ''
      image.width = 160; image.height = 160
      image.loading = 'lazy'; image.decoding = 'async'
      if (!shade.thumbnail && !shade.product) image.hidden = true
      image.addEventListener('error', () => { image.hidden = true })
      const label = document.createElement('span')
      label.textContent = shade.number
      button.append(image, label)
      button.addEventListener('click', () => { void this.select(shade.id) })
      button.addEventListener('keydown', event => {
        const index = this.buttons.indexOf(button)
        const next = event.key === 'ArrowRight' ? (index + 1) % this.buttons.length
          : event.key === 'ArrowLeft' ? (index + this.buttons.length - 1) % this.buttons.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? this.buttons.length - 1 : -1
        if (next < 0) return
        event.preventDefault(); this.buttons[next].focus()
        void this.select(SHOWROOM_SHADES[next].id)
      })
      this.buttons.push(button); list.append(button)
    }
    parent.append(this.element)
  }

  show(initialId: number) {
    this.element.hidden = false
    this.element.classList.add('is-entering')
    void this.select(SHOWROOM_SHADES.some(shade => shade.id === initialId) ? initialId : SHOWROOM_SHADES[0]?.id ?? -1)
  }

  hide() {
    this.revision++; this.requested = -1; this.selected = -1
    this.cancelPending()
    this.animations.forEach(animation => animation.cancel())
    this.animations.length = 0
    this.element.hidden = true
    this.element.classList.remove('is-entering')
    this.product.replaceChildren(); this.texture.replaceChildren()
    this.name.textContent = ''; this.number.textContent = ''; this.announcement.textContent = ''
    this.buttons.forEach(button => button.setAttribute('aria-pressed', 'false'))
  }

  private cancelPending() {
    for (const image of this.pending) image.removeAttribute('src')
    this.pending.clear()
  }

  private async image(url: string | null, alt: string): Promise<HTMLImageElement | null> {
    if (!url) return null
    const image = new Image()
    image.alt = alt; image.decoding = 'async'
    this.pending.add(image)
    image.src = url
    try { await image.decode(); return image }
    catch (error) {
      if (image.hasAttribute('src')) console.warn('[Pillow showroom] Image unavailable:', url, error)
      return null
    } finally { this.pending.delete(image) }
  }

  private placeholder(label: string) {
    const message = document.createElement('p')
    message.className = 'pt-showroom-placeholder'; message.textContent = label
    return message
  }

  private replaceArtwork(host: HTMLElement, image: HTMLElement, first: boolean, delay: number) {
    host.querySelectorAll('.pt-outgoing').forEach(element => element.remove())
    const previous = host.firstElementChild
    if (this.reducedMotion) { host.replaceChildren(image); return }
    if (previous) {
      previous.classList.add('pt-outgoing')
      const fade = previous.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, delay, fill: 'forwards' })
      this.animations.push(fade)
      void fade.finished.then(() => previous.remove(), () => previous.remove())
    }
    host.append(image)
    this.animations.push(image.animate([
      { opacity: 0, translate: `0 ${first ? 22 : 10}px` },
      { opacity: 1, translate: '0 0' },
    ], { duration: first ? 750 : 420, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' }))
  }

  async select(id: number) {
    const shade: ShowroomShade | undefined = SHOWROOM_SHADES.find(entry => entry.id === id)
    if (!shade || this.element.hidden || this.requested === id) return
    const revision = ++this.revision
    this.requested = id
    this.cancelPending()
    this.product.setAttribute('aria-busy', 'true')
    this.announcement.textContent = `${shade.number} ${shade.name} 불러오는 중`
    // Keep the existing pair visible until BOTH new images are decoded.
    // Revision checks also stop rapid archive taps from committing stale pairs.
    const [product, texture] = await Promise.all([
      this.image(shade.product, `${SHOWROOM_PRODUCT_NAME} — ${shade.number} ${shade.name}`),
      this.image(shade.texture, `${shade.name} 립 텍스처`),
    ])
    if (revision !== this.revision || this.element.hidden) return
    this.animations.forEach(animation => animation.cancel())
    this.animations.length = 0
    const first = this.selected === -1
    this.selected = id
    this.replaceArtwork(this.product, product ?? this.placeholder('PRODUCT IMAGE COMING SOON'), first, 0)
    this.replaceArtwork(this.texture, texture ?? this.placeholder('TEXTURE COMING SOON'), first, 70)
    this.name.textContent = shade.name; this.number.textContent = `${shade.number}.`
    this.product.setAttribute('aria-busy', 'false')
    this.buttons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.shade) === id)))
    this.announcement.textContent = `${shade.number} ${shade.name}`
    if (!this.reducedMotion) {
      this.animations.push(this.label.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, fill: 'backwards' }))
    }
  }

  dispose() { this.hide(); this.element.remove() }
}
