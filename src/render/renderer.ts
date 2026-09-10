// three.js driver. Reads State, draws it. Never mutates State.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import type { Boss, Feature, GameEvent, Npc, Pickup, Prop, PropKind, State } from '../sim/types.ts'
import { bossPhase, currentLevel, duoRadius, screamRange } from '../sim/sim.ts'

const PICKUP_COLOR: Record<string, number> = {
  milk: 0xffffff,
  pacifier: 0xffd23f,
  rattle: 0xff8fab,
  clock: 0xffd23f,
  skateboard: 0xff8fab,
  quad: 0xff5c5c,
  megaphone: 0xff5c5c,
  fedora: 0x9b6bff,
  wings: 0xbfe6ff,
  goggles: 0x4cd137,
  potato: 0xd9a066,
  conga: 0xff8fab,
  giant: 0x4cd137,
  lantern: 0xff3b3b,
}
import { ASSETS } from './assets.ts'
import { Particles } from './particles.ts'

const MAX_DEBRIS = 700
const MAX_SPLATS = 220

function toonGradient(): THREE.DataTexture {
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255])
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.needsUpdate = true
  return tex
}

interface Flashable {
  mats: THREE.MeshToonMaterial[]
}

export class Renderer {
  readonly gl: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  private gradient = toonGradient()
  private loader = new GLTFLoader()
  private sun: THREE.DirectionalLight
  private ground: THREE.Mesh | null = null
  private sand: THREE.Mesh | null = null
  private water: THREE.Mesh | null = null
  private board: THREE.Group
  private propViews = new Map<number, THREE.Group & Flashable>()
  private npcViews = new Map<number, THREE.Group & Flashable & { eyes: THREE.Object3D; body: THREE.Object3D }>()
  private poopViews = new Map<number, THREE.Mesh>()
  private poopGeo = new THREE.SphereGeometry(0.22, 10, 8)
  private poopMat: THREE.MeshToonMaterial
  private pickupViews = new Map<number, THREE.Group>()
  private featureViews = new Map<number, THREE.Object3D>()
  private bombViews = new Map<number, THREE.Mesh>()
  private chargeCone: THREE.Mesh
  private hemi: THREE.HemisphereLight
  private spot: THREE.SpotLight
  private stage: THREE.Group | null = null
  private bossMode = 0
  private themeSky = new THREE.Color(0x9fd8ff)
  private themeFog = new THREE.Color(0xbfe6ff)
  private nightSky = new THREE.Color(0x1a1233)
  private tmpC = new THREE.Color()
  private quad: THREE.Group
  private hat: THREE.Group
  private wings: THREE.Group
  private starTex: THREE.Texture | null = null
  private debris: THREE.InstancedMesh
  private splats: THREE.InstancedMesh
  private player: THREE.Group = new THREE.Group()
  private playerModel: THREE.Object3D | null = null
  private playerMixer: THREE.AnimationMixer | null = null
  private playerActions: Record<string, THREE.AnimationAction> = {}
  private playerCurrent = ''
  private playerMats: THREE.Material[] = []
  private duo: THREE.Group = new THREE.Group()
  private duoModel: THREE.Object3D | null = null
  private duoMixer: THREE.AnimationMixer | null = null
  private duoActions: Record<string, THREE.AnimationAction> = {}
  private duoCurrent = ''
  private duoBaseHeight = 1
  private duoMats: THREE.Material[] = []
  private boss: { group: THREE.Group; card: THREE.Mesh; overlay: THREE.Mesh; ring: THREE.Mesh; def: Boss['def']; h: number } | null = null
  private bossTextures = new Map<string, THREE.Texture>()
  private particles: Particles
  private rings: { mesh: THREE.Mesh; life: number; max: number; grow: number }[] = []
  private shake = 0
  private shakeX = 0
  private shakeZ = 0
  private camPos = new THREE.Vector3(0, 8, 9)
  private camTarget = new THREE.Vector3()
  private levelKey = ''
  private tmpM = new THREE.Matrix4()
  private tmpQ = new THREE.Quaternion()
  private tmpV = new THREE.Vector3()
  private tmpS = new THREE.Vector3()
  private tmpE = new THREE.Euler()
  private time = 0
  private giantScale = 1
  readonly lowEnd: boolean

