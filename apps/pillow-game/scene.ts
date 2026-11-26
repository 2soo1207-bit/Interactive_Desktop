import * as THREE from 'three'
import { SHADES } from './shades.ts'
import type { PillowBody } from './physics.ts'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createCushionGeometry, createSatinMaterials, createSatinWeave, configureProductTexture } from './cushion.ts'

type Product = { root: THREE.Group; tilt: THREE.Group; shadow: THREE.Mesh; mesh: THREE.Group }
const clamp = THREE.MathUtils.clamp
const soft = (x: number) => x * x * (3 - 2 * x)

export class PillowScene {
  readonly canvas: HTMLCanvasElement
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-600, 600, 900, 0, .1, 4000)
  private products: Product[] = []
  private resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture | THREE.WebGLRenderTarget>()
  private viewHeight = 940
  private aspect = 1
  private shadowTexture: THREE.CanvasTexture
  private confetti: THREE.Points
  private confettiSeeds: Float32Array
  private disposed = false
  private ready = false
  private previews = new Map<number, string>()

  getPreview(id: number) { return this.previews.get(id) }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    const room = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const environment = pmrem.fromScene(room, .04)
    this.scene.environment = environment.texture
    this.resources.add(environment)
    room.dispose(); pmrem.dispose()
    this.camera.position.z = 1800
    this.scene.add(new THREE.AmbientLight(0xffffff, .35))
    const key = new THREE.DirectionalLight(0xfff6ef, 2.5)
    key.position.set(-350, 900, 900); this.scene.add(key)
    const fill = new THREE.DirectionalLight(0xe4e7fa, 1.1)
    fill.position.set(400, 200, -500); this.scene.add(fill)
    const shadow = document.createElement('canvas'); shadow.width = 128; shadow.height = 64
    const ctx = shadow.getContext('2d')!, gradient = ctx.createRadialGradient(64, 32, 0, 64, 32, 60)
    gradient.addColorStop(0, 'rgba(40,20,28,.48)'); gradient.addColorStop(1, 'rgba(40,20,28,0)')
    ctx.scale(1, .5); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128)
    this.shadowTexture = new THREE.CanvasTexture(shadow); this.resources.add(this.shadowTexture)
    const points = new Float32Array(90 * 3), seeds = new Float32Array(90 * 4)
    for (let i = 0; i < 90; i++) {
      seeds[i * 4] = Math.random() * Math.PI * 2; seeds[i * 4 + 1] = 90 + Math.random() * 430
      seeds[i * 4 + 2] = Math.random() * 600; seeds[i * 4 + 3] = .5 + Math.random()
    }
    this.confettiSeeds = seeds
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(points, 3))
    const material = new THREE.PointsMaterial({ color: 0xe0ec89, size: 5, transparent: true, opacity: .85, depthWrite: false })
    this.resources.add(geometry); this.resources.add(material)
    this.confetti = new THREE.Points(geometry, material); this.confetti.visible = false; this.scene.add(this.confetti)
  }

  async load(onProgress: (loaded: number, total: number) => void) {
    const geometry = createCushionGeometry()
    Object.values(geometry).forEach(g => this.resources.add(g))
    const weave = createSatinWeave()
    weave.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy())
    this.resources.add(weave)
    const shadowGeometry = new THREE.PlaneGeometry(285, 35)
    this.resources.add(shadowGeometry)
    let next = 0, loaded = 0
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (next < SHADES.length && !this.disposed) {
        const shade = SHADES[next++]
        const image = new Image(); image.decoding = 'async'; image.src = shade.front
        await image.decode()
        if (this.disposed) return
        const photograph = new THREE.Texture(image)
        configureProductTexture(photograph, shade)
        photograph.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy())
        this.resources.add(photograph)
        const materials = createSatinMaterials(shade.color, weave, photograph)
        Object.values(materials).forEach(material => this.resources.add(material))
        const root = new THREE.Group(), tilt = new THREE.Group(), mesh = new THREE.Group()
        mesh.add(new THREE.Mesh(geometry.front, materials.front), new THREE.Mesh(geometry.back, materials.cloth), new THREE.Mesh(geometry.piping, materials.piping))
        tilt.add(mesh); root.add(tilt)
        const sm = new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, opacity: .5, depthWrite: false })
        this.resources.add(sm)
        const shadow = new THREE.Mesh(shadowGeometry, sm); shadow.position.set(0, -34, -130)
        root.add(shadow); root.visible = false; this.scene.add(root)
        this.products[shade.id] = { root, tilt, mesh, shadow }
        onProgress(++loaded, SHADES.length)
      }
    }))
    if (this.disposed) return
    this.capturePreviews()
    this.ready = !this.disposed
  }

  // Front previews use the same source-mapped soft volume, including the real
  // lid, ring and logo. No separate approximated collection illustration.
  private capturePreviews() {
    const previousSize = this.renderer.getSize(new THREE.Vector2()), ratio = this.renderer.getPixelRatio()
    const camera = new THREE.OrthographicCamera(-151, 151, 138, -138, .1, 1000)
    camera.position.set(0, 0, 500)
    this.renderer.setPixelRatio(1); this.renderer.setSize(302, 276, false)
    for (const shade of SHADES) {
      const product = this.products[shade.id]
      product.root.visible = true; product.shadow.visible = false
      product.tilt.rotation.set(Math.PI / 2, 0, 0)
      this.renderer.render(this.scene, camera)
      this.previews.set(shade.id, this.canvas.toDataURL('image/png'))
      product.root.visible = false; product.shadow.visible = true
    }
    this.renderer.setPixelRatio(ratio); this.renderer.setSize(previousSize.x, previousSize.y, false)
  }

  resize(width: number, height: number) {
    this.aspect = width / Math.max(1, height)
    this.renderer.setSize(width, height, false)
  }

  render(bodies: PillowBody[], active: PillowBody | null, now: number, mode: 'intro' | 'game' | 'won', appearance = 1) {
    if (!this.ready || this.disposed) return
    this.products.forEach(p => { p.root.visible = false })
    let top = 500
    const list = active ? [...bodies, active] : bodies
    for (const body of list) {
      const p = this.products[body.shade]
      if (!p) continue
      p.root.visible = true
      p.root.position.set(body.x, body.y, body.id * .6)
      p.root.rotation.z = body.angle
      const squash = clamp(body.compression, -.16, .36)
      p.root.scale.set(1 + squash * .27, 1 - squash, 1 + squash * .1).multiplyScalar(appearance)
      const lay = soft(clamp(body.lay, 0, 1))
      const turn = Math.sin(Math.PI * lay)
      p.tilt.rotation.set((Math.PI / 2) * (1 - lay) + .025 * lay,
        body.side * (.1 * lay + .28 * turn), body.side * (.012 * lay + .08 * turn))
      const shadeOpacity = active === body ? lay * .22 : .5
      ;(p.shadow.material as THREE.MeshBasicMaterial).opacity = shadeOpacity
      top = Math.max(top, body.y + (active === body ? 160 : 90))
    }
    // Keep the whole tower visible; zoom out only when the growing stack needs it.
    const desired = Math.max(mode === 'intro' ? 840 : 720, top + 125, 760 / this.aspect)
    this.viewHeight += (desired - this.viewHeight) * .065
    const bottom = -this.viewHeight * .09
    this.camera.left = -this.viewHeight * this.aspect / 2
    this.camera.right = -this.camera.left
    this.camera.bottom = bottom; this.camera.top = bottom + this.viewHeight
    this.camera.updateProjectionMatrix()
    this.confetti.visible = mode === 'won'
    if (mode === 'won') {
      const attr = this.confetti.geometry.getAttribute('position')
      for (let i = 0; i < attr.count; i++) {
        const phase = this.confettiSeeds[i * 4], radius = this.confettiSeeds[i * 4 + 1]
        const t = now * .00012 * this.confettiSeeds[i * 4 + 3]
        attr.setXYZ(i, Math.cos(phase + t) * radius, ((this.confettiSeeds[i * 4 + 2] + now * .055) % 1200) - 40, 100 + Math.sin(phase) * 100)
      }
      attr.needsUpdate = true
    }
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.disposed = true
    this.resources.forEach(resource => resource.dispose()); this.resources.clear()
    this.renderer.dispose(); this.scene.clear()
  }
}
