// three.js driver. Reads State, draws it. Never mutates State.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import type { Boss, Feature, GameEvent, Npc, Pickup, Prop, PropKind, State } from '../sim/types.ts'
import { activePart, aimTarget, bossPhase, currentLevel, duoRadius, fightOf, groundY, isSky, isWater, screamRange } from '../sim/sim.ts'

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
  egg: 0xffd23f,
  nap: 0x4aa3ff,
  boomerang: 0xffd23f,
  giraffe: 0xf2c14e,
  decoy: 0xffd9b8,
}
import { ASSETS } from './assets.ts'
import { makeGiraffe, makeHat, makeKacone, makePartModel, makeProp, makeQuad, makeSkateboard, makeWings } from './models.ts'
import type { Flashable, ModelCtx } from './models.ts'

// One animal of a group boss: a 3D primitive build when we have one, else a cropped card.
interface PartView {
  obj: THREE.Object3D
  mats: THREE.Material[] | null // set for models; flash/gray/opacity go through these
  card: THREE.Mesh | null
  idx: number
  h: number
  fall: number
}
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


export interface PrevSnap {
  player: { x: number; y: number; z: number; facing: number }
  duo: { x: number; y: number; z: number }
  boss: { x: number; y: number; z: number } | null
  npcs: Map<number, { x: number; z: number }>
  props: Map<number, { x: number; z: number; rot: number }>
  poops: Map<number, { x: number; y: number; z: number }>
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
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
  private hats: THREE.Group
  private wings: THREE.Group
  private starTex: THREE.Texture | null = null
  private promptTex = new Map<string, THREE.Texture>()
  private prompts: { sprite: THREE.Sprite; life: number }[] = []
  private track: THREE.Mesh | null = null
  private beacon: THREE.Group | null = null // flag / gate at the goal position
  private herd: THREE.Group | null = null // stampede front
  private pigeon: THREE.Group | null = null // race rival
  private tube: THREE.Mesh | null = null // Kase's inner tube on the water level
  private giraffe!: THREE.Group
  private binky: THREE.Group | null = null // the boomerang binky in flight
  private decoyView: THREE.Group | null = null
  private skyDeco: THREE.Group | null = null // cloud puffs and birds on the sky level
  private toonFn = (c: number) => this.toon(c)
  private modelCtx: ModelCtx = { toon: this.toonFn, gradient: this.gradient, promptSprite: (t: string) => this.promptSprite(t) }
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
  private boss: { group: THREE.Group; card: THREE.Mesh; overlay: THREE.Mesh; ring: THREE.Mesh; def: Boss['def']; h: number; partKey: string; parts: PartView[]; model: (THREE.Group & Flashable) | null } | null = null
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
  private walkTS = 1
  private flyTilt = 0
  private skyCam = false
  private aimArrow: THREE.Mesh
  private arc: THREE.Line
  private landing: THREE.Mesh
  private targetMark: THREE.Mesh
  private viewFacing = 0
  // previous-tick positions for render interpolation (filled by main before each sim step)
  prev: PrevSnap | null = null
  alpha = 1
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
    const arrowGeo = new THREE.ConeGeometry(0.28, 1.1, 4)
    arrowGeo.rotateX(Math.PI / 2)
    arrowGeo.translate(0, 0, 1.3)
    this.aimArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }))
    this.aimArrow.visible = false
    this.scene.add(this.aimArrow)
    const arcGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 24 }, () => new THREE.Vector3()))
    this.arc = new THREE.Line(arcGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: 0.9, depthWrite: false }))
    this.arc.visible = false
    this.scene.add(this.arc)
    const landGeo = new THREE.RingGeometry(0.35, 0.5, 20)
    landGeo.rotateX(-Math.PI / 2)
    this.landing = new THREE.Mesh(landGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }))
    this.landing.visible = false
    this.scene.add(this.landing)
    const tGeo = new THREE.RingGeometry(0.5, 0.65, 20)
    tGeo.rotateX(-Math.PI / 2)
    this.targetMark = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false }))
    this.targetMark.visible = false
    this.scene.add(this.targetMark)
    const coneGeo = new THREE.CircleGeometry(1, 20, -Math.PI / 2 - Math.PI / 3, (Math.PI * 2) / 3)
    coneGeo.rotateX(-Math.PI / 2)
    this.chargeCone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.22, depthWrite: false }))
    this.chargeCone.position.y = 0.04
    this.chargeCone.visible = false
    this.scene.add(this.chargeCone)
    this.scene.add(this.player)
    this.scene.add(this.duo)
    this.board = makeSkateboard(this.modelCtx)
    this.board.visible = false
    this.scene.add(this.board)
    this.quad = makeQuad(this.modelCtx)
    this.quad.visible = false
    this.scene.add(this.quad)
    this.giraffe = makeGiraffe(this.toonFn)
    this.giraffe.visible = false
    this.scene.add(this.giraffe)
    this.hat = makeHat(this.modelCtx)
    this.hat.visible = false
    this.player.add(this.hat)
    this.wings = makeWings(this.modelCtx)
    this.wings.visible = false
    this.player.add(this.wings)
    this.hats = new THREE.Group()
    this.hats.position.y = 1.02
    this.player.add(this.hats)
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
    const sky = isSky(s)
    const water = isWater(s)
    this.skyCam = sky
    this.ground = this.makeContinent(s.arena.ring, 1, sky ? 1.6 : 0.7, th.ground, th.ground2, !sky && !water)
    this.ground.position.y = sky ? -1.6 : water ? -0.35 : -0.7
    this.scene.add(this.ground)
    this.sand = this.makeContinent(s.arena.ring, 1.045, 0.5, sky ? 0xffffff : water ? 0xdff4ff : 0xe8d59a, sky ? 0xf4f8ff : water ? 0xcfeaff : 0xe0c98a, false)
    this.sand.position.y = sky ? -2.4 : water ? -0.7 : -1.05
    this.scene.add(this.sand)
    if (water) {
      // the big dip: darker water around Kacone's volcano where the guardians drift
      const dip = new THREE.Mesh(new THREE.CircleGeometry(17, 48), new THREE.MeshToonMaterial({ color: 0x143f80, gradientMap: this.gradient, transparent: true, opacity: 0.75 }))
      dip.rotation.x = -Math.PI / 2
      dip.position.set(0, 0.02, -11)
      this.ground.add(dip)
      dip.position.y -= this.ground.position.y - 0.02
    }
    this.water = sky ? this.makeSkyFloor() : this.makeWater()
    this.scene.add(this.water)
    if (this.track) this.scene.remove(this.track)
    this.track = null
    this.hats.clear()
    this.themeSky.set(th.sky)
    this.themeFog.set(th.fog)
    this.bossMode = 0
    if (this.stage) this.scene.remove(this.stage)
    this.stage = null
    this.spot.intensity = 0
    for (const v of this.featureViews.values()) this.scene.remove(v)
    this.featureViews.clear()
    for (const f of s.features) this.addFeature(f, sky ? 0x7ec850 : th.ground2)
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
    this.removeGoalViews()
    if (this.skyDeco) this.scene.remove(this.skyDeco)
    this.skyDeco = sky ? this.makeSkyDeco(s) : null
    if (this.skyDeco) this.scene.add(this.skyDeco)
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
    } else if (f.kind === 'volcano') {
      // Poodoom: a tiered poop mound with red eyes and a green gem, by Louie
      const g = new THREE.Group()
      const brown = this.toon(0x6b3e1e)
      const dark = this.toon(0x4a2a12)
      const tiers = [
        [1.9, 0.8, 0],
        [1.5, 0.75, 0.75],
        [1.1, 0.7, 1.45],
        [0.7, 0.6, 2.1],
      ]
      tiers.forEach(([r, h, y], i) => {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r, h, 14), i % 2 ? dark : brown)
        t.position.y = f.h + y + h / 2
        t.castShadow = true
        g.add(t)
      })
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.6, 12), brown)
      tip.position.y = f.h + 3.0
      g.add(tip)
      for (const x of [-0.32, 0.32]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }))
        eye.position.set(x, f.h + 2.35, 0.62)
        g.add(eye)
      }
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshToonMaterial({ color: 0x2ecc71, gradientMap: this.gradient, emissive: 0x2ecc71, emissiveIntensity: 0.5 }))
      gem.position.set(0, f.h + 1.1, 1.25)
      gem.name = 'gem'
      g.add(gem)
      const glow = new THREE.Mesh(new THREE.CircleGeometry(f.r + 1.2, 24), new THREE.MeshBasicMaterial({ color: 0xff7f27, transparent: true, opacity: 0.0, depthWrite: false }))
      glow.rotation.x = -Math.PI / 2
      glow.position.y = f.h + 0.05
      glow.name = 'glow'
      g.add(glow)
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

  // Puffy clouds drifting at many heights, a cloud cushion under every island, and a few birds.
  private makeSkyDeco(s: State): THREE.Group {
    const g = new THREE.Group()
    const puffMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: this.gradient, transparent: true, opacity: 0.92 })
    const puff = (x: number, y: number, z: number, size: number, drift: number) => {
      const c = new THREE.Group()
      const n = 3 + Math.floor(Math.random() * 3)
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(size * (0.55 + Math.random() * 0.5), 8, 6), puffMat)
        m.position.set((Math.random() - 0.5) * size * 1.6, (Math.random() - 0.5) * size * 0.5, (Math.random() - 0.5) * size * 1.2)
        c.add(m)
      }
      c.position.set(x, y, z)
      c.userData.drift = drift
      c.userData.baseY = y
      c.name = 'puff'
      g.add(c)
    }
    const A = s.arena
    for (let i = 0; i < 34; i++) {
      const x = A.minX - 10 + Math.random() * (A.w + 20)
      const z = A.minZ - 10 + Math.random() * (A.d + 20)
      puff(x, -6 + Math.random() * 18, z, 1.2 + Math.random() * 2.2, 0.3 + Math.random() * 0.8)
    }
    for (const f of s.features) {
      if (f.kind !== 'platform') continue
      puff(f.x, -0.6, f.z, f.r * 0.9, 0)
    }
    const birdMat = this.toon(0x333344)
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Group()
      for (const side of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.18), birdMat)
        w.position.x = side * 0.3
        w.rotation.y = side * 0.4
        w.name = 'wing'
        b.add(w)
      }
      b.userData.angle = Math.random() * Math.PI * 2
      b.userData.radius = 22 + Math.random() * 14
      b.userData.height = 6 + Math.random() * 6
      b.userData.speed = 0.15 + Math.random() * 0.15
      b.name = 'bird'
      g.add(b)
    }
    return g
  }

  private makeSkyFloor(): THREE.Mesh {
    const tex = this.checker(0x7cc4ff, 0x8fd0ff, 2)
    tex.repeat.set(40, 40)
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ map: tex }))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = -14
    return mesh
  }

  private promptSprite(text: string): THREE.Sprite {
    let tex = this.promptTex.get(text)
    if (!tex) {
      const cv = document.createElement('canvas')
      cv.width = 96
      cv.height = 96
      const ctx = cv.getContext('2d')!
      ctx.font = '64px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, 48, 52)
      tex = new THREE.CanvasTexture(cv)
      this.promptTex.set(text, tex)
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
    sp.scale.setScalar(1.3)
    return sp
  }


  // ------------------------------------------------------------ props

  private ensureProp(pr: Prop) {
    let v = this.propViews.get(pr.id)
    if (v) return v
    v = makeProp(this.modelCtx, pr.kind, pr.color) as THREE.Group & Flashable
    this.propViews.set(pr.id, v)
    this.scene.add(v)
    return v
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
    if (n.kind === 'adult' || n.kind === 'thief') {
      const thief = n.kind === 'thief'
      const shirt = thief ? 0x222233 : [0x4aa3ff, 0xff8fab, 0xffb020, 0x9b6bff, 0x4cd137][n.id % 5]
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.55, 4, 10), mat(shirt))
      torso.position.y = 0.62
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), mat(0xffd9b8))
      head.position.y = 1.22
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.3), mat(thief ? 0x222233 : 0x33415c))
      legs.position.y = 0.18
      torso.castShadow = head.castShadow = legs.castShadow = true
      body.add(torso, head, legs)
      if (thief) {
        for (const y of [0.45, 0.65, 0.85]) {
          const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.06, 10), mat(0xffffff))
          stripe.position.y = y
          body.add(stripe)
        }
        const mask = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.2), mat(0x111111))
        mask.position.set(0, 1.26, 0.14)
        body.add(mask)
        const sack = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(0xd9a066))
        sack.position.set(-0.3, 0.9, -0.2)
        body.add(sack)
      }
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
    } else if (n.kind === 'mini') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mat(0x2e9e3a))
      body.position.y = 0.34
      const hatb = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.22, 10), mat(0xf2c14e))
      hatb.position.y = 0.66
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), mat(0xffb020))
      beak.rotation.x = Math.PI / 2
      beak.position.set(0, 0.34, 0.3)
      body.castShadow = true
      const wrap = new THREE.Group()
      wrap.add(body, hatb, beak)
      const eyes = new THREE.Group()
      for (const x of [-0.09, 0.09]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }))
        e.position.set(x, 0.42, 0.24)
        const pu = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }))
        pu.position.set(x, 0.42, 0.28)
        eyes.add(e, pu)
      }
      wrap.add(eyes)
      g.eyes = eyes
      g.body = wrap
      g.add(wrap)
      this.addCoverBlob(g, 0.45, 0.4)
      this.npcViews.set(n.id, g)
      this.scene.add(g)
      return g
    } else if (n.kind === 'jelly') {
      // Kelly Jelly by Louie: a toothy dome with spikes and tentacles
      const jellyMat = new THREE.MeshToonMaterial({ color: 0xff7ab8, gradientMap: this.gradient, transparent: true, opacity: 0.8 })
      g.mats.push(jellyMat)
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), jellyMat)
      dome.position.y = 0.35
      dome.castShadow = true
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.48, 0.18, 14), jellyMat)
      skirt.position.y = 0.27
      body.add(dome, skirt)
      const spike = mat(0xffd23f)
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 5), i % 2 ? spike : mat(0xff3b3b))
        sp.position.set(Math.cos(a) * 0.4, 0.78, Math.sin(a) * 0.4)
        sp.rotation.z = -Math.cos(a) * 0.6
        sp.rotation.x = Math.sin(a) * 0.6
        body.add(sp)
      }
      const tent = mat(0xff9ccb)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 5), tent)
        t.position.set(Math.cos(a) * 0.3, 0.02, Math.sin(a) * 0.3)
        t.name = 'tentacle'
        body.add(t)
      }
      const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.08), mat(0xffffff))
      teeth.position.set(0, 0.42, 0.5)
      body.add(teeth)
      const eyes = new THREE.Group()
      for (const x of [-0.16, 0.16]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }))
        e.position.set(x, 0.62, 0.46)
        eyes.add(e)
      }
      g.eyes = eyes
      body.add(eyes)
      g.body = body
      g.add(body)
      this.addCoverBlob(g, 0.45, 0.6)
      this.npcViews.set(n.id, g)
      this.scene.add(g)
      return g
    } else if (n.kind === 'fly' || n.kind === 'bigfly') {
      const big = n.kind === 'bigfly'
      const k = big ? 1.8 : 1
      const bug = new THREE.Mesh(new THREE.SphereGeometry(0.2 * k, 8, 6), mat(0x222222))
      bug.position.y = 1.0
      bug.scale.set(1, 0.8, 1.3)
      bug.castShadow = true
      body.add(bug)
      const wingMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
      for (const side of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.3 * k, 0.16 * k), wingMat)
        w.position.set(side * 0.2 * k, 1.1, 0)
        w.rotation.x = -Math.PI / 2
        w.name = side < 0 ? 'wingL' : 'wingR'
        body.add(w)
      }
      const eyes = new THREE.Group()
      for (const x of [-0.08, 0.08]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.05 * k, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }))
        e.position.set(x * k, 1.06, 0.22 * k)
        eyes.add(e)
      }
      g.eyes = eyes
      body.add(eyes)
      g.body = body
      g.add(body)
      this.addCoverBlob(g, 1.0, 0.3 * k)
      this.npcViews.set(n.id, g)
      this.scene.add(g)
      return g
    } else if (n.kind === 'chicken' || n.kind === 'king') {
      const king = n.kind === 'king'
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat(king ? 0xfff2c4 : 0xffffff))
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
      if (king) {
        const gold = mat(0xffd23f)
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.12, 8), gold)
        crown.position.set(0, 0.8, 0.2)
        body.add(crown)
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2
          const pt = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), gold)
          pt.position.set(Math.cos(a) * 0.12, 0.9, 0.2 + Math.sin(a) * 0.12)
          body.add(pt)
        }
        const cape = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.05), mat(0xd93a3a))
        cape.position.set(0, 0.3, -0.3)
        cape.rotation.x = 0.3
        body.add(cape)
      }
      const wrap = new THREE.Group()
      wrap.add(body)
      body.position.y = 0
      wrap.position.y = 0.05
      // reuse the group as body so bob/tilt apply
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      g.add(wrap)
      g.body = wrap
      this.addCoverBlob(g, 0.4, 0.38)
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
    this.addCoverBlob(g, n.kind === 'adult' ? 0.75 : 0.4, n.kind === 'adult' ? 0.55 : 0.35)
    this.npcViews.set(n.id, g)
    this.scene.add(g)
    return g
  }

  private addCoverBlob(g: THREE.Group, y: number, r: number) {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshToonMaterial({ color: 0x6b3e1e, gradientMap: this.gradient, transparent: true, opacity: 0 }))
    blob.position.y = y
    blob.scale.set(1.15, 1.35, 1.15)
    blob.name = 'cover'
    g.add(blob)
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
      const b = makeSkateboard(this.modelCtx)
      b.rotation.z = 0.35
      g.add(b)
    } else if (k.kind === 'megaphone') {
      const cone = add(new THREE.ConeGeometry(0.28, 0.5, 12), 0xff5c5c, 0, 0.45, 0, -Math.PI / 2)
      cone.rotation.z = 0.2
      add(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), 0x1b1b2f, 0, 0.25, -0.25, Math.PI / 2)
    } else if (k.kind === 'fedora') {
      const h = makeHat(this.modelCtx)
      h.position.y = 0.35
      h.rotation.z = 0.3
      g.add(h)
    } else if (k.kind === 'quad') {
      const q = makeQuad(this.modelCtx)
      q.scale.setScalar(0.7)
      g.add(q)
    } else if (k.kind === 'wings') {
      const w = makeWings(this.modelCtx)
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
    } else if (k.kind === 'egg') {
      const egg = add(new THREE.SphereGeometry(0.3, 12, 10), 0xffd23f, 0, 0.5)
      egg.scale.set(1, 1.3, 1)
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.35 }))
      glow.position.y = 0.5
      glow.scale.set(1, 1.3, 1)
      g.add(glow)
    } else if (k.kind === 'potato') {
      const pot = add(new THREE.SphereGeometry(0.28, 10, 8), 0xc49a6c, 0, 0.45)
      pot.scale.set(1.3, 0.9, 1)
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), 0x1b1b2f, 0.1, 0.75)
      add(new THREE.SphereGeometry(0.06, 6, 6), 0xff5c5c, 0.1, 0.9)
    } else if (k.kind === 'nap') {
      const pillow = add(new THREE.BoxGeometry(0.6, 0.22, 0.42), 0x4aa3ff, 0, 0.4)
      pillow.rotation.z = 0.15
      const z = this.promptSprite('💤')
      z.position.y = 0.95
      z.scale.setScalar(0.8)
      g.add(z)
    } else if (k.kind === 'boomerang') {
      add(new THREE.TorusGeometry(0.22, 0.06, 8, 16), 0xffd23f, 0, 0.45, 0, Math.PI / 2)
      add(new THREE.SphereGeometry(0.12, 10, 8), 0xff8fab, 0, 0.45, 0.14)
      for (const side of [-1, 1]) {
        const w = add(new THREE.PlaneGeometry(0.4, 0.22), 0xffffff, side * 0.36, 0.5, 0)
        w.rotation.y = side * 0.5
      }
    } else if (k.kind === 'giraffe') {
      const gf = makeGiraffe(this.toonFn)
      gf.scale.setScalar(0.32)
      g.add(gf)
    } else if (k.kind === 'decoy') {
      add(new THREE.CapsuleGeometry(0.16, 0.2, 4, 8), 0xffffff, 0, 0.3)
      add(new THREE.SphereGeometry(0.2, 10, 8), 0xffd9b8, 0, 0.68)
      add(new THREE.TorusGeometry(0.07, 0.025, 6, 12), 0xffd23f, 0, 0.62, 0.18)
      add(new THREE.ConeGeometry(0.05, 0.16, 5), 0x8b5a2b, 0, 0.92)
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
      for (const pv of this.boss.parts) pv.obj.parent?.remove(pv.obj)
      this.boss = null
    }
  }

  // A drawing as a bordered paper card; uv crops one animal out of a group drawing.
  private bossTexture(file: string, uv?: [number, number, number, number]): Promise<THREE.Texture> {
    const key = uv ? `${file}|${uv.join(',')}` : file
    const cached = this.bossTextures.get(key)
    if (cached) return Promise.resolve(cached)
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const sx = uv ? Math.round(uv[0] * img.width) : 0
        const sy = uv ? Math.round(uv[1] * img.height) : 0
        const sw = uv ? Math.round((uv[2] - uv[0]) * img.width) : img.width
        const sh = uv ? Math.round((uv[3] - uv[1]) * img.height) : img.height
        const border = Math.round(Math.max(sw, sh) * 0.045)
        const cv = document.createElement('canvas')
        cv.width = sw + border * 2
        cv.height = sh + border * 2
        const ctx = cv.getContext('2d')!
        ctx.fillStyle = '#fffaf0'
        ctx.beginPath()
        const r = border * 1.5
        ctx.roundRect(0, 0, cv.width, cv.height, r)
        ctx.fill()
        ctx.drawImage(img, sx, sy, sw, sh, border, border, sw, sh)
        const tex = new THREE.CanvasTexture(cv)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 4
        this.bossTextures.set(key, tex)
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
    const parts: PartView[] = []
    b.parts.forEach((part, idx) => {
      const ph = part.def.scale
      const model = makePartModel(this.toonFn, part.def.kind)
      if (model) {
        model.position.set(part.x, 0, part.z)
        model.visible = false
        this.scene.add(model)
        parts.push({ obj: model, mats: model.mats, card: null, idx, h: ph, fall: 0 })
        return
      }
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ph * 0.75, ph), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true }))
      mesh.castShadow = true
      mesh.position.set(part.x, ph / 2, part.z)
      mesh.visible = false
      this.scene.add(mesh)
      parts.push({ obj: mesh, mats: null, card: mesh, idx, h: ph, fall: 0 })
      void this.bossTexture(def.drawing, part.def.uv).then((tex) => {
        if (!tex.image || !this.boss || this.boss.def.id !== def.id) return
        const img = tex.image as HTMLCanvasElement
        mesh.geometry.dispose()
        mesh.geometry = new THREE.PlaneGeometry((ph * img.width) / img.height, ph)
        ;(mesh.material as THREE.MeshBasicMaterial).map = tex
        ;(mesh.material as THREE.MeshBasicMaterial).needsUpdate = true
      })
    })
    let model: (THREE.Group & Flashable) | null = null
    if (def.id === 'kacone') {
      model = makeKacone(this.toonFn)
      group.add(model)
      card.visible = false
      overlay.visible = false
    }
    this.boss = { group, card, overlay, ring, def, h, partKey: '', parts, model }
    await this.setBossCard(def.id, def.drawing, undefined, h)
  }

  // Swap what the main card shows: the whole drawing, or one animal's crop at its own height.
  private async setBossCard(id: string, file: string, uv: [number, number, number, number] | undefined, h: number) {
    const tex = await this.bossTexture(file, uv)
    const bv = this.boss
    if (!bv || bv.def.id !== id || !tex.image) return
    const img = tex.image as HTMLCanvasElement
    const w = (h * img.width) / img.height
    bv.h = h
    bv.card.geometry.dispose()
    bv.card.geometry = new THREE.PlaneGeometry(w, h)
    bv.overlay.geometry.dispose()
    bv.overlay.geometry = new THREE.PlaneGeometry(w, h)
    const m = bv.card.material as THREE.MeshBasicMaterial
    m.map = tex
    m.transparent = true
    m.needsUpdate = true
  }

  // ------------------------------------------------------------ level goals

  private removeGoalViews() {
    for (const g of [this.beacon, this.herd, this.pigeon]) if (g) this.scene.remove(g)
    this.beacon = this.herd = this.pigeon = null
  }

  // Flag or gate at the goal spot, the stampede front, and the racing pigeon.
  private syncGoalViews(s: State, dt: number) {
    const live = s.phase === 'wreck'
    if (live && s.goalPos && s.goal.kind !== 'protect') {
      if (!this.beacon) {
        const g = new THREE.Group()
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 8), this.toon(0xeeeeee))
        pole.position.y = 1.6
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshBasicMaterial({ color: 0x4cd137, side: THREE.DoubleSide }))
        flag.position.set(0.6, 2.8, 0)
        flag.name = 'flag'
        const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.9, 32), new THREE.MeshBasicMaterial({ color: 0x4cd137, transparent: true, opacity: 0.6, depthWrite: false }))
        ring.rotation.x = -Math.PI / 2
        ring.position.y = 0.05
        ring.name = 'ring'
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 9, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x4cd137, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }))
        pillar.position.y = 4.5
        g.add(pole, flag, ring, pillar)
        this.scene.add(g)
        this.beacon = g
      }
      const b = this.beacon
      b.position.set(s.goalPos.x, groundY(s, s.goalPos.x, s.goalPos.z, 3), s.goalPos.z)
      const flag = b.getObjectByName('flag')
      if (flag) flag.rotation.y = Math.sin(this.time * 4) * 0.25
      const ring = b.getObjectByName('ring')
      if (ring) ring.scale.setScalar(1 + Math.sin(this.time * 5) * 0.08)
    } else if (this.beacon) {
      this.scene.remove(this.beacon)
      this.beacon = null
    }

    if (live && s.stampede) {
      const st = s.stampede
      if (!this.herd) {
        const g = new THREE.Group()
        const hide = this.toon(0x6b4a2a)
        const dark = this.toon(0x3a2a1a)
        for (let i = 0; i < 26; i++) {
          const beast = new THREE.Group()
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.5), hide)
          body.position.y = 0.75
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.6), dark)
          head.position.set(0, 0.95, 0.9)
          const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 5), this.toon(0xeeeeee))
          hornL.position.set(-0.25, 1.3, 0.9)
          hornL.rotation.z = 0.5
          const hornR = hornL.clone()
          hornR.position.x = 0.25
          hornR.rotation.z = -0.5
          body.castShadow = true
          beast.add(body, head, hornL, hornR)
          beast.position.set((i - 12.5) * 2.4, 0, (i % 3) * -1.6 - (i % 2) * 0.8)
          beast.name = 'beast'
          g.add(beast)
        }
        const dust = new THREE.Mesh(new THREE.PlaneGeometry(64, 6), new THREE.MeshBasicMaterial({ color: 0xc9a06a, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }))
        dust.position.set(0, 2.5, -2)
        dust.name = 'dust'
        g.add(dust)
        this.scene.add(g)
        this.herd = g
      }
      const h = this.herd
      h.position.set(st.dirX * st.front, 0, st.dirZ * st.front)
      h.rotation.y = Math.atan2(st.dirX, st.dirZ)
      let i = 0
      for (const c of h.children) {
        if (c.name !== 'beast') continue
        c.position.y = Math.abs(Math.sin(this.time * 14 + i * 1.7)) * 0.35
        c.rotation.x = Math.sin(this.time * 14 + i * 1.7) * 0.15
        i++
      }
      const dust = h.getObjectByName('dust') as THREE.Mesh | undefined
      if (dust) (dust.material as THREE.MeshBasicMaterial).opacity = 0.25 + (st.surgeT > 0 ? 0.3 : 0) + Math.sin(this.time * 9) * 0.05
    } else if (this.herd) {
      this.scene.remove(this.herd)
      this.herd = null
    }

    if (live && s.rival) {
      const rv = s.rival
      if (!this.pigeon) {
        const g = new THREE.Group()
        const grey = this.toon(0x9aa4b8)
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), grey)
        body.scale.set(1, 0.85, 1.3)
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), this.toon(0x6b7a99))
        head.position.set(0, 0.25, 0.38)
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), this.toon(0xffb020))
        beak.rotation.x = Math.PI / 2
        beak.position.set(0, 0.22, 0.58)
        const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.4), grey)
        wingL.position.set(-0.5, 0.1, 0)
        wingL.name = 'wingL'
        const wingR = wingL.clone()
        wingR.position.x = 0.5
        wingR.name = 'wingR'
        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }))
        eyeL.position.set(-0.08, 0.3, 0.5)
        const eyeR = eyeL.clone()
        eyeR.position.x = 0.08
        body.castShadow = true
        g.add(body, head, beak, wingL, wingR, eyeL, eyeR)
        this.scene.add(g)
        this.pigeon = g
      }
      const g = this.pigeon
      g.position.set(rv.x, rv.y, rv.z)
      g.rotation.y = rv.facing
      const flap = rv.stallT > 0 ? Math.sin(this.time * 40) * 0.9 : Math.sin(this.time * 18) * 0.6
      const wl = g.getObjectByName('wingL')
      const wr = g.getObjectByName('wingR')
      if (wl) wl.rotation.z = flap
      if (wr) wr.rotation.z = -flap
      g.rotation.z = rv.stallT > 0 ? Math.sin(this.time * 30) * 0.3 : 0
      void dt
    } else if (this.pigeon) {
      this.scene.remove(this.pigeon)
      this.pigeon = null
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
        this.particles.burst(x, 1.2, z, 30, e.kind === 'egg' ? 0xffd23f : 0x2b2b3a, 4, 0.14)
        this.particles.burst(x, 1.2, z, 12, 0xffd23f, 3, 0.12)
        break
      case 'frozen':
        this.particles.burst(x, 0.8, z, 14, 0x6b3e1e, 2.5, 0.12)
        break
      case 'tooClose':
      case 'needScream':
      case 'needPoop': {
        const sp = this.promptSprite(e.t === 'needScream' ? '🔊' : e.t === 'tooClose' ? '↩️' : '💩')
        sp.position.set(x, 2.4, z)
        sp.scale.setScalar(1.8)
        this.scene.add(sp)
        this.prompts.push({ sprite: sp, life: 0.8 })
        break
      }
      case 'covered':
        if (e.kind === 'nest') {
          this.addShake(0.4)
          this.particles.burst(x, 0.8, z, 30, 0x6b3e1e, 4, 0.18)
        }
        this.particles.burst(x, 1.4, z, 30, 0x6b3e1e, 4, 0.16)
        break
      case 'bossSlip':
        this.particles.burst(x, 0.5, z, 24, 0x6b3e1e, 4, 0.16)
        this.addShake(0.5)
        break
      case 'flap':
        this.particles.burst(x, e.y ?? 1, z, 3, 0xffffff, 1.2, 0.08)
        break
      case 'miniHatch':
        this.particles.burst(x, 0.8, z, 16, 0xffd23f, 3, 0.12)
        break
      case 'congaSmash':
        this.particles.burst(x, 0.8, z, 10, 0xff8fab, 3, 0.12)
        break
      case 'nap':
        this.particles.burst(x, 0.8, z, 30, 0x4aa3ff, 4, 0.18)
        this.particles.burst(x, 1.2, z, 12, 0xffffff, 2, 0.12)
        if (e.range) this.ring(x, z, 0, e.range, 0x4aa3ff, 0.5, false)
        break
      case 'boomerang':
        this.particles.burst(x, 0.9, z, 8, 0xffd23f, 2, 0.1)
        break
      case 'decoy':
        this.particles.burst(x, 0.8, z, (e.big ?? 0) > 0 ? 16 : 10, 0xffffff, 3, 0.14)
        break
      case 'erupt':
        if ((e.big ?? 0) > 0) {
          this.addShake(0.7)
          this.particles.burst(x, 3.2, z, 40, 0x6b3e1e, 7, 0.22)
          this.particles.burst(x, 3.0, z, 16, 0xff7f27, 4, 0.18)
        } else this.addShake(0.15)
        break
      case 'npcPop':
        this.particles.burst(x, 0.6, z, e.kind === 'jelly' ? 28 : 10, e.kind === 'jelly' ? 0xff7ab8 : 0x333344, 4, 0.16)
        this.particles.burst(x, 0.4, z, 10, 0xffffff, 3, 0.1)
        break
      case 'poopedOn':
        this.particles.burst(x, 1.4, z, 12, 0x6b3e1e, 2.5, 0.14)
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
    // shake fights aiming; keep it tiny while flying
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
    const a = this.alpha
    const pv = this.prev
    const px = pv ? pv.player.x + (p.x - pv.player.x) * a : p.x
    const py = pv ? pv.player.y + (p.y - pv.player.y) * a : p.y
    const pz = pv ? pv.player.z + (p.z - pv.player.z) * a : p.z
    const pfRaw = pv ? lerpAngle(pv.player.facing, p.facing, a) : p.facing
    // view facing lerps toward the sim facing (~0.1 s) so turns never snap
    this.viewFacing = lerpAngle(this.viewFacing, pfRaw, Math.min(1, dt * 14))
    const pf = this.viewFacing
    // player
    const riding = p.ride === 'skateboard'
    const quad = p.ride === 'quad'
    const giraffe = p.ride === 'giraffe'
    this.player.position.set(px, py + (riding ? 0.16 : quad ? 0.55 : giraffe ? 1.45 : p.inLake ? -0.3 : 0), pz)
    this.player.rotation.y = pf
    const afloat = isWater(s) && p.gy <= 0.05 && p.y <= 0.05
    if (afloat && !this.tube) {
      const tube = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.2, 10, 20), this.toon(0xffd23f))
      tube.rotation.x = Math.PI / 2
      tube.position.y = 0.12
      const duck = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), this.toon(0xffd23f))
      duck.position.set(0, 0.3, 0.62)
      tube.add(duck)
      this.tube = tube
      this.player.add(tube)
    }
    if (this.tube) {
      this.tube.visible = afloat
      this.tube.rotation.z = Math.sin(this.time * 3) * 0.06
    }
    if (this.skyDeco) {
      for (const c of this.skyDeco.children) {
        if (c.name === 'puff') {
          c.position.x += c.userData.drift * dt
          c.position.y = c.userData.baseY + Math.sin(this.time * 0.6 + c.position.z) * 0.25
          if (c.position.x > s.arena.maxX + 14) c.position.x = s.arena.minX - 14
        } else if (c.name === 'bird') {
          c.userData.angle += c.userData.speed * dt
          const a = c.userData.angle
          c.position.set(Math.cos(a) * c.userData.radius, c.userData.height + Math.sin(this.time * 2 + a) * 0.4, Math.sin(a) * c.userData.radius)
          c.rotation.y = -a
          const flap = Math.sin(this.time * 8 + a) * 0.6
          for (const w of c.children) w.rotation.z = (w.position.x < 0 ? -1 : 1) * flap
        }
      }
    }
    for (const f of s.features) {
      if (f.kind !== 'volcano') continue
      const view = this.featureViews.get(f.id)
      const glow = view?.getObjectByName('glow') as THREE.Mesh | undefined
      if (glow) (glow.material as THREE.MeshBasicMaterial).opacity = f.cd < 1.2 ? 0.35 + Math.sin(this.time * 25) * 0.2 : 0
      const gem = view?.getObjectByName('gem')
      if (gem) gem.rotation.y = this.time * 2
    }
    // in the air the baby stays upright, leaning a little into his velocity
    const airborne = !p.grounded ? 1 : 0
    this.flyTilt += (airborne - this.flyTilt) * Math.min(1, dt * 6)
    if (this.playerModel) {
      const fwd = (p.vx * Math.sin(pf) + p.vz * Math.cos(pf)) / 6
      this.playerModel.rotation.x = -Math.max(-0.35, Math.min(0.35, fwd)) * this.flyTilt
      this.playerModel.rotation.z = 0
    }
    // facing arrow always on (faint), bright while aiming; flight arc + landing ring while holding poop
    const aiming = p.screamCharging || p.poopHeld
    this.aimArrow.visible = s.phase === 'wreck' || s.phase === 'boss'
    this.aimArrow.position.set(px, py + 0.06, pz)
    this.aimArrow.rotation.y = pf
    ;(this.aimArrow.material as THREE.MeshBasicMaterial).opacity = aiming ? 0.9 : 0.3
    this.arc.visible = p.poopHeld && !p.screamCharging
    this.landing.visible = this.arc.visible
    if (this.arc.visible) this.updateArc(s, px, py, pz, pf)
    // auto-aim target highlight while aiming without a mouse/drag
    const tgt = aiming && !p.hasAim ? aimTarget(s, p.poopHeld ? 9 : screamRange(p, Math.max(0.25, p.screamCharge))) : null
    this.targetMark.visible = !!tgt
    if (tgt) {
      this.targetMark.position.set(tgt.x, 0.05, tgt.z)
      this.targetMark.scale.setScalar(1 + Math.sin(this.time * 8) * 0.1)
    }
    this.board.visible = riding
    this.quad.visible = quad
    this.giraffe.visible = giraffe
    if (giraffe) {
      this.giraffe.position.set(px, py, pz)
      this.giraffe.rotation.y = pf
      const sp = Math.hypot(p.vx, p.vz)
      let li = 0
      for (const c of this.giraffe.children) {
        if (c.name !== 'leg') continue
        c.rotation.x = Math.sin(this.time * 10 + (li % 2) * Math.PI) * 0.45 * Math.min(1, sp / 3)
        li++
      }
      this.giraffe.rotation.z = Math.sin(this.time * 5) * 0.03 * Math.min(1, sp / 3)
    }
    // boomerang binky in flight
    if (s.boomerang) {
      if (!this.binky) {
        const g = new THREE.Group()
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 16), this.toon(0xffd23f))
        ring.rotation.x = Math.PI / 2
        const nub = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), this.toon(0xff8fab))
        nub.position.z = 0.14
        for (const side of [-1, 1]) {
          const w = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.22), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: this.gradient, side: THREE.DoubleSide }))
          w.position.set(side * 0.36, 0.05, 0)
          g.add(w)
        }
        g.add(ring, nub)
        this.binky = g
        this.scene.add(g)
      }
      const b = s.boomerang
      this.binky.position.set(b.x, b.y, b.z)
      this.binky.rotation.y += dt * 25
      this.binky.visible = true
    } else if (this.binky) {
      this.binky.visible = false
    }
    // the decoy baby
    if (s.decoy) {
      if (!this.decoyView) {
        const g = new THREE.Group()
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.3, 4, 8), this.toon(0xffffff))
        body.position.y = 0.42
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), this.toon(0xffd9b8))
        head.position.y = 0.95
        const binky = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 6, 12), this.toon(0xffd23f))
        binky.position.set(0, 0.88, 0.26)
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), this.toon(0x8b5a2b))
        tuft.position.y = 1.28
        tuft.rotation.z = 0.3
        for (const x of [-0.1, 0.1]) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }))
          e.position.set(x, 1.0, 0.24)
          g.add(e)
        }
        body.castShadow = head.castShadow = true
        g.add(body, head, binky, tuft)
        const sign = this.promptSprite('🍼')
        sign.position.y = 1.8
        sign.scale.setScalar(0.9)
        g.add(sign)
        this.decoyView = g
        this.scene.add(g)
      }
      this.decoyView.visible = true
      this.decoyView.position.set(s.decoy.x, 0, s.decoy.z)
      this.decoyView.rotation.z = Math.sin(this.time * 6) * 0.12
      this.decoyView.scale.setScalar(Math.min(1, s.decoy.t * 3))
    } else if (this.decoyView) {
      this.decoyView.visible = false
    }
    this.hat.visible = p.fedora
    this.wings.visible = p.wings
    if (this.hats.children.length !== p.hats) {
      this.hats.clear()
      for (let i = 0; i < p.hats; i++) {
        const h = makeHat(this.modelCtx)
        h.position.y = i * 0.22
        h.rotation.z = (i % 2 ? 1 : -1) * 0.08
        this.hats.add(h)
      }
    }
    if (p.wings && !p.grounded) this.wings.rotation.z = Math.sin(this.time * (p.wingFuel > 0 ? 24 : 10)) * 0.6
    if (riding) {
      this.board.position.set(px, py, pz)
      this.board.rotation.y = pf
      this.board.rotation.z = Math.sin(this.time * 6) * 0.06
    }
    if (quad) {
      this.quad.position.set(px, py, pz)
      this.quad.rotation.y = pf
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
    const squash = 1 + p.screamFlash * 0.6 + ch * 0.35 + (ch > 0 ? Math.sin(this.time * 24) * 0.025 * ch : 0)
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
      this.chargeCone.position.set(px, p.flying ? py - 0.3 : 0.04, pz)
      this.chargeCone.rotation.y = p.facing
      this.chargeCone.scale.setScalar(screamRange(p, ch))
      const cm = this.chargeCone.material as THREE.MeshBasicMaterial
      cm.opacity = 0.15 + ch * 0.2
      cm.color.setHSL(0.13 - ch * 0.13, 1, 0.7)
    }
    const poopCharge = p.poopHeld ? Math.min(1, p.poopHoldT / 0.5) : 0
    if (poopCharge > 0) this.player.scale.y *= 1 - poopCharge * 0.12
    if (this.playerMixer) {
      const flyingNow = this.flyTilt > 0.5
      const want = flyingNow ? 'walk' : speed > 0.6 ? 'walk' : 'walk-idle'
      if (want !== this.playerCurrent && this.playerActions[want]) {
        const prev = this.playerActions[this.playerCurrent]
        const next = this.playerActions[want]
        next.reset().fadeIn(0.2).play()
        if (prev) prev.fadeOut(0.2)
        this.playerCurrent = want
      }
      const tsWant = flyingNow ? 0.45 : Math.max(0.7, Math.min(1.6, speed / 3.4))
      this.walkTS += (tsWant - this.walkTS) * Math.min(1, dt * 6)
      if (this.playerActions.walk) this.playerActions.walk.timeScale = this.walkTS
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
    this.duo.visible = d.active
    const dr = duoRadius(d)
    const dh = (dr / 0.45) * 1.05
    const dx = pv ? pv.duo.x + (d.x - pv.duo.x) * a : d.x
    const dy = pv ? pv.duo.y + (d.y - pv.duo.y) * a : d.y
    const dz = pv ? pv.duo.z + (d.z - pv.duo.z) * a : d.z
    this.duo.position.set(dx, dy + Math.abs(Math.sin(this.time * 9)) * 0.08 * (1 + d.power), dz)
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
      const pp = pv?.props.get(pr.id)
      if (pp) {
        v.position.set(pp.x + (pr.x - pp.x) * a, pr.y, pp.z + (pr.z - pp.z) * a)
        v.rotation.y = pp.rot + (pr.rot - pp.rot) * a
      } else {
        v.position.set(pr.x, pr.y, pr.z)
        v.rotation.y = pr.rot
      }
      if (pr.kind === 'statue' || pr.kind === 'evilbaby' || pr.kind === 'nest') {
        const cov = v.getObjectByName('cover') as THREE.Mesh | undefined
        if (cov) (cov.material as THREE.MeshToonMaterial).opacity = pr.cover * 0.95
      }
      if (pr.kind === 'snowball') {
        // roll about the axis perpendicular to travel; scale follows the sim radius
        const ball = v.getObjectByName('ball') as THREE.Mesh | undefined
        v.rotation.set(0, 0, 0)
        v.scale.setScalar(pr.r)
        if (ball) {
          const sp = Math.hypot(pr.vx, pr.vz)
          if (sp > 0.05) this.tmpV.set(pr.vz / sp, 0, -pr.vx / sp)
          ball.quaternion.setFromAxisAngle(this.tmpV, pr.rot)
        }
        this.flash(v.mats, 0xffffff, pr.hitFlash > 0 ? 0.7 : 0)
        continue
      }
      if (pr.kind === 'bigmilk') {
        const milk = v.getObjectByName('milk') as THREE.Mesh | undefined
        if (milk) {
          milk.scale.y = Math.max(0.02, s.milk)
          milk.position.y = 0.03 + 0.95 * Math.max(0.02, s.milk)
        }
        v.rotation.set(0, 0, 0)
        v.scale.setScalar(1)
        continue
      }
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
      const pn = pv?.npcs.get(n.id)
      if (pn) v.position.set(pn.x + (n.x - pn.x) * a, 0, pn.z + (n.z - pn.z) * a)
      else v.position.set(n.x, 0, n.z)
      v.rotation.y = n.facing
      if (n.scale !== 1) v.scale.setScalar(n.scale)
      const sp = Math.hypot(n.vx, n.vz)
      const bob = Math.abs(Math.sin(this.time * (n.kind === 'dog' ? 16 : 11) + n.id)) * Math.min(1, sp / 2) * 0.12
      v.body.position.y = bob
      v.body.rotation.z = n.state === 'stunned' ? 0.5 : Math.sin(this.time * 12 + n.id) * 0.1 * Math.min(1, sp / 2)
      v.body.rotation.x = n.state === 'flee' ? -0.25 : n.state === 'chase' ? 0.2 : 0
      const eyeScale = n.state === 'flee' || n.state === 'stunned' ? 1.6 : 1
      v.eyes.scale.setScalar(eyeScale)
      const hat = v.getObjectByName('partyhat')
      if (hat) hat.visible = n.state === 'follow'
      const cov = v.getObjectByName('cover') as THREE.Mesh | undefined
      if (cov) {
        const c = Math.min(1, n.cover)
        ;(cov.material as THREE.MeshToonMaterial).opacity = c * 0.95
        cov.scale.setScalar(0.9 + c * 0.35 + Math.max(0, n.cover - 1) * 0.15)
        if (n.cover >= 0.95) v.body.rotation.z = Math.sin(this.time * 40) * 0.04
      }
      if (n.state === 'follow') v.body.rotation.z = Math.sin(this.time * 10 + n.id) * 0.25
      let zzz = v.getObjectByName('zzz') as THREE.Sprite | undefined
      if (n.state === 'sleep') {
        v.body.rotation.z = 1.35
        v.body.rotation.x = 0
        v.body.position.y = -0.1
        if (!zzz) {
          zzz = this.promptSprite('💤')
          zzz.name = 'zzz'
          zzz.position.y = 1.2
          v.add(zzz)
        }
        zzz.visible = true
        zzz.position.y = 1.0 + Math.sin(this.time * 3 + n.id) * 0.2
      } else if (zzz) zzz.visible = false
      if (n.kind === 'jelly') {
        v.body.position.y = 0.05 + Math.sin(this.time * 2.2 + n.id) * 0.12
        v.body.rotation.x = 0
        let ti = 0
        for (const c of v.body.children) {
          if (c.name !== 'tentacle') continue
          c.rotation.x = Math.sin(this.time * 3 + ti) * 0.35
          c.rotation.z = Math.cos(this.time * 2.5 + ti * 1.3) * 0.35
          ti++
        }
      } else if (n.kind === 'fly' || n.kind === 'bigfly') {
        v.body.position.y = Math.sin(this.time * 9 + n.id) * 0.2
        const flap = Math.sin(this.time * 60 + n.id) * 0.8
        const wl = v.body.getObjectByName('wingL')
        const wr = v.body.getObjectByName('wingR')
        if (wl) wl.rotation.y = flap
        if (wr) wr.rotation.y = -flap
      }
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
      const pq = pv?.poops.get(q.id)
      if (pq) m.position.set(pq.x + (q.x - pq.x) * a, pq.y + (q.y - pq.y) * a, pq.z + (q.z - pq.z) * a)
      else m.position.set(q.x, q.y, q.z)
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

    this.syncGoalViews(s, dt)

    // boss
    if (s.boss && s.boss.def.fight !== 'nest') {
      void this.ensureBoss(s.boss)
      const b = s.boss
      const bv = this.boss
      if (bv) {
        const pb = pv?.boss
        if (pb) bv.group.position.set(pb.x + (b.x - pb.x) * a, pb.y + (b.y - pb.y) * a, pb.z + (b.z - pb.z) * a)
        else bv.group.position.set(b.x, b.y, b.z)
        const camYaw = Math.atan2(this.camera.position.x - b.x, this.camera.position.z - b.z)
        bv.group.rotation.y = camYaw
        const ph = bossPhase(b)
        const fight = fightOf(b)
        const part = b.state === 'enter' ? null : activePart(b)
        const partKey = part ? part.def.kind : ''
        if (partKey !== bv.partKey) {
          bv.partKey = partKey
          void this.setBossCard(b.def.id, b.def.drawing, part?.def.uv, part ? part.def.scale : b.def.scale)
        }
        const hidden = part?.def.weakness === 'hidden'
        let activeModel: PartView | null = null
        for (const pv of bv.parts) {
          const pt = b.parts[pv.idx]
          const isActive = part === pt
          if (isActive && pv.mats) {
            // a 3D animal steps up: it rides the boss group and takes the boss poses below
            if (pv.obj.parent !== bv.group) bv.group.add(pv.obj)
            pv.obj.position.set(0, 0, 0)
            pv.obj.visible = b.state !== 'enter'
            activeModel = pv
            continue
          }
          if (pv.obj.parent !== this.scene) this.scene.add(pv.obj)
          pv.obj.visible = !isActive && b.state !== 'enter'
          if (!pv.obj.visible) continue
          const faceY = pv.card ? Math.atan2(this.camera.position.x - pt.x, this.camera.position.z - pt.z) : Math.atan2(p.x - pt.x, p.z - pt.z)
          if (pt.done) {
            pv.fall = Math.min(1, pv.fall + dt * 2.5)
            pv.obj.position.set(pt.x, pv.card ? 0.06 + (1 - pv.fall) * pv.h * 0.5 : 0.05, pt.z)
            pv.obj.rotation.set(pv.card ? -1.45 * pv.fall : 0, faceY, pv.card ? 0 : -1.5 * pv.fall)
            if (pv.card) {
              const m = pv.card.material as THREE.MeshBasicMaterial
              m.color.setScalar(1 - pv.fall * 0.45)
              m.opacity = 1
            } else this.flash(pv.mats!, 0x000000, pv.fall * 0.4)
          } else {
            const bob = Math.sin(this.time * 2.2 + pv.idx) * 0.06
            pv.obj.position.set(pt.x, pv.card ? pv.h / 2 + bob : Math.max(0, bob), pt.z)
            pv.obj.rotation.set(0, faceY, Math.sin(this.time * 2.5 + pv.idx * 2) * 0.06)
            if (pv.card) {
              const m = pv.card.material as THREE.MeshBasicMaterial
              m.color.setScalar(1)
              m.opacity = 1
            } else this.flash(pv.mats!, 0x000000, 0)
          }
        }
        bv.card.visible = !bv.model && !activeModel
        bv.overlay.visible = bv.card.visible
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
        if (fight === 'horse' && b.state === 'hurt') tilt = -0.9 // thrown off the horse
        if ((fight === 'horse' || (fight === 'group' && part?.def.kind === 'rhino')) && b.state === 'exposed') tilt = 1.15 // flat out
        const cm = bv.card.material as THREE.MeshBasicMaterial
        if (hidden) {
          // the rockfish: a flat card on the ground, faint until Kase is close, a poop lands near, or it stings
          tilt = 1.5
          const near = Math.hypot(p.x - b.x, p.z - b.z) < 3
          cm.opacity = b.hitFlash > 0 ? 1 : near ? 0.75 : 0.3
          wob = near ? Math.sin(this.time * 18) * 0.12 : 0
          sy = 1
          sx = 1
        } else if (cm.opacity < 1) {
          cm.opacity = 1
        }
        const posed: { obj: THREE.Object3D; mats: THREE.Material[] } | null = bv.model ? { obj: bv.model, mats: bv.model.mats } : activeModel ? { obj: activeModel.obj, mats: activeModel.mats! } : null
        if (posed) {
          const mo = posed.obj
          if (hidden) {
            // the rockfish lies low and fades until Kase is close, a poop lands near, or it stings
            const near = Math.hypot(p.x - b.x, p.z - b.z) < 3
            mo.rotation.set(0, b.facing, near ? Math.sin(this.time * 18) * 0.08 : 0)
            mo.scale.set(1, 1, 1)
            mo.position.y = 0
            const op = b.hitFlash > 0 ? 1 : near ? 0.85 : 0.35
            for (const m of posed.mats) {
              const mm = m as THREE.MeshToonMaterial
              mm.transparent = true
              mm.opacity = op
            }
            this.flash(posed.mats, 0xffffff, b.hitFlash > 0 ? 0.6 : 0)
          } else {
            mo.rotation.set(-tilt * 0.6, b.facing, wob)
            mo.scale.set(sx, sy, sx)
            mo.position.y = b.state === 'attack' && b.attack === 'stomp' && (fight === 'charge' || fight === 'stomper') ? Math.max(0, b.stateT) * 3 : 0
            const walking = Math.hypot(b.vx, b.vz) > 0.3
            const legL = mo.getObjectByName('legL')
            const legR = mo.getObjectByName('legR')
            const step = walking ? Math.sin(this.time * 9) * 0.5 : 0
            if (legL) legL.rotation.x = step
            if (legR) legR.rotation.x = -step
            const gl = mo.getObjectByName('gloveL')
            const gr = mo.getObjectByName('gloveR')
            if (gl && gr) {
              const punch = b.state === 'attack' ? Math.sin(this.time * 24) * 0.5 : 0
              gl.position.z = 0.5 + Math.max(0, punch)
              gr.position.z = 0.5 + Math.max(0, -punch)
            }
            this.flash(posed.mats, 0xffffff, b.hitFlash > 0 ? 0.7 : b.state === 'telegraph' ? 0.25 + Math.sin(this.time * 30) * 0.2 : 0)
            if (b.state === 'telegraph') mo.rotation.z = Math.sin(this.time * 40) * 0.05
          }
        }
        bv.card.rotation.z = wob
        bv.card.rotation.x = -tilt
        bv.overlay.rotation.copy(bv.card.rotation)
        bv.card.scale.set(sx, sy, 1)
        bv.overlay.scale.copy(bv.card.scale)
        bv.card.position.y = hidden ? 0.08 : (bv.h / 2) * sy + (b.state === 'attack' && b.attack === 'stomp' && (fight === 'charge' || fight === 'stomper') ? Math.max(0, b.stateT) * 3 : 0)
        bv.overlay.position.y = bv.card.position.y
        const om = bv.overlay.material as THREE.MeshBasicMaterial
        om.opacity = hidden ? (b.hitFlash > 0 ? 0.5 : 0) : b.state === 'telegraph' ? 0.25 + Math.sin(this.time * 30) * 0.2 : b.hitFlash > 0 ? 0.6 : b.state === 'phaseChange' ? 0.3 : 0
        om.color.set(b.hitFlash > 0 ? 0xffffff : 0xff3030)
        const rm = bv.ring.material as THREE.MeshBasicMaterial
        const open = b.state === 'exposed' && (fight === 'charge' || fight === 'horse' || fight === 'runner' || part?.def.weakness === 'wall')
        rm.opacity = open ? 0.55 + Math.sin(this.time * 10) * 0.3 : 0
        bv.ring.scale.setScalar(open ? 1 + Math.sin(this.time * 10) * 0.1 : 1)
      }
    } else {
      this.removeBoss()
    }

    for (let i = this.prompts.length - 1; i >= 0; i--) {
      const pr = this.prompts[i]
      pr.life -= dt
      pr.sprite.position.y += dt * 1.2
      ;(pr.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, pr.life * 2)
      if (pr.life <= 0) {
        this.scene.remove(pr.sprite)
        this.prompts.splice(i, 1)
      }
    }
    const wantTrack = !!s.boss && s.boss.state !== 'enter' && (fightOf(s.boss) === 'runner' || (fightOf(s.boss) === 'games' && activePart(s.boss)?.def.kind === 'emu'))
    if (wantTrack && s.bossRing && !this.track) {
      const ring = s.bossRing
      const geo = new THREE.RingGeometry(ring.r - 2.3, ring.r - 0.5, 48)
      geo.rotateX(-Math.PI / 2)
      this.track = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x333344, transparent: true, opacity: 0.35, depthWrite: false }))
      this.track.position.set(ring.x, 0.04, ring.z)
      this.scene.add(this.track)
    }
    if (this.track && (!s.boss || s.phase !== 'boss' || !wantTrack)) {
      this.scene.remove(this.track)
      this.track = null
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

  // Predicted poop path for the current hold, same numbers as the sim.
  private updateArc(s: State, px: number, py: number, pz: number, pf: number) {
    const p = s.player
    const power = p.fedora ? 1 : p.aimPower >= 0 ? p.aimPower : Math.min(1, p.poopHoldT / 0.5)
    const speed = 10 + 7 * power
    let x = px + Math.sin(pf) * 0.5
    let y = py + 0.8
    let z = pz + Math.cos(pf) * 0.5
    let vx = Math.sin(pf) * speed + p.vx * 0.4
    let vy = p.flying && !p.grounded ? p.vy * 0.4 + 2.5 : 5 + 2.5 * power
    let vz = Math.cos(pf) * speed + p.vz * 0.4
    const pos = this.arc.geometry.getAttribute('position') as THREE.BufferAttribute
    const step = 1 / 30
    let last = new THREE.Vector3(x, y, z)
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, x, y, z)
      last = new THREE.Vector3(x, y, z)
      for (let k = 0; k < 2; k++) {
        vy -= 22 * step
        x += vx * step
        y += vy * step
        z += vz * step
      }
      if (y < 0) {
        for (let j = i + 1; j < pos.count; j++) pos.setXYZ(j, last.x, 0.03, last.z)
        this.landing.position.set(last.x, 0.04, last.z)
        break
      }
      if (i === pos.count - 1) this.landing.position.set(x, Math.max(0.04, y), z)
    }
    pos.needsUpdate = true
    this.arc.computeLineDistances()
  }

  private updateCamera(s: State, dt: number) {
    const p = s.player
    const portrait = this.camera.aspect < 1
    const skyClose = this.skyCam ? 0.8 : 1
    // the snowball level: the camera eases out as the ball grows so the scale reads (Katamari rule)
    const ball = s.goal.kind === 'grow' ? s.props.find((pr) => pr.kind === 'snowball' && !pr.broken) : undefined
    const grow = ball ? Math.max(0, ball.r - 0.55) * 1.6 : 0
    const back = ((portrait ? 10.5 : 9) + this.bossMode * 3 + (this.giantScale - 1) * 3 + grow) * skyClose
    const up = ((portrait ? 12 : 8.5) + this.bossMode * 2.5 + (this.giantScale - 1) * 3 + grow * 0.8) * (this.skyCam ? 0.7 : 1)
    const lookAhead = 0.35
    let tx = p.x + p.vx * lookAhead
    let tz = p.z + p.vz * lookAhead
    if (s.boss && s.phase === 'boss') {
      tx = (tx * 2 + s.boss.x) / 3
      tz = (tz * 2 + s.boss.z) / 3
    }
    const yf = this.skyCam ? 1 : 0.7
    this.camTarget.lerp(this.tmpV.set(tx, 0.8 + p.y * yf, tz), Math.min(1, 6 * dt))
    const want = this.tmpS.set(this.camTarget.x, up + p.y * yf, this.camTarget.z + back)
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

  // Screen point -> world point on the horizontal plane at height y (for mouse aim).
  groundPoint(sx: number, sy: number, y: number): { x: number; z: number } | null {
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1)
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, this.camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y)
    const hit = new THREE.Vector3()
    if (!ray.ray.intersectPlane(plane, hit)) return null
    return { x: hit.x, z: hit.z }
  }

  project(x: number, y: number, z: number): { x: number; y: number } {
    const v = this.tmpV.set(x, y, z).project(this.camera)
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight }
  }

  render() {
    this.gl.render(this.scene, this.camera)
  }
}