  constructor(canvas: HTMLCanvasElement, touch: boolean) {
    this.lowEnd = touch
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' })
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, touch ? 1.75 : 2))
    this.gl.shadowMap.enabled = true
    this.gl.shadowMap.type = THREE.PCFShadowMap
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x55aa44, 0.9)
    this.scene.add(this.hemi)
    this.spot = new THREE.SpotLight(0xfff1c0, 0, 60, Math.PI / 5, 0.5, 1.2)
    this.spot.castShadow = false
    this.scene.add(this.spot)
    this.scene.add(this.spot.target)
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6)
    this.sun.position.set(12, 22, 8)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048)
    const sc = this.sun.shadow.camera
    sc.left = -26
    sc.right = 26
    sc.top = 26
    sc.bottom = -26
    sc.near = 1
    sc.far = 70
    this.sun.shadow.bias = -0.0008
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)
    this.poopMat = this.toon(0x6b3e1e)
    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.toon(0xffffff), MAX_DEBRIS)
    this.debris.count = 0
    this.debris.castShadow = true
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.scene.add(this.debris)
    const splatGeo = new THREE.CircleGeometry(1, 14)
    splatGeo.rotateX(-Math.PI / 2)
    this.splats = new THREE.InstancedMesh(splatGeo, new THREE.MeshBasicMaterial({ color: 0x5a3416 }), MAX_SPLATS)
    this.splats.count = 0
    this.splats.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.scene.add(this.splats)
    this.particles = new Particles(this.scene, this.gradient)
    const coneGeo = new THREE.CircleGeometry(1, 20, -Math.PI / 2 - Math.PI / 3, (Math.PI * 2) / 3)
    coneGeo.rotateX(-Math.PI / 2)
    this.chargeCone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.22, depthWrite: false }))
    this.chargeCone.position.y = 0.04
    this.chargeCone.visible = false
    this.scene.add(this.chargeCone)
    this.scene.add(this.player)
    this.scene.add(this.duo)
    this.board = this.makeSkateboard()
    this.board.visible = false
    this.scene.add(this.board)
    this.quad = this.makeQuad()
    this.quad.visible = false
    this.scene.add(this.quad)
    this.hat = this.makeHat()
    this.hat.visible = false
    this.player.add(this.hat)
    this.wings = this.makeWings()
    this.wings.visible = false
    this.player.add(this.wings)
    this.player.add(this.placeholderBaby())
    this.duo.add(this.placeholderBird())
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  toon(color: number): THREE.MeshToonMaterial {
    return new THREE.MeshToonMaterial({ color, gradientMap: this.gradient })
  }

  resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.gl.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.fov = w < h ? 62 : 50
    this.camera.updateProjectionMatrix()
  }

  // ------------------------------------------------------------ loading

  async load(): Promise<void> {
    await Promise.all([this.loadPlayer(), this.loadDuo()])
  }

  private async gltf(url: string): Promise<GLTF | null> {
    try {
      return await this.loader.loadAsync(url)
    } catch (e) {
      console.warn('model failed, using placeholder', url, e)
      return null
    }
  }

  private fitHeight(obj: THREE.Object3D, height: number): number {
    const box = new THREE.Box3().setFromObject(obj)
    const size = box.getSize(new THREE.Vector3())
    const s = height / (size.y || 1)
    obj.scale.setScalar(s)
    const box2 = new THREE.Box3().setFromObject(obj)
    obj.position.y -= box2.min.y
    obj.position.x -= (box2.min.x + box2.max.x) / 2
    obj.position.z -= (box2.min.z + box2.max.z) / 2
    return s
  }

  private prepModel(root: THREE.Object3D, mats: THREE.Material[]) {
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = true
        m.receiveShadow = false
        m.frustumCulled = false
        const list = Array.isArray(m.material) ? m.material : [m.material]
        mats.push(...list)
      }
    })
  }

  private async loadPlayer() {
    const g = await this.gltf(ASSETS.models.baby)
    if (!g) return
    const model = g.scene
    this.fitHeight(model, 1.05)
    this.prepModel(model, this.playerMats)
    const wrap = new THREE.Group()
    wrap.add(model)
    wrap.rotation.y = ASSETS.yaw.baby
    this.player.clear()
    this.player.add(wrap)
    this.playerModel = wrap
    this.playerMixer = new THREE.AnimationMixer(model)
    for (const clip of g.animations) this.playerActions[clip.name] = this.playerMixer.clipAction(clip)
  }

  private async loadDuo() {
    const g = await this.gltf(ASSETS.models.duogringo)
    if (!g) return
    const model = g.scene
    this.fitHeight(model, 1)
    this.duoBaseHeight = 1
    this.prepModel(model, this.duoMats)
    const wrap = new THREE.Group()
    wrap.add(model)
    wrap.rotation.y = ASSETS.yaw.duogringo
    this.duo.clear()
    this.duo.add(wrap)
    this.duoModel = wrap
    this.duoMixer = new THREE.AnimationMixer(model)
    for (const clip of g.animations) this.duoActions[clip.name] = this.duoMixer.clipAction(clip)
  }

  private placeholderBaby(): THREE.Object3D {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.35, 4, 10), this.toon(0xffd9b8))
    body.position.y = 0.5
    body.castShadow = true
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), this.toon(0xffd9b8))
    head.position.y = 1.0
    head.castShadow = true
    g.add(body, head)
    return g
  }

  private placeholderBird(): THREE.Object3D {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), this.toon(0x2e9e3a))
    body.position.y = 0.55
    body.castShadow = true
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 12), this.toon(0xf2c14e))
    hat.position.y = 1.05
    g.add(body, hat)
    return g
  }

  // ------------------------------------------------------------ level

  setLevel(s: State) {
    const level = currentLevel(s)
    const key = s.levelId + ':' + s.runId + ':' + s.seed
    if (this.levelKey === key) return
    this.levelKey = key
    const th = level.theme
    this.scene.background = new THREE.Color(th.sky)
    this.scene.fog = new THREE.Fog(th.fog, 40, 110)
    if (this.ground) this.scene.remove(this.ground)
    if (this.sand) this.scene.remove(this.sand)
    if (this.water) this.scene.remove(this.water)
    this.ground = this.makeContinent(s.arena.ring, 1, 0.7, th.ground, th.ground2, true)
    this.ground.position.y = -0.7
    this.scene.add(this.ground)
    this.sand = this.makeContinent(s.arena.ring, 1.045, 0.5, 0xe8d59a, 0xe0c98a, false)
    this.sand.position.y = -1.05
    this.scene.add(this.sand)
    this.water = this.makeWater()
    this.scene.add(this.water)
    this.themeSky.set(th.sky)
    this.themeFog.set(th.fog)
    this.bossMode = 0
    if (this.stage) this.scene.remove(this.stage)
    this.stage = null
    this.spot.intensity = 0
    for (const v of this.featureViews.values()) this.scene.remove(v)
    this.featureViews.clear()
    for (const f of s.features) this.addFeature(f, th.ground2)
    for (const v of this.bombViews.values()) this.scene.remove(v)
    this.bombViews.clear()
    for (const v of this.propViews.values()) this.scene.remove(v)
    this.propViews.clear()
    for (const v of this.npcViews.values()) this.scene.remove(v)
    this.npcViews.clear()
    for (const v of this.poopViews.values()) this.scene.remove(v)
    this.poopViews.clear()
    for (const v of this.pickupViews.values()) this.scene.remove(v)
    this.pickupViews.clear()
    this.removeBoss()
    this.particles.clear()
    for (const r of this.rings) this.scene.remove(r.mesh)
    this.rings = []
    this.debris.count = 0
    this.splats.count = 0
    this.shake = 0
    for (const pr of s.props) this.ensureProp(pr)
    for (const n of s.npcs) this.ensureNpc(n)
    this.camPos.set(s.player.x, 9, s.player.z + 9)
    this.sync(s, 0)
  }

  private checker(c1: number, c2: number, cells = 8): THREE.CanvasTexture {
    const size = 256
    const cv = document.createElement('canvas')
    cv.width = size
    cv.height = size
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#' + c1.toString(16).padStart(6, '0')
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = '#' + c2.toString(16).padStart(6, '0')
    const cs = size / cells
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) if ((x + y) % 2 === 0) ctx.fillRect(x * cs, y * cs, cs, cs)
    const tex = new THREE.CanvasTexture(cv)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.colorSpace = THREE.SRGBColorSpace
    tex.magFilter = THREE.NearestFilter
    return tex
  }

  // Cardboard-cutout continent: extruded outline, top at y = depth (caller offsets the mesh).
  private makeContinent(ring: [number, number][], scale: number, depth: number, c1: number, c2: number, checker: boolean): THREE.Mesh {
    const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x * scale, -z * scale)))
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 })
    geo.rotateX(-Math.PI / 2)
    const tex = checker ? this.checker(c1, c2) : this.checker(c1, c2, 2)
    tex.repeat.set(1 / 16, 1 / 16)
    const top = new THREE.MeshToonMaterial({ map: tex, gradientMap: this.gradient })
    const side = this.toon(checker ? 0x8b5a2b : 0xc9a96a)
    const mesh = new THREE.Mesh(geo, [top, side])
    mesh.receiveShadow = true
    mesh.castShadow = false
    return mesh
  }

  private makeWater(): THREE.Mesh {
    const tex = this.checker(0x3aa0e8, 0x47acef, 4)
    tex.repeat.set(30, 30)
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshToonMaterial({ map: tex, gradientMap: this.gradient }))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = -1.2
    mesh.receiveShadow = true
    return mesh
  }

  private addFeature(f: Feature, groundColor: number) {
    let obj: THREE.Object3D
    if (f.kind === 'platform') {
      const g = new THREE.Group()
      const col = f.island ? 0xe8d59a : groundColor
      const side = new THREE.Mesh(new THREE.CylinderGeometry(f.r, f.r * 1.08, f.h, 24, 1, false), this.toon(f.island ? 0xc9a96a : 0x8b5a2b))
      side.position.y = f.h / 2
      side.castShadow = true
      side.receiveShadow = true
      const top = new THREE.Mesh(new THREE.CylinderGeometry(f.r, f.r, 0.12, 24), this.toon(col))
      top.position.y = f.h
      top.receiveShadow = true
      g.add(side, top)
      if (!f.island) {
        const dots = new THREE.Mesh(new THREE.TorusGeometry(f.r * 0.7, 0.05, 6, 32), this.toon(0xffffff))
        dots.rotation.x = Math.PI / 2
        dots.position.y = f.h + 0.07
        g.add(dots)
      }
      obj = g
    } else if (f.kind === 'lake') {
      const g = new THREE.Group()
      const water = new THREE.Mesh(new THREE.CircleGeometry(f.r, 32), new THREE.MeshToonMaterial({ color: 0x3aa0e8, gradientMap: this.gradient, transparent: true, opacity: 0.85 }))
      water.rotation.x = -Math.PI / 2
      water.position.y = 0.03
      const rim = new THREE.Mesh(new THREE.RingGeometry(f.r, f.r + 0.45, 32), this.toon(0xe8d59a))
      rim.rotation.x = -Math.PI / 2
      rim.position.y = 0.02
      g.add(water, rim)
      obj = g
    } else if (f.kind === 'fan') {
      const g = new THREE.Group()
      const base = new THREE.Mesh(new THREE.CylinderGeometry(f.r, f.r * 1.1, 0.3, 16), this.toon(0x555566))
      base.position.y = 0.15
      base.castShadow = true
      const blades = new THREE.Group()
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(f.r * 1.7, 0.04, 0.3), this.toon(0xbfe6ff))
        b.rotation.y = (i * Math.PI) / 3
        blades.add(b)
      }
      blades.position.y = 0.34
      blades.name = 'blades'
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4), this.toon(0xffd23f))
      arrow.rotation.z = -Math.PI / 2
      arrow.rotation.y = Math.atan2(f.dirX, f.dirZ) - Math.PI / 2
      arrow.position.set(f.dirX * (f.r + 0.6), 0.3, f.dirZ * (f.r + 0.6))
      g.add(base, blades, arrow)
      obj = g
    } else {
      const g = new THREE.Group()
      const ring = new THREE.Mesh(new THREE.TorusGeometry(f.r, 0.14, 10, 32), new THREE.MeshToonMaterial({ color: 0x9b6bff, gradientMap: this.gradient, emissive: 0x9b6bff, emissiveIntensity: 0.4 }))
      ring.position.y = f.r + 0.1
      ring.name = 'ring'
      const disc = new THREE.Mesh(new THREE.CircleGeometry(f.r * 0.9, 24), new THREE.MeshBasicMaterial({ color: 0xd8c4ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide }))
      disc.position.y = f.r + 0.1
      disc.name = 'disc'
      const pad = new THREE.Mesh(new THREE.CircleGeometry(f.r + 0.3, 24), new THREE.MeshBasicMaterial({ color: 0x9b6bff, transparent: true, opacity: 0.35 }))
      pad.rotation.x = -Math.PI / 2
      pad.position.y = 0.03
      g.add(ring, disc, pad)
      obj = g
    }
    obj.position.set(f.x, 0, f.z)
    this.featureViews.set(f.id, obj)
    this.scene.add(obj)
  }

  private makeQuad(): THREE.Group {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 1.3), this.toon(0xff5c5c))
    body.position.y = 0.45
    body.castShadow = true
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.6), this.toon(0x1b1b2f))
    seat.position.set(0, 0.68, -0.1)
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.06), this.toon(0x333344))
    bar.position.set(0, 0.95, 0.5)
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), this.toon(0x333344))
    post.position.set(0, 0.75, 0.5)
    g.add(body, seat, bar, post)
    const wm = this.toon(0x222233)
    for (const [x, z] of [
      [-0.5, 0.45],
      [0.5, 0.45],
      [-0.5, -0.45],
      [0.5, -0.45],
    ]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.24, 10), wm)
      w.rotation.z = Math.PI / 2
      w.position.set(x, 0.26, z)
      w.castShadow = true
      g.add(w)
    }
    return g
  }

  private makeHat(): THREE.Group {
    const g = new THREE.Group()
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 20), this.toon(0x2b2b3a))
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.3, 20), this.toon(0x2b2b3a))
    crown.position.y = 0.17
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.08, 20), this.toon(0xff5c5c))
    band.position.y = 0.07
    g.add(brim, crown, band)
    g.position.y = 1.02
    g.rotation.z = -0.15
    return g
  }

  private makeWings(): THREE.Group {
    const g = new THREE.Group()
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.35), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: this.gradient, side: THREE.DoubleSide }))
      w.position.set(side * 0.32, 0.72, -0.2)
      w.rotation.y = side * 0.6
      w.rotation.z = side * 0.4
      g.add(w)
    }
    return g
  }

  private star(): THREE.Texture {
    if (this.starTex) return this.starTex
    const cv = document.createElement('canvas')
    cv.width = 64
    cv.height = 64
    const ctx = cv.getContext('2d')!
    ctx.font = 'bold 52px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#1b1b2f'
    ctx.lineWidth = 4
    ctx.strokeText('★', 32, 36)
    ctx.fillText('★', 32, 36)
    this.starTex = new THREE.CanvasTexture(cv)
    return this.starTex
  }

  private makeSkateboard(): THREE.Group {
    const g = new THREE.Group()
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 1.1), this.toon(0xff8fab))
    deck.position.y = 0.12
    deck.castShadow = true
    g.add(deck)
    const wm = this.toon(0x333344)
    for (const [x, z] of [
      [-0.2, 0.35],
      [0.2, 0.35],
      [-0.2, -0.35],
      [0.2, -0.35],
    ]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8), wm)
      w.rotation.z = Math.PI / 2
      w.position.set(x, 0.07, z)
      g.add(w)
    }
    return g
  }

  // ------------------------------------------------------------ props

  private ensureProp(pr: Prop) {
    let v = this.propViews.get(pr.id)
    if (v) return v
    v = this.makeProp(pr.kind, pr.color) as THREE.Group & Flashable
    this.propViews.set(pr.id, v)
    this.scene.add(v)
    return v
  }

  private makeProp(kind: PropKind, color: number): THREE.Group & Flashable {
    const g = new THREE.Group() as THREE.Group & Flashable
    g.mats = []
    const mat = (c: number) => {
      const m = this.toon(c)
      g.mats.push(m)
      return m
    }
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      g.add(mesh)
      return mesh
    }
    switch (kind) {
      case 'box':
        add(new THREE.BoxGeometry(0.85, 0.85, 0.85), mat(color), 0, 0.43)
        break
      case 'barrel':
        add(new THREE.CylinderGeometry(0.4, 0.4, 1, 12), mat(color), 0, 0.5)
        add(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12), mat(0x2b2b3a), 0, 0.3)
        add(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12), mat(0x2b2b3a), 0, 0.72)
        break
      case 'cone':
        add(new THREE.ConeGeometry(0.28, 0.7, 10), mat(color), 0, 0.35)
        add(new THREE.BoxGeometry(0.55, 0.06, 0.55), mat(0x333344), 0, 0.03)
        break
      case 'mailbox':
        add(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), mat(0x5a4a3a), 0, 0.4)
        add(new THREE.BoxGeometry(0.5, 0.35, 0.3), mat(color), 0, 0.98)
        add(new THREE.BoxGeometry(0.05, 0.25, 0.05), mat(0xff3b3b), 0.27, 1.05)
        break
      case 'hydrant':
        add(new THREE.CylinderGeometry(0.22, 0.26, 0.7, 10), mat(color), 0, 0.35)
        add(new THREE.SphereGeometry(0.22, 10, 8), mat(color), 0, 0.75)
        add(new THREE.BoxGeometry(0.62, 0.14, 0.14), mat(color), 0, 0.45)
        break
      case 'car': {
        add(new THREE.BoxGeometry(2.4, 0.6, 1.3), mat(color), 0, 0.55)
        add(new THREE.BoxGeometry(1.3, 0.5, 1.15), mat(0xbfe6ff), -0.1, 1.1)
        const wm = mat(0x222233)
        for (const [x, z] of [
          [-0.8, 0.62],
          [0.8, 0.62],
          [-0.8, -0.62],
          [0.8, -0.62],
        ]) {
          const w = add(new THREE.CylinderGeometry(0.26, 0.26, 0.2, 10), wm, x, 0.26, z)
          w.rotation.x = Math.PI / 2
        }
        break
      }
      case 'tree':
        add(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 8), mat(0x7a4a2a), 0, 0.6)
        add(new THREE.SphereGeometry(0.9, 10, 8), mat(color), 0, 1.7)
        add(new THREE.SphereGeometry(0.6, 10, 8), mat(color), 0.4, 2.2, 0.2)
        break
      case 'bench':
        add(new THREE.BoxGeometry(1.6, 0.08, 0.5), mat(color), 0, 0.45)
        add(new THREE.BoxGeometry(1.6, 0.4, 0.08), mat(color), 0, 0.7, -0.22)
        add(new THREE.BoxGeometry(0.08, 0.45, 0.45), mat(0x444455), -0.7, 0.22)
        add(new THREE.BoxGeometry(0.08, 0.45, 0.45), mat(0x444455), 0.7, 0.22)
        break
      case 'sign':
        add(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), mat(0x888899), 0, 0.8)
        add(new THREE.OctahedronGeometry(0.35, 0), mat(color), 0, 1.65)
        break
      case 'trash':
        add(new THREE.CylinderGeometry(0.32, 0.28, 0.85, 10), mat(color), 0, 0.43)
        add(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 10), mat(0x333344), 0, 0.9)
        break
      case 'crate':
        add(new THREE.BoxGeometry(0.95, 0.85, 0.95), mat(color), 0, 0.43)
        add(new THREE.BoxGeometry(1.0, 0.1, 1.0), mat(0xffd23f), 0, 0.85)
        add(new THREE.BoxGeometry(1.0, 0.1, 1.0), mat(0xffd23f), 0, 0.05)
        add(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 10), mat(0xff3b3b), 0, 0.98)
        break
      case 'gift':
        add(new THREE.BoxGeometry(0.9, 0.8, 0.9), mat(color), 0, 0.4)
        add(new THREE.BoxGeometry(0.95, 0.85, 0.16), mat(0xffd23f), 0, 0.4)
        add(new THREE.BoxGeometry(0.16, 0.85, 0.95), mat(0xffd23f), 0, 0.4)
        add(new THREE.SphereGeometry(0.16, 8, 6), mat(0xffd23f), 0, 0.9)
        break
    }
    return g
  }

  // ------------------------------------------------------------ npcs

  private ensureNpc(n: Npc) {
    let v = this.npcViews.get(n.id)
    if (v) return v
    const g = new THREE.Group() as THREE.Group & Flashable & { eyes: THREE.Object3D; body: THREE.Object3D }
    g.mats = []
    const mat = (c: number) => {
      const m = this.toon(c)
      g.mats.push(m)
      return m
    }
    const body = new THREE.Group()
    if (n.kind === 'adult') {
      const shirt = [0x4aa3ff, 0xff8fab, 0xffb020, 0x9b6bff, 0x4cd137][n.id % 5]
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.55, 4, 10), mat(shirt))
      torso.position.y = 0.62
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), mat(0xffd9b8))
      head.position.y = 1.22
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.3), mat(0x33415c))
      legs.position.y = 0.18
      torso.castShadow = head.castShadow = legs.castShadow = true
      body.add(torso, head, legs)
      const eyes = new THREE.Group()
      for (const x of [-0.09, 0.09]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }))
        e.position.set(x, 1.26, 0.2)
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }))
        p.position.set(x, 1.26, 0.25)
        eyes.add(e, p)
      }
      g.eyes = eyes
      body.add(eyes)
    } else if (n.kind === 'chicken') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat(0xffffff))
      body.position.y = 0.34
      body.scale.set(1, 0.9, 1.15)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat(0xffffff))
      head.position.set(0, 0.62, 0.22)
      const comb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.16), mat(0xff3b3b))
      comb.position.set(0, 0.76, 0.2)
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), mat(0xffb020))
      beak.rotation.x = Math.PI / 2
      beak.position.set(0, 0.6, 0.4)
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 6), mat(0xffffff))
      tail.rotation.x = -Math.PI / 2.5
      tail.position.set(0, 0.45, -0.3)
      body.castShadow = head.castShadow = true
      body.add(tail)
      body.add(head, comb, beak)
      const eyes = new THREE.Group()
      for (const x of [-0.07, 0.07]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }))
        e.position.set(x, 0.66, 0.34)
        eyes.add(e)
      }
      g.eyes = eyes
      body.add(eyes)
      body.position.y = 0.34
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.08), mat(0xffb020))
      legs.position.y = 0.1
      body.add(legs)
      body.name = 'chickenBody'
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 8), this.toon(0xff8fab))
      hat.position.set(0, 0.9, 0.2)
      hat.name = 'partyhat'
      hat.visible = false
      body.add(hat)
      const wrap = new THREE.Group()
      wrap.add(body)
      body.position.y = 0
      wrap.position.y = 0.05
      // reuse the group as body so bob/tilt apply
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      g.add(wrap)
      g.body = wrap
      this.npcViews.set(n.id, g)
      this.scene.add(g)
      return g
    } else {
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 10), mat(0xc49a6c))
      torso.rotation.x = Math.PI / 2
      torso.position.y = 0.35
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(0xc49a6c))
      head.position.set(0, 0.55, 0.42)
      const ear1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.05), mat(0x8b5a2b))
      ear1.position.set(-0.15, 0.72, 0.4)
      const ear2 = ear1.clone()
      ear2.position.x = 0.15
      torso.castShadow = head.castShadow = true
      body.add(torso, head, ear1, ear2)
      const eyes = new THREE.Group()
      for (const x of [-0.08, 0.08]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }))
        e.position.set(x, 0.6, 0.6)
        eyes.add(e)
      }
      g.eyes = eyes
      body.add(eyes)
    }
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 8), this.toon(0xff8fab))
    hat.position.y = n.kind === 'adult' ? 1.55 : 0.85
    hat.name = 'partyhat'
    hat.visible = false
    body.add(hat)
    g.body = body
    g.add(body)
    this.npcViews.set(n.id, g)
    this.scene.add(g)
    return g
  }

  // ------------------------------------------------------------ pickups

  private ensurePickup(k: Pickup): THREE.Group {
    let g = this.pickupViews.get(k.id)
    if (g) return g
    g = new THREE.Group()
    const add = (geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, rx = 0) => {
      const m = new THREE.Mesh(geo, this.toon(color))
      m.position.set(x, y, z)
      m.rotation.x = rx
      m.castShadow = true
      g!.add(m)
      return m
    }
    if (k.kind === 'milk') {
      add(new THREE.CylinderGeometry(0.16, 0.18, 0.5, 10), 0xffffff, 0, 0.25)
      add(new THREE.CylinderGeometry(0.08, 0.1, 0.16, 8), 0x4aa3ff, 0, 0.58)
      add(new THREE.SphereGeometry(0.09, 8, 6), 0xffd9b8, 0, 0.7)
    } else if (k.kind === 'pacifier') {
      add(new THREE.TorusGeometry(0.22, 0.06, 8, 16), 0xffd23f, 0, 0.3, 0, Math.PI / 2)
      add(new THREE.SphereGeometry(0.12, 10, 8), 0xff8fab, 0, 0.3, 0.14)
      add(new THREE.SphereGeometry(0.08, 8, 6), 0xffd23f, 0, 0.3, -0.16)
    } else if (k.kind === 'rattle') {
      add(new THREE.SphereGeometry(0.22, 10, 8), 0xff8fab, 0, 0.5)
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), 0x8b5a2b, 0, 0.18)
      add(new THREE.SphereGeometry(0.07, 8, 6), 0xffd23f, 0.16, 0.6)
      add(new THREE.SphereGeometry(0.07, 8, 6), 0x4aa3ff, -0.16, 0.55)
    } else if (k.kind === 'clock') {
      const face = add(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16), 0xffd23f, 0, 0.45, 0, Math.PI / 2)
      face.castShadow = true
      add(new THREE.BoxGeometry(0.04, 0.2, 0.02), 0x1b1b2f, 0, 0.53, 0.06)
      add(new THREE.BoxGeometry(0.14, 0.04, 0.02), 0x1b1b2f, 0.06, 0.45, 0.06)
      add(new THREE.SphereGeometry(0.07, 8, 6), 0xff5c5c, 0, 0.8)
    } else if (k.kind === 'skateboard') {
      const b = this.makeSkateboard()
      b.rotation.z = 0.35
      g.add(b)
    } else if (k.kind === 'megaphone') {
      const cone = add(new THREE.ConeGeometry(0.28, 0.5, 12), 0xff5c5c, 0, 0.45, 0, -Math.PI / 2)
      cone.rotation.z = 0.2
      add(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), 0x1b1b2f, 0, 0.25, -0.25, Math.PI / 2)
    } else if (k.kind === 'fedora') {
      const h = this.makeHat()
      h.position.y = 0.35
      h.rotation.z = 0.3
      g.add(h)
    } else if (k.kind === 'quad') {
      const q = this.makeQuad()
      q.scale.setScalar(0.7)
      g.add(q)
    } else if (k.kind === 'wings') {
      const w = this.makeWings()
      w.position.y = -0.2
      w.scale.setScalar(1.3)
      g.add(w)
    } else if (k.kind === 'goggles') {
      add(new THREE.TorusGeometry(0.16, 0.06, 8, 16), 0x4cd137, -0.18, 0.5, 0)
      add(new THREE.TorusGeometry(0.16, 0.06, 8, 16), 0x4cd137, 0.18, 0.5, 0)
      add(new THREE.BoxGeometry(0.1, 0.05, 0.05), 0x1b1b2f, 0, 0.5, 0)
    } else if (k.kind === 'conga') {
      add(new THREE.SphereGeometry(0.24, 10, 8), 0xffd23f, 0, 0.6)
      add(new THREE.SphereGeometry(0.24, 10, 8), 0xff8fab, 0.3, 0.45)
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), 0x8b5a2b, 0, 0.25)
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), 0x8b5a2b, 0.3, 0.1)
    } else if (k.kind === 'giant') {
      const b = add(new THREE.CylinderGeometry(0.2, 0.24, 0.6, 10), 0x4cd137, 0, 0.35)
      b.scale.setScalar(1.3)
      add(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 8), 0x1b1b2f, 0, 0.8)
      add(new THREE.SphereGeometry(0.07, 8, 6), 0xbfffbf, 0.12, 0.55)
      add(new THREE.SphereGeometry(0.05, 8, 6), 0xbfffbf, -0.1, 0.4)
    } else if (k.kind === 'lantern') {
      add(new THREE.CylinderGeometry(0.22, 0.22, 0.42, 10), 0xff3b3b, 0, 0.5)
      add(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 10), 0xffd23f, 0, 0.74)
      add(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 10), 0xffd23f, 0, 0.26)
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1a8 }))
      glow.position.y = 0.5
      g.add(glow)
    } else if (k.kind === 'potato') {
      const pot = add(new THREE.SphereGeometry(0.28, 10, 8), 0xc49a6c, 0, 0.45)
      pot.scale.set(1.3, 0.9, 1)
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), 0x1b1b2f, 0.1, 0.75)
      add(new THREE.SphereGeometry(0.06, 6, 6), 0xff5c5c, 0.1, 0.9)
    }
    // beacon: a light pillar plus a star so finds read from far away
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 5, 10, 1, true), new THREE.MeshBasicMaterial({ color: PICKUP_COLOR[k.kind] ?? 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }))
    pillar.position.y = 2.5
    pillar.name = 'pillar'
    g.add(pillar)
    const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.star(), transparent: true, depthTest: false }))
    star.scale.setScalar(0.9)
    star.position.y = 2.1
    star.name = 'star'
    g.add(star)
    this.pickupViews.set(k.id, g)
    this.scene.add(g)
    return g
  }

  // ------------------------------------------------------------ boss

  private removeBoss() {
    if (this.boss) {
      this.scene.remove(this.boss.group)
      this.boss = null
    }
  }

  private bossTexture(file: string): Promise<THREE.Texture> {
    const cached = this.bossTextures.get(file)
    if (cached) return Promise.resolve(cached)
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const border = Math.round(Math.max(img.width, img.height) * 0.045)
        const cv = document.createElement('canvas')
        cv.width = img.width + border * 2
        cv.height = img.height + border * 2
        const ctx = cv.getContext('2d')!
        ctx.fillStyle = '#fffaf0'
        ctx.beginPath()
        const r = border * 1.5
        ctx.roundRect(0, 0, cv.width, cv.height, r)
        ctx.fill()
        ctx.drawImage(img, border, border)
        const tex = new THREE.CanvasTexture(cv)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 4
        this.bossTextures.set(file, tex)
        resolve(tex)
      }
      img.onerror = () => {
        const tex = new THREE.Texture()
        resolve(tex)
      }
      img.src = ASSETS.drawing(file)
    })
  }

  private async ensureBoss(b: Boss) {
    if (this.boss && this.boss.def.id === b.def.id) return
    this.removeBoss()
    const def = b.def
    const group = new THREE.Group()
    const h = def.scale
    const card = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.75, h), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }))
    card.castShadow = true
    card.position.y = h / 2
    const overlay = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.75, h), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }))
    overlay.position.y = h / 2
    overlay.position.z = 0.01
    const ringGeo = new THREE.RingGeometry(b.r * 1.1, b.r * 1.5, 32)
    ringGeo.rotateX(-Math.PI / 2)
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x4cd137, transparent: true, opacity: 0, depthWrite: false }))
    ring.position.y = 0.03
    group.add(card, overlay, ring)
    this.scene.add(group)
    this.boss = { group, card, overlay, ring, def, h }
    const tex = await this.bossTexture(def.drawing)
    if (this.boss && this.boss.def.id === def.id && tex.image) {
      const img = tex.image as HTMLCanvasElement
      const aspect = img.width / img.height
      const w = h * aspect
      card.geometry.dispose()
      card.geometry = new THREE.PlaneGeometry(w, h)
      overlay.geometry.dispose()
      overlay.geometry = new THREE.PlaneGeometry(w, h)
      ;(card.material as THREE.MeshBasicMaterial).map = tex
      ;(card.material as THREE.MeshBasicMaterial).needsUpdate = true
    }
  }

  // ------------------------------------------------------------ events

  onEvent(e: GameEvent, s: State) {
    const x = e.x ?? s.player.x
    const z = e.z ?? s.player.z
    switch (e.t) {
      case 'smash':
        this.particles.burst(x, 0.6, z, 14 + Math.round((e.big ?? 0) * 20), e.color ?? 0xffffff, 3 + (e.big ?? 0) * 4, 0.2)
        this.particles.burst(x, 0.2, z, 6, 0xffffff, 2, 0.12)
        this.addShake(0.15 + (e.big ?? 0) * 0.5)
        break
      case 'propHit':
        this.particles.burst(x, 0.6, z, 4, e.color ?? 0xffffff, 2, 0.12)
        break
      case 'scream':
        this.ring(x, z, e.facing ?? 0, e.range ?? 5, 0xfff1a8, 0.35, true)
        this.addShake(0.2 + (e.big ?? 0) * 0.35)
        break
      case 'splat':
        this.particles.burst(x, 0.15, z, 8, 0x6b3e1e, 2.5, 0.1)
        break
      case 'npcScared':
        this.particles.burst(x, 1.4, z, 6, 0xffffff, 1.5, 0.1)
        break
      case 'npcHit':
        this.particles.burst(x, 1.2, z, 10, 0xffd23f, 2.5, 0.12)
        this.addShake(0.15)
        break
      case 'playerHurt':
        this.particles.burst(x, 0.8, z, 12, 0xff3b3b, 3, 0.14)
        this.addShake(0.45 + (e.big ?? 0) * 0.4)
        break
      case 'duoShrink':
        this.particles.burst(x, 1, z, 16, 0x4cd137, 3, 0.15)
        this.addShake(0.3)
        break
      case 'duoGrow':
        this.particles.burst(x, 1, z, 4, 0xff3b3b, 1.5, 0.1)
        break
      case 'pickup':
        this.particles.burst(x, 0.8, z, 18, e.kind === 'milk' ? 0xffffff : e.kind === 'pacifier' || e.kind === 'clock' ? 0xffd23f : e.kind === 'megaphone' ? 0xff5c5c : 0xff8fab, 3, 0.12)
        break
      case 'timeBonus':
        this.particles.burst(x, 1.2, z, 26, 0x4cd137, 4, 0.14)
        this.addShake(0.2)
        break
      case 'bossLand':
        this.addShake(1.4)
        this.particles.burst(x, 0.5, z, 60, 0x776655, 7, 0.28)
        if (e.range) this.ring(x, z, 0, e.range * 1.1, 0xff8844, 0.6, false)
        this.buildStage(s)
        break
      case 'portal':
        this.particles.burst(x, 1, z, 16, 0x9b6bff, 3, 0.12)
        break
      case 'fan':
        this.particles.burst(x, 0.3, z, 14, 0xffffff, 2, 0.1)
        break
      case 'found':
        this.particles.burst(x, 1.2, z, 30, 0xff3b3b, 4, 0.14)
        this.particles.burst(x, 1.2, z, 12, 0xffd23f, 3, 0.12)
        break
      case 'congaSmash':
        this.particles.burst(x, 0.8, z, 10, 0xff8fab, 3, 0.12)
        break
      case 'explode':
        this.addShake(0.9)
        this.particles.burst(x, 0.6, z, 40, 0xff7f27, 6, 0.2)
        this.particles.burst(x, 0.6, z, 20, 0x333344, 4, 0.22)
        if (e.range) this.ring(x, z, 0, e.range, 0xff7f27, 0.4, false)
        break
      case 'rideOn':
        this.particles.burst(x, 0.3, z, 14, 0xff8fab, 3, 0.1)
        break
      case 'rideOff':
        this.particles.burst(x, 0.5, z, 10, 0xff8fab, 3, 0.1)
        break
      case 'goalReached':
        this.addShake(0.8)
        this.particles.burst(x, 1, z, 40, 0xffd23f, 5, 0.18)
        break
      case 'bossEnter':
        this.addShake(0.3)
        break
      case 'levelPhase':
        this.addShake(0.9)
        this.particles.burst(x, 0.5, z, 30, 0x555566, 5, 0.25)
        break
      case 'bossAttack':
        this.addShake(0.25)
        break
      case 'bossStomp':
        if (e.range) this.ring(x, z, 0, e.range, 0xff8844, 0.45, false)
        this.addShake(0.5 + (e.big ?? 0) * 0.5)
        this.particles.burst(x, 0.3, z, 20 + Math.round((e.big ?? 0) * 20), 0x776655, 4, 0.22)
        break
      case 'bossHurt':
        this.particles.burst(x, 1.4, z, 24, 0xffd23f, 4, 0.2)
        this.particles.burst(x, 1.4, z, 10, 0xffffff, 3, 0.16)
        this.addShake(0.7)
        break
      case 'bossPhase':
        this.addShake(0.8)
        this.particles.burst(x, 1.2, z, 40, 0xff3b3b, 5, 0.22)
        break
      case 'bossDead':
        this.addShake(1)
        for (let i = 0; i < 4; i++) this.particles.burst(x + (i - 1.5) * 0.8, 1.5 + i * 0.4, z, 30, [0xffd23f, 0xff5c5c, 0x4aa3ff, 0x4cd137][i], 6, 0.2)
        break
      case 'jump':
        this.particles.burst(x, 0.1, z, 5, 0xffffff, 1.5, 0.08)
        break
      case 'land':
        this.particles.burst(x, 0.1, z, 6, 0xffffff, 2, 0.1)
        break
      default:
        break
    }
  }

  addShake(v: number) {
    this.shake = Math.min(1.4, this.shake + v)
  }

  // Torches, a glowing ring and a spotlight: the boss fight gets its own stage.
  private buildStage(s: State) {
    if (this.stage) this.scene.remove(this.stage)
    const ring = s.bossRing
    if (!ring) return
    const g = new THREE.Group()
    const glow = new THREE.Mesh(new THREE.RingGeometry(ring.r - 0.35, ring.r + 0.1, 48), new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0.6, depthWrite: false }))
    glow.rotation.x = -Math.PI / 2
    glow.position.set(ring.x, 0.05, ring.z)
    glow.name = 'glow'
    g.add(glow)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const tx = ring.x + Math.cos(a) * (ring.r + 0.6)
      const tz = ring.z + Math.sin(a) * (ring.r + 0.6)
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.4, 6), this.toon(0x4a3728))
      post.position.set(tx, 0.7, tz)
      post.castShadow = true
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0xffb020 }))
      flame.position.set(tx, 1.65, tz)
      flame.name = 'flame'
      g.add(post, flame)
    }
    this.stage = g
    this.scene.add(g)
    this.spot.position.set(ring.x, 16, ring.z + 2)
    this.spot.target.position.set(ring.x, 0, ring.z)
    this.spot.angle = Math.atan((ring.r + 2) / 16)
  }

  private ring(x: number, z: number, facing: number, range: number, color: number, life: number, cone: boolean) {
    const geo = cone ? new THREE.CircleGeometry(1, 20, -Math.PI / 2 - Math.PI / 3, (Math.PI * 2) / 3) : new THREE.RingGeometry(0.85, 1, 32)
    geo.rotateX(-Math.PI / 2)
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }))
    mesh.position.set(x, 0.05, z)
    mesh.rotation.y = facing
    mesh.scale.setScalar(cone ? range * 0.3 : 0.3)
    this.scene.add(mesh)
    this.rings.push({ mesh, life, max: life, grow: range })
  }

  // ------------------------------------------------------------ sync

  sync(s: State, dt: number) {
    this.time += dt
    const p = s.player
    // player
    const riding = p.ride === 'skateboard'
    const quad = p.ride === 'quad'
    this.player.position.set(p.x, p.y + (riding ? 0.16 : quad ? 0.55 : p.inLake ? -0.3 : 0), p.z)
    this.player.rotation.y = p.facing
    this.board.visible = riding
    this.quad.visible = quad
    this.hat.visible = p.fedora
    this.wings.visible = p.wings
    if (riding) {
      this.board.position.set(p.x, p.y, p.z)
      this.board.rotation.y = p.facing
      this.board.rotation.z = Math.sin(this.time * 6) * 0.06
    }
    if (quad) {
      this.quad.position.set(p.x, p.y, p.z)
      this.quad.rotation.y = p.facing
      this.quad.rotation.z = Math.sin(this.time * 9) * 0.04
    }
    if (p.wings && !p.grounded) this.wings.rotation.z = Math.sin(this.time * 12) * 0.5
    if (p.inLake && this.time % 0.25 < dt) this.particles.burst(p.x, 0.05, p.z, 3, 0xbfe6ff, 1, 0.08)
    // features
    for (const f of s.features) {
      const v = this.featureViews.get(f.id)
      if (!v) continue
      if (f.kind === 'fan') {
        const blades = v.getObjectByName('blades')
        if (blades) blades.rotation.y += dt * (f.cd > 0 ? 40 : 8)
      } else if (f.kind === 'portal') {
        const ring = v.getObjectByName('ring')
        if (ring) ring.rotation.y += dt * 1.5
        const disc = v.getObjectByName('disc')
        if (disc) {
          disc.rotation.y += dt * 1.5
          disc.scale.setScalar(1 + Math.sin(this.time * 4) * 0.08)
        }
      }
    }
    // bombs
    const seenBombs = new Set<number>()
    for (const b of s.bombs) {
      seenBombs.add(b.id)
      let m = this.bombViews.get(b.id)
      if (!m) {
        m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshToonMaterial({ color: 0xc49a6c, gradientMap: this.gradient, emissive: 0xff3b3b, emissiveIntensity: 0 }))
        m.scale.set(1.3, 0.9, 1)
        m.castShadow = true
        this.bombViews.set(b.id, m)
        this.scene.add(m)
      }
      m.position.set(b.x, b.y + 0.25, b.z)
      m.rotation.y += dt * 6
      ;(m.material as THREE.MeshToonMaterial).emissiveIntensity = Math.sin(this.time * (30 - b.fuse * 15)) > 0 ? 0.8 : 0
    }
    for (const [id, m] of this.bombViews) {
      if (!seenBombs.has(id)) {
        this.scene.remove(m)
        this.bombViews.delete(id)
      }
    }
    // boss stage lighting
    const wantBoss = s.phase === 'boss' && !!s.bossRing ? 1 : 0
    this.bossMode += (wantBoss - this.bossMode) * Math.min(1, dt * 1.5)
    const bm = this.bossMode
    this.hemi.intensity = 0.9 - bm * 0.5
    this.sun.intensity = 1.6 - bm * 1.0
    this.spot.intensity = bm * 260
    ;(this.scene.background as THREE.Color).copy(this.themeSky).lerp(this.nightSky, bm)
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(this.themeFog).lerp(this.nightSky, bm)
    if (this.stage) {
      const glow = this.stage.getObjectByName('glow') as THREE.Mesh | undefined
      if (glow) (glow.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(this.time * 5) * 0.2
      this.stage.traverse((o) => {
        if (o.name === 'flame') o.scale.set(1 + Math.sin(this.time * 14 + o.position.x) * 0.15, 1 + Math.sin(this.time * 11 + o.position.z) * 0.25, 1)
      })
      if (bm < 0.01 && s.phase !== 'boss') {
        this.scene.remove(this.stage)
        this.stage = null
      }
    }
    const speed = Math.hypot(p.vx, p.vz)
    const ch = p.screamCharging ? p.screamCharge : 0
    const squash = 1 + p.screamFlash * 0.6 + ch * 0.35 + (ch > 0 ? Math.sin(this.time * 40) * 0.05 * ch : 0)
    const wide = 1 + ch * 0.25
    const giantWant = p.giantT > 0 ? 2.4 : 1
    this.giantScale += (giantWant - this.giantScale) * Math.min(1, dt * 6)
    const gs = this.giantScale
    this.player.scale.set((wide / Math.sqrt(squash)) * gs, squash * gs, (wide / Math.sqrt(squash)) * gs)
    if (gs > 1.3 && speed > 1 && this.time % 0.35 < dt) {
      this.particles.burst(p.x, 0.1, p.z, 8, 0x776655, 3, 0.14)
      this.addShake(0.12)
    }
    this.chargeCone.visible = ch > 0
    if (ch > 0) {
      this.chargeCone.position.set(p.x, 0.04, p.z)
      this.chargeCone.rotation.y = p.facing
      this.chargeCone.scale.setScalar(screamRange(p, ch))
      const cm = this.chargeCone.material as THREE.MeshBasicMaterial
      cm.opacity = 0.15 + ch * 0.2
      cm.color.setHSL(0.13 - ch * 0.13, 1, 0.7)
    }
    const poopCharge = p.poopHeld ? Math.min(1, p.poopHoldT / 0.5) : 0
    if (poopCharge > 0) this.player.scale.y *= 1 - poopCharge * 0.12
    if (this.playerMixer) {
      const want = speed > 0.6 ? 'walk' : 'walk-idle'
      if (want !== this.playerCurrent && this.playerActions[want]) {
        const prev = this.playerActions[this.playerCurrent]
        const next = this.playerActions[want]
        next.reset().fadeIn(0.15).play()
        if (prev) prev.fadeOut(0.15)
        this.playerCurrent = want
      }
      if (this.playerActions.walk) this.playerActions.walk.timeScale = Math.max(0.6, speed / 3.2)
      this.playerMixer.update(dt)
    } else {
      this.player.rotation.z = Math.sin(this.time * 14) * 0.08 * Math.min(1, speed / 3)
    }
    if (p.invuln > 0) this.flash(this.playerMats, Math.floor(this.time * 20) % 2 === 0 ? 0xff3b3b : 0xffffff, 0.6)
    else if (ch > 0) this.flash(this.playerMats, 0xff5c5c, ch * 0.5)
    else if (p.pacifierT > 0) this.flash(this.playerMats, 0xffd23f, 0.12 + Math.sin(this.time * 8) * 0.06)
    else if (p.rattleT > 0) this.flash(this.playerMats, 0xff8fab, 0.1 + Math.sin(this.time * 8) * 0.05)
    else this.flash(this.playerMats, 0, 0)

    // duogringo
    const d = s.duo
    const dr = duoRadius(d)
    const dh = (dr / 0.45) * 1.05
    this.duo.position.set(d.x, d.y + Math.abs(Math.sin(this.time * 9)) * 0.08 * (1 + d.power), d.z)
    this.duo.rotation.y = d.facing
    this.duo.scale.setScalar(dh / this.duoBaseHeight)
    if (this.duoMixer) {
      const want = d.state === 'peck' ? 'Attack' : Math.hypot(d.vx, d.vz) > 0.4 ? 'Walk' : 'Idle'
      if (want !== this.duoCurrent && this.duoActions[want]) {
        const prev = this.duoActions[this.duoCurrent]
        const next = this.duoActions[want]
        next.reset().fadeIn(0.12).play()
        if (prev) prev.fadeOut(0.12)
        this.duoCurrent = want
      }
      this.duoMixer.update(dt * (1 + d.power * 0.6))
    }
    this.flash(this.duoMats, d.hitFlash > 0 ? 0xffffff : d.power > 0.66 ? 0xff2020 : 0, d.hitFlash > 0 ? 0.8 : d.power > 0.66 ? 0.25 + Math.sin(this.time * 10) * 0.15 : 0)

    // props
    for (const pr of s.props) {
      const v = this.ensureProp(pr)
      if (pr.broken) {
        v.visible = false
        continue
      }
      v.visible = true
      v.position.set(pr.x, pr.y, pr.z)
      v.rotation.y = pr.rot
      const tilt = Math.min(0.5, Math.hypot(pr.vx, pr.vz) * 0.08)
      v.rotation.z = -pr.vx * 0.04 * tilt * 5
      v.rotation.x = pr.vz * 0.04 * tilt * 5
      const sq = 1 - pr.hitFlash * 0.8
      v.scale.set(1 + (1 - sq) * 0.5, sq, 1 + (1 - sq) * 0.5)
      this.flash(v.mats, 0xffffff, pr.hitFlash > 0 ? 0.7 : 0)
    }

    // npcs
    for (const n of s.npcs) {
      const v = this.ensureNpc(n)
      v.position.set(n.x, 0, n.z)
      v.rotation.y = n.facing
      const sp = Math.hypot(n.vx, n.vz)
      const bob = Math.abs(Math.sin(this.time * (n.kind === 'dog' ? 16 : 11) + n.id)) * Math.min(1, sp / 2) * 0.12
      v.body.position.y = bob
      v.body.rotation.z = n.state === 'stunned' ? 0.5 : Math.sin(this.time * 12 + n.id) * 0.1 * Math.min(1, sp / 2)
      v.body.rotation.x = n.state === 'flee' ? -0.25 : n.state === 'chase' ? 0.2 : 0
      const eyeScale = n.state === 'flee' || n.state === 'stunned' ? 1.6 : 1
      v.eyes.scale.setScalar(eyeScale)
      const hat = v.getObjectByName('partyhat')
      if (hat) hat.visible = n.state === 'follow'
      if (n.state === 'follow') v.body.rotation.z = Math.sin(this.time * 10 + n.id) * 0.25
      this.flash(v.mats, 0xffffff, n.hitFlash > 0 ? 0.7 : 0)
    }

    // poops
    const seen = new Set<number>()
    for (const q of s.poops) {
      seen.add(q.id)
      let m = this.poopViews.get(q.id)
      if (!m) {
        m = new THREE.Mesh(this.poopGeo, this.poopMat)
        m.castShadow = true
        this.poopViews.set(q.id, m)
        this.scene.add(m)
      }
      m.position.set(q.x, q.y, q.z)
      m.rotation.x += dt * 8
    }
    for (const [id, m] of this.poopViews) {
      if (!seen.has(id)) {
        this.scene.remove(m)
        this.poopViews.delete(id)
      }
    }

    // pickups
    const seenPickups = new Set<number>()
    for (const k of s.pickups) {
      seenPickups.add(k.id)
      const g = this.ensurePickup(k)
      g.position.set(k.x, k.y + 0.15 + Math.abs(Math.sin(this.time * 2.5 + k.id)) * 0.2, k.z)
      g.rotation.y = this.time * 1.5 + k.id
      const pillar = g.getObjectByName('pillar') as THREE.Mesh | undefined
      if (pillar) (pillar.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(this.time * 3 + k.id) * 0.08
      const star = g.getObjectByName('star')
      if (star) star.position.y = 2.1 + Math.sin(this.time * 2 + k.id) * 0.15
    }
    for (const [id, g] of this.pickupViews) {
      if (!seenPickups.has(id)) {
        this.scene.remove(g)
        this.pickupViews.delete(id)
      }
    }

    // splats
    const ns = Math.min(MAX_SPLATS, s.splats.length)
    for (let i = 0; i < ns; i++) {
      const sp = s.splats[s.splats.length - ns + i]
      this.tmpM.makeTranslation(sp.x, 0.02, sp.z)
      this.tmpM.scale(this.tmpS.set(sp.r, 1, sp.r * 0.8))
      this.splats.setMatrixAt(i, this.tmpM)
    }
    this.splats.count = ns
    this.splats.instanceMatrix.needsUpdate = true

    // debris
    const nd = Math.min(MAX_DEBRIS, s.debris.length)
    const start = s.debris.length - nd
    for (let i = 0; i < nd; i++) {
      const db = s.debris[start + i]
      this.tmpQ.setFromEuler(this.tmpE.set(db.rot * 0.7, db.rot, db.rot * 0.3))
      this.tmpM.compose(this.tmpV.set(db.x, db.y, db.z), this.tmpQ, this.tmpS.set(db.size, db.size, db.size))
      this.debris.setMatrixAt(i, this.tmpM)
      this.debris.setColorAt(i, new THREE.Color(db.color))
    }
    this.debris.count = nd
    this.debris.instanceMatrix.needsUpdate = true
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true

    // boss
    if (s.boss) {
      void this.ensureBoss(s.boss)
      const b = s.boss
      const bv = this.boss
      if (bv) {
        bv.group.position.set(b.x, b.y, b.z)
        const camYaw = Math.atan2(this.camera.position.x - b.x, this.camera.position.z - b.z)
        bv.group.rotation.y = camYaw
        const ph = bossPhase(b)
        let wob = Math.sin(this.time * 3 + ph) * 0.05
        let sy = 1
        let sx = 1
        let tilt = 0
        if (b.state === 'telegraph') {
          wob += Math.sin(this.time * 60) * 0.06
          sy = 1.08
          sx = 0.94
        } else if (b.state === 'attack') {
          tilt = b.attack === 'charge' ? 0.45 : -0.2
          sy = b.attack === 'charge' ? 0.9 : 1.15
        } else if (b.state === 'hurt') {
          sy = 0.72
          sx = 1.25
          wob += 0.25
        } else if (b.state === 'exposed') {
          sy = 0.94 + Math.sin(this.time * 12) * 0.03
        } else if (b.state === 'phaseChange') {
          sy = 1.2 + Math.sin(this.time * 30) * 0.08
          sx = 1.2
        } else if (b.state === 'dead') {
          tilt = Math.min(1.5, s.phaseT * 2.2)
          sy = 1
        }
        bv.card.rotation.z = wob
        bv.card.rotation.x = -tilt
        bv.overlay.rotation.copy(bv.card.rotation)
        bv.card.scale.set(sx, sy, 1)
        bv.overlay.scale.copy(bv.card.scale)
        bv.card.position.y = (bv.h / 2) * sy + (b.state === 'attack' && b.attack === 'stomp' ? Math.max(0, b.stateT) * 3 : 0)
        bv.overlay.position.y = bv.card.position.y
        const om = bv.overlay.material as THREE.MeshBasicMaterial
        om.opacity = b.state === 'telegraph' ? 0.25 + Math.sin(this.time * 30) * 0.2 : b.hitFlash > 0 ? 0.6 : b.state === 'phaseChange' ? 0.3 : 0
        om.color.set(b.hitFlash > 0 ? 0xffffff : 0xff3030)
        const rm = bv.ring.material as THREE.MeshBasicMaterial
        rm.opacity = b.state === 'exposed' ? 0.55 + Math.sin(this.time * 10) * 0.3 : 0
        bv.ring.scale.setScalar(b.state === 'exposed' ? 1 + Math.sin(this.time * 10) * 0.1 : 1)
      }
    } else {
      this.removeBoss()
    }

    // rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]
      r.life -= dt
      const k = 1 - r.life / r.max
      r.mesh.scale.setScalar(0.3 + k * r.grow)
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k)
      if (r.life <= 0) {
        this.scene.remove(r.mesh)
        r.mesh.geometry.dispose()
        this.rings.splice(i, 1)
      }
    }

    this.particles.update(dt)
    this.updateCamera(s, dt)
  }

  private flash(mats: THREE.Material[], color: number, strength: number) {
    for (const m of mats) {
      const mm = m as THREE.MeshToonMaterial
      if (!mm.emissive) continue
      if (strength > 0) {
        mm.emissive.set(color)
        mm.emissiveIntensity = strength
      } else {
        mm.emissiveIntensity = 0
      }
    }
  }

  private updateCamera(s: State, dt: number) {
    const p = s.player
    const portrait = this.camera.aspect < 1
    const back = (portrait ? 10.5 : 9) + this.bossMode * 3 + (this.giantScale - 1) * 3
    const up = (portrait ? 12 : 8.5) + this.bossMode * 2.5 + (this.giantScale - 1) * 3
    const lookAhead = 0.35
    let tx = p.x + p.vx * lookAhead
    let tz = p.z + p.vz * lookAhead
    if (s.boss && s.phase === 'boss') {
      tx = (tx * 2 + s.boss.x) / 3
      tz = (tz * 2 + s.boss.z) / 3
    }
    this.camTarget.lerp(this.tmpV.set(tx, 0.8, tz), Math.min(1, 6 * dt))
    const want = this.tmpS.set(this.camTarget.x, up, this.camTarget.z + back)
    this.camPos.lerp(want, Math.min(1, 5 * dt))
    this.shake = Math.max(0, this.shake - dt * 3.2)
    if (this.shake > 0) {
      const a = this.shake * this.shake * 0.5
      this.shakeX = (Math.random() - 0.5) * 2 * a
      this.shakeZ = (Math.random() - 0.5) * 2 * a
    } else {
      this.shakeX = this.shakeZ = 0
    }
    this.camera.position.set(this.camPos.x + this.shakeX, this.camPos.y + this.shakeZ * 0.5, this.camPos.z + this.shakeZ)
    this.camera.lookAt(this.camTarget.x + this.shakeX, this.camTarget.y, this.camTarget.z + this.shakeZ)
    this.sun.position.set(this.camTarget.x + 12, 22, this.camTarget.z + 8)
    this.sun.target.position.set(this.camTarget.x, 0, this.camTarget.z)
  }

  project(x: number, y: number, z: number): { x: number; y: number } {
    const v = this.tmpV.set(x, y, z).project(this.camera)
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight }
  }

  render() {
    this.gl.render(this.scene, this.camera)
  }
}
